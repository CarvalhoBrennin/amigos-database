import type {
    CandidateDecisionData,
    DecisionParticipant,
    ParticipantGameAssignment,
    RejectionReason,
    RoomConstraints,
    RoomGameHistoryDisposition,
    WarningReason,
} from '../../../../../shared/index.js';

export interface DecisionContext {
    now: Date;
    room: {
        id: string;
        regionCode: string;
        constraints: RoomConstraints;
    };
    participants: DecisionParticipant[];
    history: Array<{
        gameId: string;
        disposition: RoomGameHistoryDisposition;
    }>;
}

export interface AssignmentOption {
    assignment: ParticipantGameAssignment;
    rejectionReasons: RejectionReason[];
    warnings: WarningReason[];
    confidenceRank: number;
}

export interface AssignmentSearchResult {
    assignment: ParticipantGameAssignment[];
    rejectionReasons: RejectionReason[];
    warnings: WarningReason[];
    groupSpendMinor: number | null;
    currency: string | null;
    confidenceRank: number;
}

export interface EvaluationInput {
    context: DecisionContext;
    candidate: CandidateDecisionData;
}
