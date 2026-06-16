import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGameDeal } from '@/hooks/useGameDeal';
import type { CheapSharkDeal } from '@/services/cheapshark';

const createDeal = (steamAppID: string): CheapSharkDeal => ({
    internalName: 'FAKE_GAME',
    title: 'Fake Game',
    dealID: '1',
    storeID: '1',
    gameID: '10',
    salePrice: '4.99',
    normalPrice: '19.99',
    isOnSale: '1',
    savings: '75',
    metacriticScore: '80',
    steamRatingText: 'Very Positive',
    steamRatingPercent: '92',
    steamRatingCount: '100',
    steamAppID,
    releaseDate: 0,
    dealRating: '9',
    thumb: '',
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                gcTime: 0,
            },
        },
    });

    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

describe('useGameDeal', () => {
    it('starts idle when steam app id cannot be extracted', () => {
        const { result } = renderHook(() => useGameDeal('https://example.com/no-steam-app-id.jpg'), {
            wrapper: createWrapper(),
        });

        expect(result.current.status).toBe('idle');
        expect(result.current.errorCode).toBeNull();
        expect(result.current.deal).toBeNull();
    });

    it('loads deals and exposes success state', async () => {
        const deals = [createDeal('123001')];

        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => deals,
            })
        );

        const { result } = renderHook(
            () => useGameDeal('https://cdn.cloudflare.steamstatic.com/steam/apps/123001/header.jpg'),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.status).toBe('success');
        });

        expect(result.current.errorCode).toBeNull();
        expect(result.current.deal?.steamAppID).toBe('123001');
        expect(result.current.isLoading).toBe(false);
    });

    it('maps fetch failures to network error code', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        const { result } = renderHook(
            () => useGameDeal('https://cdn.cloudflare.steamstatic.com/steam/apps/123002/header.jpg'),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });

        expect(result.current.errorCode).toBe('network');
        expect(result.current.error).toBeTruthy();
    });

    it('retries failed requests when refetch is called', async () => {
        const fetchMock = vi
            .fn()
            .mockRejectedValueOnce(new Error('temporary failure'))
            .mockResolvedValue({
                ok: true,
                json: async () => [createDeal('123003')],
            });

        vi.stubGlobal('fetch', fetchMock);

        const { result } = renderHook(
            () => useGameDeal('https://cdn.cloudflare.steamstatic.com/steam/apps/123003/header.jpg'),
            { wrapper: createWrapper() }
        );

        await waitFor(() => {
            expect(result.current.status).toBe('error');
        });

        act(() => {
            result.current.refetch();
        });

        await waitFor(() => {
            expect(result.current.status).toBe('success');
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(result.current.deal?.steamAppID).toBe('123003');
    });
});