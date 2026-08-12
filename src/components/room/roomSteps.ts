export const ROOM_PREFERENCE_KEYS = ['communication', 'skill', 'chaos', 'strategy', 'story'] as const;

export type RoomPreferenceKey = typeof ROOM_PREFERENCE_KEYS[number];

export type SetupStep =
    | { id: 'platforms'; kind: 'platforms' }
    | { id: 'subscriptions'; kind: 'subscriptions' }
    | { id: 'pc'; kind: 'pc' }
    | { id: RoomPreferenceKey; kind: 'preference'; preferenceKey: RoomPreferenceKey }
    | { id: 'owned'; kind: 'owned' }
    | { id: 'history'; kind: 'history' }
    | { id: 'rules'; kind: 'rules' }
    | { id: 'review'; kind: 'review' };

export interface SetupSequenceInput {
    /** A PC tier question only makes sense once a PC platform is on the table. */
    hasPcPlatform: boolean;
    /** Regions without published plans skip the subscription question entirely. */
    hasSubscriptionPlans: boolean;
    /** Only the host can change the room rules. */
    isHost: boolean;
}

/**
 * The sequence is rebuilt from the current answers, so irrelevant questions are
 * never shown and the numbering always reflects what the person will actually see.
 */
export function buildSetupSteps(input: SetupSequenceInput): SetupStep[] {
    return [
        { id: 'platforms', kind: 'platforms' },
        ...(input.hasSubscriptionPlans ? [{ id: 'subscriptions', kind: 'subscriptions' } as const] : []),
        ...(input.hasPcPlatform ? [{ id: 'pc', kind: 'pc' } as const] : []),
        ...ROOM_PREFERENCE_KEYS.map((preferenceKey) => ({
            id: preferenceKey,
            kind: 'preference',
            preferenceKey,
        }) as const),
        { id: 'owned', kind: 'owned' },
        { id: 'history', kind: 'history' },
        ...(input.isHost ? [{ id: 'rules', kind: 'rules' } as const] : []),
        { id: 'review', kind: 'review' },
    ];
}

/** Keeps the active step stable when the sequence grows or shrinks around it. */
export function resolveStepIndex(steps: SetupStep[], activeStepId: string): number {
    const index = steps.findIndex((step) => step.id === activeStepId);
    return index === -1 ? 0 : index;
}
