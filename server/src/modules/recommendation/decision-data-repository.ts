import type {
    CandidateDecisionData,
    SubscriptionCapabilities,
} from '../../../../shared/index.js';

export interface DecisionDataRepository {
    listCandidateData(gameIds: string[], regionCode: string): Promise<CandidateDecisionData[]>;
    getPlanCapabilities(
        planCodes: string[],
        regionCode: string,
        now: Date
    ): Promise<Map<string, SubscriptionCapabilities>>;
}
