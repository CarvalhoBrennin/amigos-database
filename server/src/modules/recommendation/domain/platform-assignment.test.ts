import { describe, expect, it } from 'vitest';
import { defaultRoomConstraints } from '../../../../../shared/index.js';
import { findBestPlatformAssignment } from './platform-assignment.js';
import type { CandidateDecisionData, DecisionParticipant } from '../../../../../shared/index.js';
import type { DecisionContext } from './types.js';

const source = 'https://data.example.invalid/audit';
const verifiedAt = '2026-01-01T00:00:00.000Z';

function makeParticipant(id: string, platforms: DecisionParticipant['platforms']): DecisionParticipant {
    return {
        id,
        platforms,
        subscriptions: [],
        ownedGames: [],
        pcTier: null,
        preferences: {
            communication: null,
            skill: null,
            chaos: null,
            strategy: null,
            story: null,
            difficultyTarget: null,
        },
    };
}

function makeCandidate(): CandidateDecisionData {
    return {
        gameId: 'audit-currency-alternatives',
        profile: {
            minOnlinePlayers: 2,
            maxOnlinePlayers: 4,
            minSessionMinutes: 30,
            maxSessionMinutes: 120,
            installSizeMb: 1000,
            minPcTier: null,
            freeToPlay: false,
            communication: null,
            skill: null,
            chaos: null,
            strategy: null,
            story: null,
            difficultyCode: null,
            dataStatus: 'COMPLETE',
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: source,
            lastVerifiedAt: verifiedAt,
        },
        offerings: ['PC_STEAM', 'PS5'].map((platformCode) => ({
            platformCode,
            regionCode: 'BR',
            onlineSupported: true,
            freeToPlay: false,
            requiresPaidOnlineSubscription: false,
            onlineRequirementVerificationStatus: 'VERIFIED',
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: source,
            verificationStatus: 'VERIFIED',
            lastVerifiedAt: verifiedAt,
            validFrom: null,
            validUntil: null,
        })),
        networkPools: [{
            poolCode: 'AUDIT_POOL',
            regionCode: 'BR',
            platforms: ['PC_STEAM', 'PS5'],
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: source,
            verificationStatus: 'VERIFIED',
            lastVerifiedAt: verifiedAt,
            validFrom: null,
            validUntil: null,
        }],
        subscriptionAvailability: [],
        prices: [
            {
                platformCode: 'PC_STEAM',
                regionCode: 'BR',
                storeCode: 'AUDIT_PC',
                amountMinor: 100,
                currency: 'USD',
                regularAmountMinor: null,
                quality: 'VERIFIED_LOCAL',
                sourceUrl: source,
                observedAt: verifiedAt,
                validUntil: null,
            },
            {
                platformCode: 'PS5',
                regionCode: 'BR',
                storeCode: 'AUDIT_PS',
                amountMinor: 100,
                currency: 'BRL',
                regularAmountMinor: null,
                quality: 'VERIFIED_LOCAL',
                sourceUrl: source,
                observedAt: verifiedAt,
                validUntil: null,
            },
        ],
    };
}

describe('findBestPlatformAssignment', () => {
    it('finds a valid same-currency combination instead of stopping at greedy choices', () => {
        const context: DecisionContext = {
            now: new Date('2026-02-01T00:00:00.000Z'),
            room: {
                id: '00000000-0000-4000-8000-000000000001',
                regionCode: 'BR',
                constraints: { ...defaultRoomConstraints, maxGroupSpendMinor: 200 },
            },
            participants: [
                makeParticipant('00000000-0000-4000-8000-000000000002', ['PC_STEAM', 'PS5']),
                makeParticipant('00000000-0000-4000-8000-000000000003', ['PS5']),
            ],
            history: [],
        };

        const result = findBestPlatformAssignment(context, makeCandidate());

        expect(result.rejectionReasons).toEqual([]);
        expect(result.currency).toBe('BRL');
        expect(result.assignment.map((item) => item.platformCode)).toEqual(['PS5', 'PS5']);
    });

    it('bounds combinatorial search for a large multi-platform room', () => {
        const platforms = [
            'PC_STEAM', 'PC_MICROSOFT_STORE', 'PC_EPIC', 'XBOX_ONE', 'XBOX_SERIES',
            'PS4', 'PS5', 'NINTENDO_SWITCH', 'ANDROID', 'IOS', 'BROWSER',
        ] as const;
        const context: DecisionContext = {
            now: new Date('2026-02-01T00:00:00.000Z'),
            room: {
                id: '00000000-0000-4000-8000-000000000011',
                regionCode: 'BR',
                constraints: { ...defaultRoomConstraints },
            },
            participants: Array.from({ length: 12 }, (_, index) => makeParticipant(
                `00000000-0000-4000-8000-${String(index + 20).padStart(12, '0')}`,
                [...platforms]
            )),
            history: [],
        };
        const candidate = makeCandidate();
        candidate.gameId = 'bounded-search';
        candidate.profile.freeToPlay = true;
        candidate.offerings = platforms.map((platformCode) => ({
            platformCode,
            regionCode: 'BR',
            onlineSupported: true,
            freeToPlay: true,
            requiresPaidOnlineSubscription: false,
            onlineRequirementVerificationStatus: 'VERIFIED',
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: source,
            verificationStatus: 'VERIFIED',
            lastVerifiedAt: verifiedAt,
            validFrom: null,
            validUntil: null,
        }));
        candidate.networkPools = [{
            poolCode: 'ALL_PLATFORMS',
            regionCode: 'BR',
            platforms: [...platforms],
            sourceType: 'ADMIN_IMPORT',
            sourceUrl: source,
            verificationStatus: 'VERIFIED',
            lastVerifiedAt: verifiedAt,
            validFrom: null,
            validUntil: null,
        }];

        const startedAt = performance.now();
        const result = findBestPlatformAssignment(context, candidate);

        expect(performance.now() - startedAt).toBeLessThan(500);
        expect(result.rejectionReasons).toEqual([]);
        expect(result.assignment).toHaveLength(12);
    });
});
