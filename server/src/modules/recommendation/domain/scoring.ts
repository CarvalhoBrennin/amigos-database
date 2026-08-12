import type {
    CandidateDecisionData,
    ParticipantGameAssignment,
    ScoreBreakdown,
} from '../../../../../shared/index.js';
import type { DecisionContext } from './types.js';

export const SCORE_WEIGHTS = {
    preference: 40,
    access: 25,
    session: 15,
    price: 10,
    novelty: 10,
} as const;

const accessValue = {
    OWNED: 1,
    SUBSCRIPTION_DOWNLOAD: 0.95,
    FREE_TO_PLAY: 0.95,
    PURCHASE_REQUIRED: 0.55,
    UNKNOWN: 0,
} as const;

export function scoreCandidate(
    context: DecisionContext,
    candidate: CandidateDecisionData,
    assignment: ParticipantGameAssignment[]
): { baseScore: number; breakdown: ScoreBreakdown } {
    const preference = preferenceScore(context, candidate);
    const access = average(assignment.map((item) => accessValue[item.accessKind]), 0);
    const session = sessionScore(context, candidate);
    const price = priceScore(context, assignment);
    const history = context.history.find((entry) => entry.gameId === candidate.gameId);
    const novelty = history?.disposition === 'PLAYED' ? 0.25 : 1;

    const breakdown: ScoreBreakdown = {
        preference: dimension(preference, SCORE_WEIGHTS.preference, [
            preference === 0.75 ? 'PREFERENCE_NEUTRAL_NO_INPUT' : 'PREFERENCE_ALIGNMENT',
        ]),
        access: dimension(access, SCORE_WEIGHTS.access, ['ACCESS_CONVENIENCE']),
        session: dimension(session, SCORE_WEIGHTS.session, ['SESSION_FIT']),
        price: dimension(price, SCORE_WEIGHTS.price, ['PRICE_CONVENIENCE']),
        novelty: dimension(novelty, SCORE_WEIGHTS.novelty, [
            novelty < 1 ? 'PREVIOUSLY_PLAYED_PENALTY' : 'NOVELTY_FULL',
        ]),
    };
    const baseScore = round2(Object.values(breakdown).reduce((sum, item) => sum + item.points, 0));
    return { baseScore: clamp(baseScore, 0, 100), breakdown };
}

export function axisSimilarity(target: number, value: number): number {
    return clamp(1 - Math.abs(target - value) / 10, 0, 1);
}

export function normalizeAvailableWeights<T extends string>(
    weights: Record<T, number>,
    availability: Record<T, boolean>
): Record<T, number> {
    const availableTotal = (Object.keys(weights) as T[])
        .filter((key) => availability[key])
        .reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
    return Object.fromEntries((Object.keys(weights) as T[]).map((key) => [
        key,
        availableTotal > 0 && availability[key] ? Math.max(0, weights[key]) / availableTotal : 0,
    ])) as Record<T, number>;
}

function preferenceScore(context: DecisionContext, candidate: CandidateDecisionData): number {
    const axes = ['communication', 'skill', 'chaos', 'strategy', 'story'] as const;
    const participantScores = context.participants.flatMap((participant) => {
        const similarities = axes.flatMap((axis) => {
            const target = participant.preferences[axis];
            const value = candidate.profile[axis];
            return target === null || value === null ? [] : [axisSimilarity(target, value)];
        });
        return similarities.length > 0 ? [average(similarities, 0.75)] : [];
    });
    return participantScores.length > 0 ? average(participantScores, 0.75) : 0.75;
}

function sessionScore(context: DecisionContext, candidate: CandidateDecisionData): number {
    const limit = context.room.constraints.maxSessionMinutes;
    const maximum = candidate.profile.maxSessionMinutes;
    if (limit === null || maximum === null) return 1;
    if (maximum <= limit) return 1;
    return clamp(limit / maximum, 0, 1);
}

function priceScore(context: DecisionContext, assignment: ParticipantGameAssignment[]): number {
    const purchases = assignment.filter((item) => item.accessKind === 'PURCHASE_REQUIRED');
    if (purchases.length === 0) return 1;
    const spend = purchases.reduce((sum, item) => sum + (item.amountMinor ?? 0), 0);
    const groupLimit = context.room.constraints.maxGroupSpendMinor;
    if (groupLimit !== null && groupLimit > 0) {
        return clamp(1 - (spend / groupLimit) * 0.7, 0.3, 1);
    }
    const perPersonLimit = context.room.constraints.maxPricePerPersonMinor;
    if (perPersonLimit !== null && perPersonLimit > 0) {
        const averageSpend = spend / purchases.length;
        return clamp(1 - (averageSpend / perPersonLimit) * 0.7, 0.3, 1);
    }
    return clamp(1 / (1 + spend / 10_000), 0.3, 0.9);
}

function dimension(value: number, max: number, reasons: string[]): ScoreBreakdown['preference'] {
    return { points: round2(clamp(value, 0, 1) * max), max, reasons };
}

function average(values: number[], fallback: number): number {
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : fallback;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
