import type { MatchKind, VoteValue } from '../../../../../shared/index.js';

export interface ClassifiedMatch {
    kind: MatchKind;
    matchScore: number;
    yesCount: number;
    maybeCount: number;
}

const voteValue = { NO: 0, MAYBE: 0.5, YES: 1 } as const;

export function classifyMatch(
    votes: VoteValue[],
    participantCount: number,
    baseScore: number
): ClassifiedMatch | null {
    if (votes.length !== participantCount || participantCount < 1) {
        return null;
    }
    const yesCount = votes.filter((vote) => vote === 'YES').length;
    const maybeCount = votes.filter((vote) => vote === 'MAYBE').length;
    const noCount = votes.filter((vote) => vote === 'NO').length;
    if (noCount > 0 || yesCount === 0) {
        return null;
    }
    const kind: MatchKind = yesCount === participantCount ? 'PERFECT' : 'STRONG';
    const voteAverage = votes.reduce((sum, vote) => sum + voteValue[vote], 0) / participantCount;
    const matchScore = clamp(round2((voteAverage * 0.7 + clamp(baseScore, 0, 100) / 100 * 0.3) * 100), 0, 100);
    return { kind, matchScore, yesCount, maybeCount };
}

export function compareMatches(
    left: { gameId?: string; kind: MatchKind; matchScore: number; baseScore: number },
    right: { gameId?: string; kind: MatchKind; matchScore: number; baseScore: number }
): number {
    return kindRank(right.kind) - kindRank(left.kind)
        || right.matchScore - left.matchScore
        || right.baseScore - left.baseScore
        || (left.gameId ?? '').localeCompare(right.gameId ?? '');
}

function kindRank(kind: MatchKind): number {
    return kind === 'PERFECT' ? 2 : 1;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
