import { z } from 'zod';
import { reportError } from '@/lib/observability';

export interface CheapSharkDeal {
    internalName: string;
    title: string;
    dealID: string;
    storeID: string;
    gameID: string;
    salePrice: string;
    normalPrice: string;
    isOnSale: string;
    savings: string;
    metacriticScore: string;
    steamRatingText: string;
    steamRatingPercent: string;
    steamRatingCount: string;
    steamAppID: string;
    releaseDate: number;
    dealRating: string;
    thumb: string;
}

export interface CheapSharkSearchResult {
    gameID: string;
    steamAppID: string;
    cheapest: string;
    external: string;
}

const cheapSharkDealSchema = z.object({
    internalName: z.string().optional().default(''),
    title: z.string(),
    dealID: z.string(),
    storeID: z.string(),
    gameID: z.string(),
    salePrice: z.string(),
    normalPrice: z.string(),
    isOnSale: z.string().optional().default('0'),
    savings: z.string().optional().default('0'),
    metacriticScore: z.string().optional().default('0'),
    steamRatingText: z.string().optional().default(''),
    steamRatingPercent: z.string().optional().default('0'),
    steamRatingCount: z.string().optional().default('0'),
    steamAppID: z.string(),
    releaseDate: z.union([z.number(), z.string()]).transform((value) => Number(value)).pipe(z.number()),
    dealRating: z.string().optional().default('0'),
    thumb: z.string().optional().default(''),
}).passthrough();

const cheapSharkSearchResultSchema = z.object({
    gameID: z.string(),
    steamAppID: z.string(),
    cheapest: z.string(),
    external: z.string(),
}).passthrough();

interface RequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

export type CheapSharkErrorCode = 'network' | 'timeout' | 'invalid_response' | 'aborted';

export class CheapSharkError extends Error {
    code: CheapSharkErrorCode;
    status: number | null;

    constructor(code: CheapSharkErrorCode, message: string, status: number | null = null) {
        super(message);
        this.name = 'CheapSharkError';
        this.code = code;
        this.status = status;
    }
}

const BASE_URL = new URL('https://www.cheapshark.com/api/1.0/');
const DEFAULT_TIMEOUT_MS = 8000;

function reportApiError(scope: string, error: unknown): void {
    reportError(error, { scope: `cheapshark:${scope}` });
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException
        ? error.name === 'AbortError'
        : error instanceof Error && error.name === 'AbortError';
}

function withTimeoutSignal(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): {
    signal: AbortSignal;
    cleanup: () => void;
    isTimedOut: () => boolean;
} {
    const controller = new AbortController();
    let timedOut = false;

    const onAbort = () => controller.abort();
    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    }

    const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    return {
        signal: controller.signal,
        cleanup: () => {
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
        },
        isTimedOut: () => timedOut,
    };
}

function parseDealsResponse(data: unknown): CheapSharkDeal[] {
    if (!Array.isArray(data)) {
        throw new CheapSharkError('invalid_response', 'Deals response is not an array');
    }

    const deals = data.flatMap((item) => {
        const parsed = cheapSharkDealSchema.safeParse(item);
        return parsed.success ? [parsed.data as CheapSharkDeal] : [];
    });

    if (data.length > 0 && deals.length === 0) {
        throw new CheapSharkError('invalid_response', 'No valid deals in response');
    }

    return deals;
}

function parseSearchResponse(data: unknown): CheapSharkSearchResult[] {
    if (!Array.isArray(data)) {
        throw new CheapSharkError('invalid_response', 'Search response is not an array');
    }

    const results = data.flatMap((item) => {
        const parsed = cheapSharkSearchResultSchema.safeParse(item);
        return parsed.success ? [parsed.data as CheapSharkSearchResult] : [];
    });

    if (data.length > 0 && results.length === 0) {
        throw new CheapSharkError('invalid_response', 'No valid search results in response');
    }

    return results;
}

async function requestJson<T>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
    options: RequestOptions = {},
    parse: (data: unknown) => T
): Promise<T> {
    const url = new URL(endpoint, BASE_URL);

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    const { signal, cleanup, isTimedOut } = withTimeoutSignal(options.signal, options.timeoutMs);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
            },
            signal,
        });

        if (!response.ok) {
            throw new CheapSharkError('network', `HTTP ${response.status}`, response.status);
        }

        try {
            const data: unknown = await response.json();
            return parse(data);
        } catch (error) {
            if (error instanceof CheapSharkError) {
                throw error;
            }
            throw new CheapSharkError('invalid_response', 'Invalid JSON payload');
        }
    } catch (error) {
        if (error instanceof CheapSharkError) {
            throw error;
        }

        if (isAbortError(error)) {
            if (isTimedOut()) {
                throw new CheapSharkError('timeout', 'Request timed out');
            }
            throw new CheapSharkError('aborted', 'Request was aborted');
        }

        throw new CheapSharkError('network', 'Network error while calling CheapShark');
    } finally {
        cleanup();
    }
}

export async function getDealsBySteamAppId(
    steamAppId: string,
    options: RequestOptions = {}
): Promise<CheapSharkDeal[]> {
    if (!/^\d+$/.test(steamAppId.trim())) {
        return [];
    }

    try {
        return await requestJson(
            'deals',
            { steamAppID: steamAppId.trim() },
            options,
            parseDealsResponse
        );
    } catch (error) {
        reportApiError('getDealsBySteamAppId', error);
        throw error;
    }
}

export async function searchGameByTitle(
    title: string,
    options: RequestOptions = {}
): Promise<CheapSharkSearchResult[]> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
        return [];
    }

    try {
        return await requestJson(
            'games',
            { title: normalizedTitle, limit: 5 },
            options,
            parseSearchResponse
        );
    } catch (error) {
        reportApiError('searchGameByTitle', error);
        throw error;
    }
}

export function getBestDeal(deals: CheapSharkDeal[]): CheapSharkDeal | null {
    if (!deals.length) return null;

    const sortableDeals = deals.filter((deal) => Number.isFinite(Number(deal.salePrice)));
    if (!sortableDeals.length) {
        return null;
    }

    const sorted = [...sortableDeals].sort((a, b) => Number(a.salePrice) - Number(b.salePrice));
    return sorted[0] ?? null;
}

export { extractSteamAppIdFromUrl as extractSteamAppId } from '@/utils/steam';

export const storeNames: Record<string, string> = {
    '1': 'Steam',
    '2': 'GamersGate',
    '3': 'GreenManGaming',
    '7': 'GOG',
    '8': 'Origin',
    '11': 'Humble Bundle',
    '13': 'Uplay',
    '15': 'Fanatical',
    '21': 'WinGameStore',
    '23': 'GameBillet',
    '24': 'Voidu',
    '25': 'Epic Games Store',
    '27': 'Gamesplanet',
    '28': 'Gamesload',
    '29': '2Game',
    '30': 'IndieGala',
    '31': 'Blizzard Shop',
    '33': 'DLGamer',
    '34': 'Noctre',
    '35': 'DreamGame',
};

export function getStoreName(storeId: string): string {
    return storeNames[storeId] || `Store #${storeId}`;
}
