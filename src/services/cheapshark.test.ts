import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CheapSharkError,
    extractSteamAppId,
    getBestDeal,
    getDealsBySteamAppId,
    searchGameByTitle,
    type CheapSharkDeal,
} from '@/services/cheapshark';

describe('cheapshark service', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns empty deals for invalid steam app id', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await getDealsBySteamAppId('invalid-id');
        expect(result).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches deals for valid steam app id', async () => {
        const fakeDeals: CheapSharkDeal[] = [
            {
                internalName: 'FAKE_GAME',
                title: 'Fake Game',
                dealID: '1',
                storeID: '1',
                gameID: '10',
                salePrice: '9.99',
                normalPrice: '19.99',
                isOnSale: '1',
                savings: '50',
                metacriticScore: '85',
                steamRatingText: 'Very Positive',
                steamRatingPercent: '90',
                steamRatingCount: '1000',
                steamAppID: '999',
                releaseDate: 0,
                dealRating: '9',
                thumb: '',
            },
        ];

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => fakeDeals,
            })
        );

        const result = await getDealsBySteamAppId('999');
        expect(result).toHaveLength(1);
        expect(result[0]?.title).toBe('Fake Game');
    });

    it('throws invalid_response when payload is not an array', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ result: 'invalid' }),
            })
        );

        await expect(getDealsBySteamAppId('999')).rejects.toMatchObject({
            name: 'CheapSharkError',
            code: 'invalid_response',
        });
    });

    it('throws network error for fetch failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket failed')));

        await expect(getDealsBySteamAppId('999')).rejects.toBeInstanceOf(CheapSharkError);
        await expect(getDealsBySteamAppId('999')).rejects.toMatchObject({
            code: 'network',
        });
    });

    it('returns empty search results for blank title', async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        const result = await searchGameByTitle('   ');
        expect(result).toEqual([]);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('selects the best deal by lowest sale price', () => {
        const deals = [
            { salePrice: '29.99' },
            { salePrice: '9.99' },
            { salePrice: '19.99' },
        ] as CheapSharkDeal[];

        const best = getBestDeal(deals);
        expect(best?.salePrice).toBe('9.99');
    });

    it('returns null when no valid sale prices exist', () => {
        const deals = [{ salePrice: 'invalid' }, { salePrice: 'NaN' }] as CheapSharkDeal[];
        expect(getBestDeal(deals)).toBeNull();
    });

    it('extracts steam app id from image URL', () => {
        expect(extractSteamAppId('https://steamcdn-a.akamaihd.net/steam/apps/1426210/header.jpg')).toBe(
            '1426210'
        );
        expect(extractSteamAppId(undefined)).toBeNull();
    });
});
