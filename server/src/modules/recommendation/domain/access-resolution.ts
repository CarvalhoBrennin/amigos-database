import type {
    CandidateDecisionData,
    DecisionParticipant,
    GamePlatformOffering,
    ParticipantGameAssignment,
    WarningReason,
} from '../../../../../shared/index.js';
import type { DecisionContext } from './types.js';
import { isTemporallyActive } from './validity.js';

export interface AccessResolution {
    access: Omit<ParticipantGameAssignment, 'participantId' | 'platformCode' | 'onlineMultiplayer'>;
    warnings: WarningReason[];
    confidenceRank: number;
}

const priceQualityRank = {
    VERIFIED_LOCAL: 0,
    PROVIDER_ESTIMATE: 1,
    LEGACY_STATIC: 2,
} as const;

export function resolveAccess(
    participant: DecisionParticipant,
    candidate: CandidateDecisionData,
    offering: GamePlatformOffering,
    context: DecisionContext
): AccessResolution {
    const platformCode = offering.platformCode;
    if (participant.ownedGames.some((owned) => (
        owned.gameId === candidate.gameId && owned.platformCode === platformCode
    ))) {
        return result('OWNED', null, null, null, null, [], 0);
    }

    const subscription = candidate.subscriptionAvailability.find((availability) => (
        availability.platformCode === platformCode
        && availability.regionCode === context.room.regionCode
        && availability.accessType === 'DOWNLOAD'
        && availability.verificationStatus === 'VERIFIED'
        && isTemporallyActive(availability, context.now)
        && participant.subscriptions.some((declared) => (
            declared.planCode === availability.planCode
            && declared.regionCode === context.room.regionCode
            && declared.capabilities.gameCatalogDownload
        ))
    ));
    if (subscription) {
        return result('SUBSCRIPTION_DOWNLOAD', subscription.planCode, null, null, null, [], 0);
    }

    if (offering.freeToPlay && offering.verificationStatus === 'VERIFIED') {
        return result('FREE_TO_PLAY', null, 0, null, null, [], 0);
    }

    const prices = candidate.prices
        .filter((price) => (
            price.platformCode === platformCode
            && price.regionCode === context.room.regionCode
            && new Date(price.observedAt).getTime() <= context.now.getTime()
            && (!price.validUntil || new Date(price.validUntil).getTime() >= context.now.getTime())
        ))
        .sort((left, right) => (
            priceQualityRank[left.quality] - priceQualityRank[right.quality]
            || new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime()
            || left.amountMinor - right.amountMinor
            || left.storeCode.localeCompare(right.storeCode)
        ));
    const price = prices[0];
    if (price) {
        const warning: WarningReason[] = price.quality === 'PROVIDER_ESTIMATE'
            ? ['PRICE_ESTIMATE_ONLY']
            : price.quality === 'LEGACY_STATIC'
                ? ['LEGACY_PRICE_ONLY']
                : [];
        return result(
            'PURCHASE_REQUIRED',
            null,
            price.amountMinor,
            price.currency,
            price.quality,
            warning,
            priceQualityRank[price.quality]
        );
    }

    return result('UNKNOWN', null, null, null, null, ['ACCESS_UNKNOWN'], 3);
}

function result(
    accessKind: AccessResolution['access']['accessKind'],
    subscriptionPlanCode: string | null,
    amountMinor: number | null,
    currency: string | null,
    priceQuality: AccessResolution['access']['priceQuality'],
    warnings: WarningReason[],
    confidenceRank: number
): AccessResolution {
    return {
        access: { accessKind, subscriptionPlanCode, amountMinor, currency, priceQuality },
        warnings,
        confidenceRank,
    };
}
