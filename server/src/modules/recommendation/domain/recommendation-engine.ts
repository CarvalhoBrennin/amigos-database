import {
    candidateEvaluationSchema,
    scoreBreakdownSchema,
    type CandidateDecisionData,
    type CandidateEvaluation,
    type RejectionReason,
    type WarningReason,
} from '../../../../../shared/index.js';
import { findBestPlatformAssignment } from './platform-assignment.js';
import { scoreCandidate } from './scoring.js';
import type { DecisionContext } from './types.js';

const emptyBreakdown = scoreBreakdownSchema.parse({
    preference: { points: 0, max: 40, reasons: ['NOT_ELIGIBLE'] },
    access: { points: 0, max: 25, reasons: ['NOT_ELIGIBLE'] },
    session: { points: 0, max: 15, reasons: ['NOT_ELIGIBLE'] },
    price: { points: 0, max: 10, reasons: ['NOT_ELIGIBLE'] },
    novelty: { points: 0, max: 10, reasons: ['NOT_ELIGIBLE'] },
});

export function evaluateCandidate(
    context: DecisionContext,
    candidate: CandidateDecisionData
): CandidateEvaluation {
    if (context.room.constraints.requireVerifiedCompatibility && candidate.profile.dataStatus === 'UNKNOWN') {
        return ineligible(candidate.gameId, ['INSUFFICIENT_DECISION_DATA']);
    }
    const history = context.history.find((entry) => entry.gameId === candidate.gameId);
    if (history?.disposition === 'DO_NOT_SHOW') {
        return ineligible(candidate.gameId, ['DO_NOT_SHOW']);
    }
    if (history?.disposition === 'PLAYED' && context.room.constraints.excludePreviouslyPlayed) {
        return ineligible(candidate.gameId, ['PREVIOUSLY_PLAYED_EXCLUDED']);
    }

    const count = context.participants.length;
    if (candidate.profile.minOnlinePlayers === null || candidate.profile.maxOnlinePlayers === null) {
        if (context.room.constraints.requireVerifiedCompatibility) {
            return ineligible(candidate.gameId, ['INSUFFICIENT_DECISION_DATA']);
        }
    } else if (count < candidate.profile.minOnlinePlayers || count > candidate.profile.maxOnlinePlayers) {
        return ineligible(candidate.gameId, ['PLAYER_COUNT_NOT_SUPPORTED']);
    }

    const sessionLimit = context.room.constraints.maxSessionMinutes;
    if (sessionLimit !== null) {
        if (candidate.profile.maxSessionMinutes === null) {
            if (context.room.constraints.requireVerifiedCompatibility) {
                return ineligible(candidate.gameId, ['INSUFFICIENT_DECISION_DATA']);
            }
        } else if (candidate.profile.maxSessionMinutes > sessionLimit) {
            return ineligible(candidate.gameId, ['SESSION_TOO_LONG']);
        }
    }

    const assignment = findBestPlatformAssignment(context, candidate);
    if (assignment.rejectionReasons.length > 0) {
        return ineligible(candidate.gameId, assignment.rejectionReasons, assignment.warnings);
    }
    const scoring = scoreCandidate(context, candidate, assignment.assignment);
    const warnings = new Set<WarningReason>(assignment.warnings);
    if (candidate.profile.dataStatus !== 'COMPLETE') warnings.add('PARTIAL_DECISION_DATA');
    if (history?.disposition === 'PLAYED') warnings.add('PREVIOUSLY_PLAYED');
    const confidence = assignment.confidenceRank === 0 && candidate.profile.dataStatus === 'COMPLETE'
        ? 'VERIFIED'
        : assignment.confidenceRank >= 3 || candidate.profile.dataStatus === 'UNKNOWN'
            ? 'UNKNOWN'
            : 'PARTIAL';

    return candidateEvaluationSchema.parse({
        gameId: candidate.gameId,
        eligible: true,
        rejectionReasons: [],
        warnings: [...warnings],
        baseScore: scoring.baseScore,
        scoreBreakdown: scoring.breakdown,
        assignment: assignment.assignment,
        groupSpendMinor: assignment.groupSpendMinor,
        currency: assignment.currency,
        confidence,
    });
}

export function evaluateCandidates(
    context: DecisionContext,
    candidates: CandidateDecisionData[]
): CandidateEvaluation[] {
    return candidates.map((candidate) => evaluateCandidate(context, candidate));
}

function ineligible(
    gameId: string,
    rejectionReasons: RejectionReason[],
    warnings: WarningReason[] = []
): CandidateEvaluation {
    return candidateEvaluationSchema.parse({
        gameId,
        eligible: false,
        rejectionReasons: [...new Set(rejectionReasons)],
        warnings: [...new Set(warnings)],
        baseScore: 0,
        scoreBreakdown: emptyBreakdown,
        assignment: [],
        groupSpendMinor: null,
        currency: null,
        confidence: 'UNKNOWN',
    });
}
