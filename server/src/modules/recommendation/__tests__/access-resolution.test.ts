import { describe, expect, it } from 'vitest';
import { resolveAccess } from '../domain/access-resolution.js';
import {
    FIXTURE_NOW,
    makeAvailability,
    makeCandidate,
    makeContext,
    makeOffering,
    makeParticipant,
    makePrice,
    owned,
    subscription,
} from './fixtures/decision-fixtures.js';

describe('resolveAccess', () => {
    it('gives OWNED precedence over subscription, free-to-play and price', () => {
        const participant = makeParticipant({
            ownedGames: [owned()],
            subscriptions: [subscription('PC_GAME_PASS', { gameCatalogDownload: true })],
        });
        const candidate = makeCandidate({
            offerings: [makeOffering({ freeToPlay: true })],
            subscriptionAvailability: [makeAvailability()],
        });
        expect(resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('OWNED');
    });

    it('does not use ownership with an unconfirmed platform as proof', () => {
        const participant = makeParticipant({ ownedGames: [owned('fixture-game', null)] });
        const candidate = makeCandidate({ prices: [] });
        expect(resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('UNKNOWN');
    });

    it('resolves a verified subscription download before purchase', () => {
        const participant = makeParticipant({
            subscriptions: [subscription('PC_GAME_PASS', { gameCatalogDownload: true })],
        });
        const candidate = makeCandidate({ subscriptionAvailability: [makeAvailability()] });
        const access = resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext());
        expect(access.access).toMatchObject({ accessKind: 'SUBSCRIPTION_DOWNLOAD', subscriptionPlanCode: 'PC_GAME_PASS' });
    });

    it.each([
        ['cloud-only', makeAvailability('PC_GAME_PASS', { accessType: 'CLOUD_STREAM' })],
        ['expired', makeAvailability('PC_GAME_PASS', { validUntil: '2026-08-01T00:00:00.000Z' })],
        ['future', makeAvailability('PC_GAME_PASS', { validFrom: '2026-09-01T00:00:00.000Z' })],
        ['other region', makeAvailability('PC_GAME_PASS', { regionCode: 'US' })],
        ['stale', makeAvailability('PC_GAME_PASS', { verificationStatus: 'STALE' })],
    ])('ignores %s subscription availability', (_label, availability) => {
        const participant = makeParticipant({
            subscriptions: [subscription('PC_GAME_PASS', { gameCatalogDownload: true })],
        });
        const candidate = makeCandidate({ subscriptionAvailability: [availability], prices: [] });
        expect(resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('UNKNOWN');
    });

    it('does not infer entitlement from a declared plan without a game record', () => {
        const participant = makeParticipant({ subscriptions: [subscription('PC_GAME_PASS', { gameCatalogDownload: true })] });
        const candidate = makeCandidate({ subscriptionAvailability: [], prices: [] });
        expect(resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('UNKNOWN');
    });

    it('does not grant Extra catalog access to PlayStation Plus Essential', () => {
        const participant = makeParticipant({
            subscriptions: [subscription('PLAYSTATION_PLUS_ESSENTIAL', { onlineMultiplayer: true, monthlyClaimedGames: true })],
        });
        const candidate = makeCandidate({
            subscriptionAvailability: [makeAvailability('PLAYSTATION_PLUS_ESSENTIAL')],
            prices: [],
        });
        expect(resolveAccess(participant, candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('UNKNOWN');
    });

    it('uses verified free-to-play before purchase', () => {
        const candidate = makeCandidate({ offerings: [makeOffering({ freeToPlay: true })] });
        expect(resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('FREE_TO_PLAY');
    });

    it('uses the most reliable active price even when an estimate is cheaper', () => {
        const candidate = makeCandidate({ prices: [
            makePrice({ quality: 'PROVIDER_ESTIMATE', amountMinor: 100, storeCode: 'ESTIMATE' }),
            makePrice({ quality: 'VERIFIED_LOCAL', amountMinor: 5_000, storeCode: 'VERIFIED' }),
        ] });
        const access = resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, makeContext());
        expect(access.access).toMatchObject({ accessKind: 'PURCHASE_REQUIRED', amountMinor: 5_000, priceQuality: 'VERIFIED_LOCAL' });
    });

    it('accepts a verified zero price without treating it as missing', () => {
        const candidate = makeCandidate({ prices: [makePrice({ amountMinor: 0 })] });
        expect(resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, makeContext()).access.amountMinor).toBe(0);
    });

    it('returns UNKNOWN when no access proof exists', () => {
        const candidate = makeCandidate({ prices: [] });
        expect(resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, makeContext()).access.accessKind).toBe('UNKNOWN');
    });

    it('ignores prices observed in the future or after validity', () => {
        const candidate = makeCandidate({ prices: [
            makePrice({ observedAt: '2026-09-01T00:00:00.000Z' }),
            makePrice({ validUntil: '2026-08-01T00:00:00.000Z' }),
        ] });
        const context = makeContext({ now: FIXTURE_NOW });
        expect(resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, context).access.accessKind).toBe('UNKNOWN');
    });

    it('marks provider estimates explicitly', () => {
        const candidate = makeCandidate({ prices: [makePrice({ quality: 'PROVIDER_ESTIMATE' })] });
        expect(resolveAccess(makeParticipant(), candidate, candidate.offerings[0]!, makeContext()).warnings).toContain('PRICE_ESTIMATE_ONLY');
    });
});
