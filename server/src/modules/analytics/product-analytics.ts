export type ProductEvent =
    | { event: 'room_created'; roomId: string }
    | { event: 'participant_joined'; roomId: string }
    | { event: 'participant_ready'; roomId: string }
    | { event: 'room_started'; roomId: string; participantCount: number }
    | {
        event: 'candidate_pool_generated';
        roomId: string;
        participantCount: number;
        eligibleCount: number;
        rejectionCounts: Record<string, number>;
    }
    | { event: 'vote_submitted'; roomId: string }
    | { event: 'match_created'; roomId: string; kind: 'PERFECT' | 'STRONG' }
    | { event: 'match_target_reached'; roomId: string; target: number }
    | { event: 'shortlist_opened'; roomId: string }
    | { event: 'gameplay_opened'; gameId: string; available: boolean }
    | { event: 'decision_completed'; roomId: string; gameId: string }
    | { event: 'room_expired'; roomId: string };

export interface ProductAnalytics {
    track(event: ProductEvent): void | Promise<void>;
}

export function trackProductEvent(
    analytics: ProductAnalytics,
    event: ProductEvent,
    onError: () => void
): void {
    try {
        void Promise.resolve(analytics.track(event)).catch(onError);
    } catch {
        onError();
    }
}
