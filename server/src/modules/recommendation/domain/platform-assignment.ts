import type {
    CandidateDecisionData,
    DecisionParticipant,
    GamePlatformOffering,
    OnlineMultiplayerResolution,
    ParticipantGameAssignment,
    RejectionReason,
} from '../../../../../shared/index.js';
import { resolveAccess } from './access-resolution.js';
import type { AssignmentOption, AssignmentSearchResult, DecisionContext } from './types.js';
import { isRegionCompatible, isTemporallyActive } from './validity.js';

const consoleFamilies = new Set(['XBOX', 'PS', 'NINTENDO']);
const pcTierRank = { LOW: 1, MID: 2, HIGH: 3 } as const;
// Keep a malformed or unusually duplicated decision-data import from causing a Cartesian DoS.
const MAX_OPTIONS_PER_PARTICIPANT = 32;
const MAX_SEARCH_NODES_PER_POOL = 100_000;

export function findBestPlatformAssignment(
    context: DecisionContext,
    candidate: CandidateDecisionData
): AssignmentSearchResult {
    const strict = context.room.constraints.requireVerifiedCompatibility;
    const offerings = candidate.offerings.filter((offering) => (
        offering.onlineSupported
        && isRegionCompatible(offering.regionCode, context.room.regionCode)
        && isTemporallyActive(offering, context.now)
        && (!strict || offering.verificationStatus === 'VERIFIED')
    ));
    if (context.participants.some((participant) => !participant.platforms.some((platform) => (
        offerings.some((offering) => offering.platformCode === platform)
    )))) {
        return rejected('NO_PLATFORM_ASSIGNMENT');
    }

    const pools = candidate.networkPools.filter((pool) => (
        isRegionCompatible(pool.regionCode, context.room.regionCode)
        && isTemporallyActive(pool, context.now)
        && (!strict || pool.verificationStatus === 'VERIFIED')
    ));
    if (pools.length === 0) {
        return rejected('NO_COMMON_NETWORK_POOL');
    }

    const viablePools: AssignmentSearchResult[] = [];
    const aggregateRejections = new Set<RejectionReason>();
    for (const pool of pools) {
        const optionsByParticipant: AssignmentOption[][] = [];
        let poolViable = true;
        for (const participant of context.participants) {
            const options = offerings
                .filter((offering) => (
                    pool.platforms.includes(offering.platformCode)
                    && participant.platforms.includes(offering.platformCode)
                ))
                .map((offering) => buildOption(participant, offering, candidate, context))
                .filter((option) => {
                    option.rejectionReasons.forEach((reason) => aggregateRejections.add(reason));
                    return option.rejectionReasons.length === 0;
                })
                .sort(compareOptions);
            const boundedOptions = reduceDominatedOptions(options).slice(0, MAX_OPTIONS_PER_PARTICIPANT);
            const best = boundedOptions[0];
            if (!best) {
                poolViable = false;
                break;
            }
            optionsByParticipant.push(boundedOptions);
        }
        if (!poolViable) continue;
        const bestCombination = searchBestCombination(optionsByParticipant, context, aggregateRejections);
        if (bestCombination) {
            viablePools.push(bestCombination);
        }
    }

    if (viablePools.length === 0) {
        const reasons = [...aggregateRejections];
        return {
            ...rejected(reasons[0] ?? 'NO_COMMON_NETWORK_POOL'),
            rejectionReasons: reasons.length ? reasons : ['NO_COMMON_NETWORK_POOL'],
        };
    }
    viablePools.sort(compareCombinations);
    return viablePools[0] as AssignmentSearchResult;
}

function buildOption(
    participant: DecisionParticipant,
    offering: GamePlatformOffering,
    candidate: CandidateDecisionData,
    context: DecisionContext
): AssignmentOption {
    const access = resolveAccess(participant, candidate, offering, context);
    const onlineMultiplayer = resolveOnlineMultiplayer(participant, offering, context);
    const rejectionReasons: RejectionReason[] = [];
    if (onlineMultiplayer.kind === 'MISSING_REQUIRED_SUBSCRIPTION') {
        rejectionReasons.push('ONLINE_MULTIPLAYER_SUBSCRIPTION_REQUIRED');
    }
    if (onlineMultiplayer.kind === 'UNKNOWN_REQUIREMENT'
        && context.room.constraints.requireVerifiedCompatibility) {
        rejectionReasons.push('ONLINE_MULTIPLAYER_REQUIREMENT_UNKNOWN');
    }
    if (access.access.accessKind === 'UNKNOWN'
        && context.room.constraints.requireVerifiedCompatibility) {
        rejectionReasons.push('INSUFFICIENT_DECISION_DATA');
    }
    if (context.room.constraints.accessPolicy === 'NO_PURCHASE_REQUIRED'
        && ['PURCHASE_REQUIRED', 'UNKNOWN'].includes(access.access.accessKind)) {
        rejectionReasons.push('NO_PURCHASE_REQUIRED_NOT_SATISFIED');
    }
    if (candidate.profile.minPcTier && offering.platformCode.startsWith('PC_')) {
        if (!participant.pcTier) {
            if (context.room.constraints.requireVerifiedCompatibility) {
                rejectionReasons.push('INSUFFICIENT_DECISION_DATA');
            }
            access.warnings.push('PC_REQUIREMENTS_UNKNOWN');
        } else if (pcTierRank[participant.pcTier] < pcTierRank[candidate.profile.minPcTier]) {
            rejectionReasons.push('PC_REQUIREMENTS_NOT_MET');
        }
    }
    return {
        assignment: {
            participantId: participant.id,
            platformCode: offering.platformCode,
            ...access.access,
            onlineMultiplayer,
        },
        rejectionReasons: [...new Set(rejectionReasons)],
        warnings: [...new Set([
            ...access.warnings,
            ...(offering.verificationStatus === 'VERIFIED' ? [] : ['PARTIAL_DECISION_DATA' as const]),
        ])],
        confidenceRank: Math.max(
            access.confidenceRank,
            offering.verificationStatus === 'VERIFIED' ? 0 : 2,
            offering.onlineRequirementVerificationStatus === 'VERIFIED' ? 0 : 2
        ),
    };
}

function resolveOnlineMultiplayer(
    participant: DecisionParticipant,
    offering: GamePlatformOffering,
    context: DecisionContext
): OnlineMultiplayerResolution {
    const isConsole = [...consoleFamilies].some((prefix) => offering.platformCode.startsWith(prefix));
    if (!isConsole || offering.requiresPaidOnlineSubscription === false) {
        return { kind: 'NOT_REQUIRED' };
    }
    if (offering.requiresPaidOnlineSubscription === null
        || offering.onlineRequirementVerificationStatus !== 'VERIFIED') {
        return { kind: 'UNKNOWN_REQUIREMENT' };
    }
    const plan = participant.subscriptions.find((subscription) => (
        subscription.regionCode === context.room.regionCode
        && subscription.capabilities.onlineMultiplayer
    ));
    return plan
        ? { kind: 'INCLUDED_BY_SUBSCRIPTION', planCode: plan.planCode }
        : { kind: 'MISSING_REQUIRED_SUBSCRIPTION' };
}

function evaluateCombination(options: AssignmentOption[], context: DecisionContext): AssignmentSearchResult {
    const assignment = options.map((option) => option.assignment);
    const rejections: RejectionReason[] = [];
    const purchases = assignment.filter((item) => item.accessKind === 'PURCHASE_REQUIRED');
    const unknownPurchase = purchases.some((item) => item.amountMinor === null || item.currency === null);
    const nonVerifiedPrice = purchases.some((item) => item.priceQuality !== 'VERIFIED_LOCAL');
    if (context.room.constraints.budgetMode === 'STRICT' && (unknownPurchase || nonVerifiedPrice)) {
        rejections.push('PRICE_UNKNOWN_FOR_STRICT_BUDGET');
    }
    const perPersonLimit = context.room.constraints.maxPricePerPersonMinor;
    if (perPersonLimit !== null && purchases.some((item) => (item.amountMinor ?? Number.POSITIVE_INFINITY) > perPersonLimit)) {
        rejections.push('PER_PERSON_BUDGET_EXCEEDED');
    }
    const currencies = new Set(purchases.map((item) => item.currency).filter((currency): currency is string => Boolean(currency)));
    if (currencies.size > 1) {
        rejections.push('INSUFFICIENT_DECISION_DATA');
    }
    const spendKnown = assignment.every((item) => item.accessKind !== 'UNKNOWN' && (
        item.accessKind !== 'PURCHASE_REQUIRED' || item.amountMinor !== null
    ));
    const groupSpendMinor = spendKnown
        ? purchases.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0)
        : null;
    const groupLimit = context.room.constraints.maxGroupSpendMinor;
    if (groupLimit !== null && (groupSpendMinor === null || groupSpendMinor > groupLimit)) {
        rejections.push(groupSpendMinor === null ? 'PRICE_UNKNOWN_FOR_STRICT_BUDGET' : 'GROUP_BUDGET_EXCEEDED');
    }
    return {
        assignment,
        rejectionReasons: [...new Set(rejections)],
        warnings: [...new Set(options.flatMap((option) => option.warnings))],
        groupSpendMinor,
        currency: currencies.values().next().value ?? (purchases.length === 0 ? null : null),
        confidenceRank: Math.max(0, ...options.map((option) => option.confidenceRank)),
    };
}

function compareOptions(left: AssignmentOption, right: AssignmentOption): number {
    return accessPurchaseRank(left.assignment) - accessPurchaseRank(right.assignment)
        || (left.assignment.amountMinor ?? 0) - (right.assignment.amountMinor ?? 0)
        || accessConvenienceRank(left.assignment) - accessConvenienceRank(right.assignment)
        || left.confidenceRank - right.confidenceRank
        || left.assignment.platformCode.localeCompare(right.assignment.platformCode);
}

function compareCombinations(left: AssignmentSearchResult, right: AssignmentSearchResult): number {
    return purchaseCount(left.assignment) - purchaseCount(right.assignment)
        || (left.groupSpendMinor ?? Number.POSITIVE_INFINITY) - (right.groupSpendMinor ?? Number.POSITIVE_INFINITY)
        || convenientCount(right.assignment) - convenientCount(left.assignment)
        || left.confidenceRank - right.confidenceRank
        || platformKey(left.assignment).localeCompare(platformKey(right.assignment));
}

function purchaseCount(items: ParticipantGameAssignment[]): number {
    return items.filter((item) => item.accessKind === 'PURCHASE_REQUIRED').length;
}

function convenientCount(items: ParticipantGameAssignment[]): number {
    return items.filter((item) => ['OWNED', 'SUBSCRIPTION_DOWNLOAD'].includes(item.accessKind)).length;
}

function accessPurchaseRank(item: ParticipantGameAssignment): number {
    if (item.accessKind === 'PURCHASE_REQUIRED') return 1;
    if (item.accessKind === 'UNKNOWN') return 2;
    return 0;
}

function accessConvenienceRank(item: ParticipantGameAssignment): number {
    if (item.accessKind === 'OWNED') return 0;
    if (item.accessKind === 'SUBSCRIPTION_DOWNLOAD') return 1;
    if (item.accessKind === 'FREE_TO_PLAY') return 2;
    if (item.accessKind === 'PURCHASE_REQUIRED') return 3;
    return 4;
}

function platformKey(items: ParticipantGameAssignment[]): string {
    return items.map((item) => item.platformCode).sort().join(':');
}

function rejected(reason: RejectionReason): AssignmentSearchResult {
    return {
        assignment: [],
        rejectionReasons: [reason],
        warnings: [],
        groupSpendMinor: null,
        currency: null,
        confidenceRank: 3,
    };
}

function searchBestCombination(
    optionsByParticipant: AssignmentOption[][],
    context: DecisionContext,
    aggregateRejections: Set<RejectionReason>
): AssignmentSearchResult | null {
    let best: AssignmentSearchResult | null = null;
    const chosen: AssignmentOption[] = [];
    let visitedNodes = 0;

    const visit = (index: number, currency: string | null, spend: number): void => {
        if (visitedNodes >= MAX_SEARCH_NODES_PER_POOL) {
            return;
        }
        visitedNodes += 1;
        if (index === optionsByParticipant.length) {
            const combination = evaluateCombination(chosen, context);
            combination.rejectionReasons.forEach((reason) => aggregateRejections.add(reason));
            if (combination.rejectionReasons.length === 0
                && (!best || compareCombinations(combination, best) < 0)) {
                best = combination;
            }
            return;
        }

        for (const option of optionsByParticipant[index] ?? []) {
            const assignment = option.assignment;
            option.rejectionReasons.forEach((reason) => aggregateRejections.add(reason));

            if (context.room.constraints.accessPolicy === 'NO_PURCHASE_REQUIRED'
                && ['PURCHASE_REQUIRED', 'UNKNOWN'].includes(assignment.accessKind)) {
                aggregateRejections.add('NO_PURCHASE_REQUIRED_NOT_SATISFIED');
                continue;
            }
            if (assignment.accessKind === 'PURCHASE_REQUIRED') {
                if (context.room.constraints.maxPricePerPersonMinor !== null
                    && (assignment.amountMinor === null
                        || assignment.amountMinor > context.room.constraints.maxPricePerPersonMinor)) {
                    aggregateRejections.add('PER_PERSON_BUDGET_EXCEEDED');
                    continue;
                }
                if (context.room.constraints.budgetMode === 'STRICT'
                    && assignment.priceQuality !== 'VERIFIED_LOCAL') {
                    aggregateRejections.add('PRICE_UNKNOWN_FOR_STRICT_BUDGET');
                    continue;
                }
            }
            if (assignment.currency !== null && currency !== null && assignment.currency !== currency) {
                aggregateRejections.add('INSUFFICIENT_DECISION_DATA');
                continue;
            }

            const nextSpend = spend + (assignment.amountMinor ?? 0);
            if (context.room.constraints.maxGroupSpendMinor !== null
                && nextSpend > context.room.constraints.maxGroupSpendMinor) {
                aggregateRejections.add('GROUP_BUDGET_EXCEEDED');
                continue;
            }

            chosen.push(option);
            visit(index + 1, currency ?? assignment.currency, nextSpend);
            chosen.pop();
        }
    };

    visit(0, null, 0);
    return best;
}

function reduceDominatedOptions(options: AssignmentOption[]): AssignmentOption[] {
    const bestByShape = new Map<string, AssignmentOption>();
    for (const option of options) {
        const assignment = option.assignment;
        const key = [
            assignment.platformCode,
            assignment.accessKind,
            assignment.subscriptionPlanCode ?? '',
            assignment.currency ?? '',
        ].join('|');
        const current = bestByShape.get(key);
        if (!current || compareOptions(option, current) < 0) {
            bestByShape.set(key, option);
        }
    }
    return [...bestByShape.values()].sort(compareOptions);
}
