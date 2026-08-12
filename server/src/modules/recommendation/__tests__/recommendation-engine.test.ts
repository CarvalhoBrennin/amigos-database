import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from '../domain/recommendation-engine.js';
import {
    PARTICIPANT_ONE_ID,
    PARTICIPANT_THREE_ID,
    PARTICIPANT_TWO_ID,
    makeAvailability,
    makeCandidate,
    makeContext,
    makeOffering,
    makeParticipant,
    makePool,
    makePrice,
    owned,
    subscription,
} from './fixtures/decision-fixtures.js';

describe('recommendation engine hard filters and platform assignment', () => {
    it('accepts the same verified platform and pool for everyone', () => {
        expect(evaluateCandidate(makeContext(), makeCandidate()).eligible).toBe(true);
    });

    it('accepts different platforms when a verified network pool contains both', () => {
        const context = makeContext({ participants: [
            makeParticipant({ id: PARTICIPANT_ONE_ID, platforms: ['PC_STEAM'] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, platforms: ['XBOX_SERIES'], subscriptions: [
                subscription('XBOX_GAME_PASS_ESSENTIAL', { onlineMultiplayer: true }),
            ] }),
        ] });
        const candidate = makeCandidate({
            offerings: [
                makeOffering(),
                makeOffering({ platformCode: 'XBOX_SERIES', requiresPaidOnlineSubscription: true }),
            ],
            networkPools: [makePool({ platforms: ['PC_STEAM', 'XBOX_SERIES'] })],
            prices: [makePrice(), makePrice({ platformCode: 'XBOX_SERIES', storeCode: 'XBOX' })],
        });
        expect(evaluateCandidate(context, candidate).eligible).toBe(true);
    });

    it('rejects when one participant platform is outside every common pool', () => {
        const context = makeContext({ participants: [
            makeParticipant({ platforms: ['PC_STEAM'] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, platforms: ['XBOX_SERIES'] }),
        ] });
        const candidate = makeCandidate({
            offerings: [makeOffering(), makeOffering({ platformCode: 'XBOX_SERIES' })],
            networkPools: [makePool({ platforms: ['PC_STEAM'] })],
        });
        expect(evaluateCandidate(context, candidate).rejectionReasons).toContain('NO_COMMON_NETWORK_POOL');
    });

    it('uses a participant secondary platform when it creates a viable assignment', () => {
        const context = makeContext({ participants: [
            makeParticipant({ platforms: ['PC_STEAM', 'XBOX_SERIES'], ownedGames: [owned('fixture-game', 'XBOX_SERIES')] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, platforms: ['XBOX_SERIES'], ownedGames: [owned('fixture-game', 'XBOX_SERIES')] }),
        ] });
        const candidate = makeCandidate({
            offerings: [makeOffering(), makeOffering({ platformCode: 'XBOX_SERIES', requiresPaidOnlineSubscription: false })],
            networkPools: [makePool({ platforms: ['PC_STEAM', 'XBOX_SERIES'] })],
            prices: [makePrice(), makePrice({ platformCode: 'XBOX_SERIES', storeCode: 'XBOX' })],
        });
        expect(evaluateCandidate(context, candidate).assignment.map((item) => item.platformCode)).toEqual(['XBOX_SERIES', 'XBOX_SERIES']);
    });

    it('chooses the assignment with fewer purchases', () => {
        const participants = [
            makeParticipant({ platforms: ['PC_STEAM', 'PC_EPIC'], ownedGames: [owned('fixture-game', 'PC_EPIC')] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, platforms: ['PC_STEAM', 'PC_EPIC'], ownedGames: [owned('fixture-game', 'PC_EPIC')] }),
        ];
        const candidate = makeCandidate({
            offerings: [makeOffering(), makeOffering({ platformCode: 'PC_EPIC' })],
            networkPools: [makePool({ platforms: ['PC_STEAM', 'PC_EPIC'] })],
            prices: [makePrice(), makePrice({ platformCode: 'PC_EPIC', storeCode: 'EPIC' })],
        });
        expect(evaluateCandidate(makeContext({ participants }), candidate).assignment.every((item) => item.accessKind === 'OWNED')).toBe(true);
    });

    it('uses lower group spend when purchase counts tie', () => {
        const participants = [
            makeParticipant({ platforms: ['PC_STEAM', 'PC_EPIC'] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, platforms: ['PC_STEAM', 'PC_EPIC'] }),
        ];
        const candidate = makeCandidate({
            offerings: [makeOffering(), makeOffering({ platformCode: 'PC_EPIC' })],
            networkPools: [
                makePool({ poolCode: 'STEAM', platforms: ['PC_STEAM'] }),
                makePool({ poolCode: 'EPIC', platforms: ['PC_EPIC'] }),
            ],
            prices: [
                makePrice({ amountMinor: 5_000 }),
                makePrice({ platformCode: 'PC_EPIC', storeCode: 'EPIC', amountMinor: 2_000 }),
            ],
        });
        const result = evaluateCandidate(makeContext({ participants }), candidate);
        expect(result.groupSpendMinor).toBe(4_000);
        expect(result.assignment.every((item) => item.platformCode === 'PC_EPIC')).toBe(true);
    });

    it.each([
        ['expired offering', [makeOffering({ validUntil: '2026-08-01T00:00:00.000Z' })], [makePool()]],
        ['other-region offering', [makeOffering({ regionCode: 'US' })], [makePool()]],
        ['expired pool', [makeOffering()], [makePool({ validUntil: '2026-08-01T00:00:00.000Z' })]],
        ['other-region pool', [makeOffering()], [makePool({ regionCode: 'US' })]],
    ])('rejects an %s', (_label, offerings, networkPools) => {
        expect(evaluateCandidate(makeContext(), makeCandidate({ offerings, networkPools })).eligible).toBe(false);
    });

    it('rejects unverified compatibility in strict mode', () => {
        const candidate = makeCandidate({ offerings: [makeOffering({ verificationStatus: 'UNKNOWN' })] });
        expect(evaluateCandidate(makeContext(), candidate).rejectionReasons).toContain('NO_PLATFORM_ASSIGNMENT');
    });

    it('allows unverified compatibility only in flexible compatibility mode with a warning', () => {
        const context = makeContext({ constraints: { requireVerifiedCompatibility: false } });
        const candidate = makeCandidate({
            offerings: [makeOffering({ verificationStatus: 'UNKNOWN' })],
            networkPools: [makePool({ verificationStatus: 'UNKNOWN' })],
        });
        const result = evaluateCandidate(context, candidate);
        expect(result.eligible).toBe(true);
        expect(result.warnings).toContain('PARTIAL_DECISION_DATA');
    });

    it.each([
        [3, 4],
        [1, 1],
    ])('rejects participant count outside %s..%s', (minimum, maximum) => {
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: {
            ...base.profile,
            minOnlinePlayers: minimum,
            maxOnlinePlayers: maximum,
        } });
        expect(evaluateCandidate(makeContext(), candidate).rejectionReasons).toContain('PLAYER_COUNT_NOT_SUPPORTED');
    });

    it('rejects unknown player count in strict mode', () => {
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: { ...base.profile, minOnlinePlayers: null, maxOnlinePlayers: null } });
        expect(evaluateCandidate(makeContext(), candidate).rejectionReasons).toContain('INSUFFICIENT_DECISION_DATA');
    });

    it('rejects UNKNOWN decision data in strict compatibility mode', () => {
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: { ...base.profile, dataStatus: 'UNKNOWN' } });
        const result = evaluateCandidate(makeContext(), candidate);

        expect(result.eligible).toBe(false);
        expect(result.rejectionReasons).toContain('INSUFFICIENT_DECISION_DATA');
    });

    it('accepts a session that fits and rejects one that exceeds the limit', () => {
        const context = makeContext({ constraints: { maxSessionMinutes: 60 } });
        expect(evaluateCandidate(context, makeCandidate()).eligible).toBe(true);
        const base = makeCandidate();
        const tooLong = makeCandidate({ profile: { ...base.profile, maxSessionMinutes: 90 } });
        expect(evaluateCandidate(context, tooLong).rejectionReasons).toContain('SESSION_TOO_LONG');
    });

    it('rejects unknown duration when a strict duration constraint exists', () => {
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: { ...base.profile, maxSessionMinutes: null } });
        const result = evaluateCandidate(makeContext({ constraints: { maxSessionMinutes: 60 } }), candidate);
        expect(result.rejectionReasons).toContain('INSUFFICIENT_DECISION_DATA');
    });

    it('always excludes DO_NOT_SHOW history', () => {
        const context = makeContext({
            constraints: { excludePreviouslyPlayed: false },
            history: [{ gameId: 'fixture-game', disposition: 'DO_NOT_SHOW' }],
        });
        expect(evaluateCandidate(context, makeCandidate()).rejectionReasons).toEqual(['DO_NOT_SHOW']);
    });

    it('excludes PLAYED only when configured and does not penalize REPLAY_OK', () => {
        const played = [{ gameId: 'fixture-game', disposition: 'PLAYED' as const }];
        expect(evaluateCandidate(makeContext({ history: played }), makeCandidate()).rejectionReasons).toContain('PREVIOUSLY_PLAYED_EXCLUDED');
        const allowed = evaluateCandidate(makeContext({ constraints: { excludePreviouslyPlayed: false }, history: played }), makeCandidate());
        expect(allowed.eligible).toBe(true);
        expect(allowed.warnings).toContain('PREVIOUSLY_PLAYED');
        const replay = evaluateCandidate(makeContext({ history: [{ gameId: 'fixture-game', disposition: 'REPLAY_OK' }] }), makeCandidate());
        expect(replay.scoreBreakdown.novelty.points).toBe(10);
    });
});

describe('subscriptions, online rights and budget', () => {
    it.each([
        ['PC_GAME_PASS', 'PC_STEAM'],
        ['PLAYSTATION_PLUS_EXTRA', 'PS5'],
        ['PLAYSTATION_PLUS_DELUXE', 'PS5'],
    ] as const)('uses verified DOWNLOAD through %s', (planCode, platformCode) => {
        const participant = makeParticipant({
            platforms: [platformCode],
            subscriptions: [subscription(planCode, {
                gameCatalogDownload: true,
                onlineMultiplayer: platformCode === 'PS5',
            })],
        });
        const context = makeContext({ participants: [participant], constraints: { accessPolicy: 'NO_PURCHASE_REQUIRED' } });
        const candidate = makeCandidate({
            offerings: [makeOffering({ platformCode, requiresPaidOnlineSubscription: platformCode === 'PS5' })],
            networkPools: [makePool({ platforms: [platformCode] })],
            subscriptionAvailability: [makeAvailability(planCode, { platformCode })],
            prices: [],
        });
        expect(evaluateCandidate(context, candidate).assignment[0]?.accessKind).toBe('SUBSCRIPTION_DOWNLOAD');
    });

    it('does not treat cloud stream as download under no-purchase policy', () => {
        const participant = makeParticipant({ subscriptions: [subscription('PC_GAME_PASS', { gameCatalogDownload: true })] });
        const candidate = makeCandidate({
            subscriptionAvailability: [makeAvailability('PC_GAME_PASS', { accessType: 'CLOUD_STREAM' })],
            prices: [],
        });
        const result = evaluateCandidate(makeContext({ participants: [participant], constraints: { accessPolicy: 'NO_PURCHASE_REQUIRED' } }), candidate);
        expect(result.rejectionReasons).toContain('NO_PURCHASE_REQUIRED_NOT_SATISFIED');
    });

    it('lets declared ownership beat PlayStation Plus Essential limitations', () => {
        const participant = makeParticipant({
            ownedGames: [owned()],
            subscriptions: [subscription('PLAYSTATION_PLUS_ESSENTIAL', { onlineMultiplayer: true })],
        });
        const result = evaluateCandidate(makeContext({ participants: [participant], constraints: { accessPolicy: 'NO_PURCHASE_REQUIRED' } }), makeCandidate());
        expect(result.assignment[0]?.accessKind).toBe('OWNED');
    });

    it('allows verified free-to-play under no-purchase policy', () => {
        const candidate = makeCandidate({ offerings: [makeOffering({ freeToPlay: true })], prices: [] });
        expect(evaluateCandidate(makeContext({ constraints: { accessPolicy: 'NO_PURCHASE_REQUIRED' } }), candidate).eligible).toBe(true);
    });

    it('requires an online-capable subscription for paid console multiplayer', () => {
        const participant = makeParticipant({ platforms: ['PS5'] });
        const candidate = makeCandidate({
            offerings: [makeOffering({ platformCode: 'PS5', requiresPaidOnlineSubscription: true })],
            networkPools: [makePool({ platforms: ['PS5'] })],
            prices: [makePrice({ platformCode: 'PS5' })],
        });
        expect(evaluateCandidate(makeContext({ participants: [participant] }), candidate).rejectionReasons).toContain('ONLINE_MULTIPLAYER_SUBSCRIPTION_REQUIRED');
        const subscribed = makeParticipant({
            platforms: ['PS5'],
            subscriptions: [subscription('PLAYSTATION_PLUS_ESSENTIAL', { onlineMultiplayer: true })],
        });
        expect(evaluateCandidate(makeContext({ participants: [subscribed] }), candidate).eligible).toBe(true);
    });

    it('rejects an unknown console online requirement in strict mode', () => {
        const participant = makeParticipant({ platforms: ['XBOX_SERIES'] });
        const candidate = makeCandidate({
            offerings: [makeOffering({
                platformCode: 'XBOX_SERIES',
                requiresPaidOnlineSubscription: null,
                onlineRequirementVerificationStatus: 'UNKNOWN',
            })],
            networkPools: [makePool({ platforms: ['XBOX_SERIES'] })],
            prices: [makePrice({ platformCode: 'XBOX_SERIES' })],
        });
        expect(evaluateCandidate(makeContext({ participants: [participant] }), candidate).rejectionReasons).toContain('ONLINE_MULTIPLAYER_REQUIREMENT_UNKNOWN');
    });

    it('does not require paid online for a verified free-to-play console offering', () => {
        const participant = makeParticipant({ platforms: ['PS5'] });
        const candidate = makeCandidate({
            offerings: [makeOffering({ platformCode: 'PS5', freeToPlay: true, requiresPaidOnlineSubscription: false })],
            networkPools: [makePool({ platforms: ['PS5'] })],
            prices: [],
        });
        expect(evaluateCandidate(makeContext({ participants: [participant] }), candidate).eligible).toBe(true);
    });

    it('ignores budget when nobody needs to purchase', () => {
        const participants = [
            makeParticipant({ ownedGames: [owned()] }),
            makeParticipant({ id: PARTICIPANT_TWO_ID, ownedGames: [owned()] }),
        ];
        const result = evaluateCandidate(makeContext({
            participants,
            constraints: { maxPricePerPersonMinor: 1, maxGroupSpendMinor: 1, budgetMode: 'STRICT' },
        }), makeCandidate());
        expect(result.eligible).toBe(true);
        expect(result.groupSpendMinor).toBe(0);
    });

    it('accepts a verified purchase below both budgets', () => {
        const result = evaluateCandidate(makeContext({
            constraints: { maxPricePerPersonMinor: 6_000, maxGroupSpendMinor: 10_000, budgetMode: 'STRICT' },
        }), makeCandidate());
        expect(result.eligible).toBe(true);
    });

    it('rejects per-person and group budget excess independently', () => {
        const perPerson = evaluateCandidate(makeContext({ constraints: { maxPricePerPersonMinor: 4_999 } }), makeCandidate());
        expect(perPerson.rejectionReasons).toContain('PER_PERSON_BUDGET_EXCEEDED');
        const group = evaluateCandidate(makeContext({ constraints: { maxGroupSpendMinor: 9_999 } }), makeCandidate());
        expect(group.rejectionReasons).toContain('GROUP_BUDGET_EXCEEDED');
    });

    it('rejects unknown or estimated price in strict budget mode', () => {
        const strict = makeContext({ constraints: { budgetMode: 'STRICT' } });
        const unknown = evaluateCandidate(strict, makeCandidate({ prices: [] }));
        expect(unknown.eligible).toBe(false);
        const estimate = evaluateCandidate(strict, makeCandidate({ prices: [makePrice({ quality: 'PROVIDER_ESTIMATE' })] }));
        expect(estimate.rejectionReasons).toContain('PRICE_UNKNOWN_FOR_STRICT_BUDGET');
    });

    it('allows an estimate in flexible budget mode with an explicit warning', () => {
        const candidate = makeCandidate({ prices: [makePrice({ quality: 'PROVIDER_ESTIMATE' })] });
        const result = evaluateCandidate(makeContext({ constraints: { budgetMode: 'FLEXIBLE' } }), candidate);
        expect(result.eligible).toBe(true);
        expect(result.warnings).toContain('PRICE_ESTIMATE_ONLY');
    });

    it('rejects an insufficient PC tier and reports an unknown tier in strict mode', () => {
        const base = makeCandidate();
        const candidate = makeCandidate({ profile: { ...base.profile, minPcTier: 'HIGH' } });
        const low = makeParticipant({ pcTier: 'LOW' });
        expect(evaluateCandidate(makeContext({ participants: [low] }), candidate).rejectionReasons).toContain('PC_REQUIREMENTS_NOT_MET');
        const unknown = makeParticipant({ pcTier: null });
        expect(evaluateCandidate(makeContext({ participants: [unknown] }), candidate).rejectionReasons).toContain('INSUFFICIENT_DECISION_DATA');
    });

    it('supports three participants without changing player semantics', () => {
        const participants = [
            makeParticipant(),
            makeParticipant({ id: PARTICIPANT_TWO_ID }),
            makeParticipant({ id: PARTICIPANT_THREE_ID }),
        ];
        expect(evaluateCandidate(makeContext({ participants }), makeCandidate()).eligible).toBe(true);
    });
});
