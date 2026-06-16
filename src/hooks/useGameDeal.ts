import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    type CheapSharkDeal,
    CheapSharkError,
    type CheapSharkErrorCode,
    getDealsBySteamAppId,
    getBestDeal,
    extractSteamAppId,
} from '@/services/cheapshark';

const EMPTY_DEALS: CheapSharkDeal[] = [];

export type DealStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseGameDealResult {
    deal: CheapSharkDeal | null;
    allDeals: CheapSharkDeal[];
    isLoading: boolean;
    error: Error | null;
    status: DealStatus;
    errorCode: CheapSharkErrorCode | null;
    refetch: () => void;
}

export function useGameDeal(imgUrl?: string): UseGameDealResult {
    const steamAppId = extractSteamAppId(imgUrl);

    const query = useQuery({
        queryKey: ['cheapshark', 'deals', steamAppId],
        enabled: Boolean(steamAppId),
        queryFn: async () => {
            if (!steamAppId) {
                return EMPTY_DEALS;
            }
            return getDealsBySteamAppId(steamAppId);
        },
    });

    const { data, error: queryError, isPending, isError, refetch: queryRefetch } = query;

    const allDeals = data ?? EMPTY_DEALS;
    const deal = useMemo(() => getBestDeal(allDeals), [allDeals]);
    const error = queryError instanceof Error ? queryError : null;
    const errorCode = queryError instanceof CheapSharkError
        ? queryError.code
        : queryError
            ? 'network'
            : null;
    const status: DealStatus = !steamAppId
        ? 'idle'
        : isPending
            ? 'loading'
            : isError
                ? 'error'
                : 'success';

    const refetch = useCallback(() => {
        if (!steamAppId) {
            return;
        }

        void queryRefetch({ cancelRefetch: true });
    }, [queryRefetch, steamAppId]);

    return {
        deal,
        allDeals,
        isLoading: isPending,
        error,
        status,
        errorCode,
        refetch,
    };
}
