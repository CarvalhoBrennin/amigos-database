import {
    defaultParticipantPreferences,
    defaultRoomConstraints,
    type CandidateDecisionData,
    type DecisionParticipant,
    type GameNetworkPool,
    type GamePlatformOffering,
    type GamePrice,
    type GameSubscriptionAvailability,
    type PlatformCode,
    type RoomConstraints,
    type SubscriptionCapabilities,
} from '../../../../../../shared/index.js';
import type { DecisionContext } from '../../domain/types.js';

export const FIXTURE_NOW = new Date('2026-08-11T12:00:00.000Z');
export const PARTICIPANT_ONE_ID = '00000000-0000-4000-8000-000000000001';
export const PARTICIPANT_TWO_ID = '00000000-0000-4000-8000-000000000002';
export const PARTICIPANT_THREE_ID = '00000000-0000-4000-8000-000000000003';

const noCapabilities: SubscriptionCapabilities = {
    onlineMultiplayer: false,
    gameCatalogDownload: false,
    monthlyClaimedGames: false,
    cloudStreaming: false,
};

export function makeParticipant(overrides: Partial<DecisionParticipant> = {}): DecisionParticipant {
    return {
        id: PARTICIPANT_ONE_ID,
        platforms: ['PC_STEAM'],
        subscriptions: [],
        ownedGames: [],
        pcTier: 'HIGH',
        preferences: { ...defaultParticipantPreferences },
        ...overrides,
    };
}

export function makeContext(overrides: {
    participants?: DecisionParticipant[];
    constraints?: Partial<RoomConstraints>;
    history?: DecisionContext['history'];
    now?: Date;
    regionCode?: string;
} = {}): DecisionContext {
    const regionCode = overrides.regionCode ?? 'BR';
    return {
        now: overrides.now ?? FIXTURE_NOW,
        room: {
            id: '10000000-0000-4000-8000-000000000001',
            regionCode,
            constraints: {
                ...defaultRoomConstraints,
                regionCode,
                ...overrides.constraints,
            },
        },
        participants: overrides.participants ?? [
            makeParticipant(),
            makeParticipant({ id: PARTICIPANT_TWO_ID }),
        ],
        history: overrides.history ?? [],
    };
}

export function makeCandidate(overrides: Partial<CandidateDecisionData> = {}): CandidateDecisionData {
    return {
        gameId: 'fixture-game',
        profile: {
            minOnlinePlayers: 1,
            maxOnlinePlayers: 4,
            minSessionMinutes: 30,
            maxSessionMinutes: 60,
            installSizeMb: 1_000,
            minPcTier: null,
            freeToPlay: false,
            communication: 5,
            skill: 5,
            chaos: 5,
            strategy: 5,
            story: 5,
            difficultyCode: 'MODERATE',
            dataStatus: 'COMPLETE',
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: 'https://fixtures.test.invalid/profile',
            lastVerifiedAt: '2026-08-10T12:00:00.000Z',
        },
        offerings: [makeOffering()],
        networkPools: [makePool()],
        subscriptionAvailability: [],
        prices: [makePrice()],
        ...overrides,
    };
}

export function makeOffering(overrides: Partial<GamePlatformOffering> = {}): GamePlatformOffering {
    return {
        platformCode: 'PC_STEAM',
        regionCode: 'BR',
        onlineSupported: true,
        freeToPlay: false,
        requiresPaidOnlineSubscription: false,
        onlineRequirementVerificationStatus: 'VERIFIED',
        sourceType: 'ADMIN_IMPORT',
        sourceUrl: 'https://fixtures.test.invalid/offering',
        verificationStatus: 'VERIFIED',
        lastVerifiedAt: '2026-08-10T12:00:00.000Z',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        ...overrides,
    };
}

export function makePool(overrides: Partial<GameNetworkPool> = {}): GameNetworkPool {
    return {
        poolCode: 'FIXTURE_POOL',
        regionCode: 'BR',
        platforms: ['PC_STEAM'],
        sourceType: 'ADMIN_IMPORT',
        sourceUrl: 'https://fixtures.test.invalid/pool',
        verificationStatus: 'VERIFIED',
        lastVerifiedAt: '2026-08-10T12:00:00.000Z',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        ...overrides,
    };
}

export function makeAvailability(
    planCode = 'PC_GAME_PASS',
    overrides: Partial<GameSubscriptionAvailability> = {}
): GameSubscriptionAvailability {
    return {
        planCode,
        platformCode: 'PC_STEAM',
        regionCode: 'BR',
        accessType: 'DOWNLOAD',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
        verificationStatus: 'VERIFIED',
        sourceType: 'ADMIN_IMPORT',
        sourceUrl: 'https://fixtures.test.invalid/subscription',
        lastVerifiedAt: '2026-08-10T12:00:00.000Z',
        ...overrides,
    };
}

export function makePrice(overrides: Partial<GamePrice> = {}): GamePrice {
    return {
        platformCode: 'PC_STEAM',
        regionCode: 'BR',
        storeCode: 'FIXTURE_STORE',
        amountMinor: 5_000,
        currency: 'BRL',
        regularAmountMinor: 8_000,
        quality: 'VERIFIED_LOCAL',
        sourceUrl: 'https://fixtures.test.invalid/price',
        observedAt: '2026-08-10T12:00:00.000Z',
        validUntil: '2026-08-20T12:00:00.000Z',
        ...overrides,
    };
}

export function subscription(
    planCode: string,
    capabilities: Partial<SubscriptionCapabilities> = {},
    regionCode = 'BR'
): DecisionParticipant['subscriptions'][number] {
    return { planCode, regionCode, capabilities: { ...noCapabilities, ...capabilities } };
}

export function owned(gameId = 'fixture-game', platformCode: PlatformCode | null = 'PC_STEAM') {
    return { gameId, platformCode };
}
