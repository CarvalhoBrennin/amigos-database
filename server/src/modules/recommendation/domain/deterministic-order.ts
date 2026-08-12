import type { CandidateEvaluation } from '../../../../../shared/index.js';

const SCORE_BUCKET_SIZE = 5;

export function orderCandidatesForParticipant(
    candidates: CandidateEvaluation[],
    roomId: string,
    participantId: string
): CandidateEvaluation[] {
    return [...candidates].sort((left, right) => {
        const bucketDifference = scoreBucket(right.baseScore) - scoreBucket(left.baseScore);
        if (bucketDifference !== 0) return bucketDifference;
        const leftTieBreak = stableHash(`${roomId}:${participantId}:${left.gameId}`);
        const rightTieBreak = stableHash(`${roomId}:${participantId}:${right.gameId}`);
        return leftTieBreak - rightTieBreak || left.gameId.localeCompare(right.gameId);
    });
}

export function deterministicRankSeed(roomId: string, gameId: string): number {
    return stableHash(`${roomId}:${gameId}`);
}

function scoreBucket(score: number): number {
    return Math.floor(score / SCORE_BUCKET_SIZE);
}

function stableHash(value: string): number {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
}
