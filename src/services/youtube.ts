import { z } from 'zod';
import { reportError } from '@/lib/observability';

export type YouTubeErrorCode =
    | 'missing_key'
    | 'network'
    | 'timeout'
    | 'invalid_response'
    | 'aborted'
    | 'quota';

export class YouTubeError extends Error {
    code: YouTubeErrorCode;
    status: number | null;

    constructor(code: YouTubeErrorCode, message: string, status: number | null = null) {
        super(message);
        this.name = 'YouTubeError';
        this.code = code;
        this.status = status;
    }
}

export interface YouTubeVideo {
    id: string;
    title: string;
    channelTitle: string;
    durationSeconds: number;
    viewCount: number;
    commentCount: number;
    noCommentary: boolean;
}

interface RequestOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

const API_BASE = new URL('https://www.googleapis.com/youtube/v3/');
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SEARCH_RESULTS = 15;
const MIN_DURATION_SECONDS = 90;

/** Títulos que indicam gameplay sem narração. */
const NO_COMMENTARY_RE =
    /\b(no[\s-]?commentary|no[\s-]?comments|sem[\s-]?coment[áa]rios?|silent\s?play|gameplay\s?only|no\s?talking)\b/i;

/** Normaliza título para comparação (acentos, pontuação, espaços). */
function normalizeForMatch(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

const ROMAN_INSTALLMENT_TO_NUMBER: Record<string, string> = {
    i: '1',
    ii: '2',
    iii: '3',
    iv: '4',
    v: '5',
    vi: '6',
    vii: '7',
    viii: '8',
    ix: '9',
    x: '10',
    xi: '11',
    xii: '12',
};

const TRAILING_ROMAN_PATTERN = 'i{1,3}|iv|vi{0,3}|ix|x|xi{0,3}|xii';

function normalizeInstallmentToken(token: string): string | null {
    const lower = token.toLowerCase();
    if (/^\d+$/.test(lower)) {
        return lower;
    }

    return ROMAN_INSTALLMENT_TO_NUMBER[lower] ?? null;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Base da franquia + número da sequência, se houver. */
export function parseGameIdentity(normalizedGameTitle: string): {
    baseTitle: string;
    installment: string | null;
} {
    const arabicTrailing = normalizedGameTitle.match(/^(.*)\s(\d+)$/);
    if (arabicTrailing) {
        const baseTitle = arabicTrailing[1].trim();
        if (baseTitle.length > 0) {
            return { baseTitle, installment: arabicTrailing[2] };
        }
    }

    const romanTrailing = new RegExp(`^(.*)\\s(${TRAILING_ROMAN_PATTERN})$`, 'i').exec(normalizedGameTitle);
    if (romanTrailing) {
        const baseTitle = romanTrailing[1].trim();
        const installment = normalizeInstallmentToken(romanTrailing[2]);
        if (baseTitle.length > 0 && installment) {
            return { baseTitle, installment };
        }
    }

    return { baseTitle: normalizedGameTitle, installment: null };
}

/** Número da sequência no título do vídeo, após o nome base. */
export function extractVideoInstallment(normalizedVideo: string, baseTitle: string): string | null {
    if (!normalizedVideo.includes(baseTitle)) {
        return null;
    }

    const afterBasePattern = new RegExp(
        `${escapeRegExp(baseTitle)}\\s*!?(?:\\s*[-:])?\\s*(\\d+|${TRAILING_ROMAN_PATTERN})\\b`,
        'i'
    );
    const match = afterBasePattern.exec(normalizedVideo);
    if (!match) {
        return null;
    }

    return normalizeInstallmentToken(match[1]);
}

function videoContainsFullGameTitle(normalizedVideo: string, normalizedGame: string): boolean {
    if (!normalizedVideo.includes(normalizedGame)) {
        return false;
    }

    const { baseTitle, installment: gameInstallment } = parseGameIdentity(normalizedGame);
    const videoInstallment = extractVideoInstallment(normalizedVideo, baseTitle);

    if (gameInstallment !== null) {
        return videoInstallment === gameInstallment;
    }

    return videoInstallment === null;
}

/** O vídeo é do jogo certo? Alinha sequências (Spelunky vs Spelunky 2). */
export function isRelevantToGame(videoTitle: string, gameTitle: string): boolean {
    const normalizedVideo = normalizeForMatch(videoTitle);
    const normalizedGame = normalizeForMatch(gameTitle);

    if (!normalizedGame || !normalizedVideo) {
        return false;
    }

    if (videoContainsFullGameTitle(normalizedVideo, normalizedGame)) {
        return true;
    }

    const { baseTitle, installment: gameInstallment } = parseGameIdentity(normalizedGame);

    if (!normalizedVideo.includes(baseTitle)) {
        return false;
    }

    const videoInstallment = extractVideoInstallment(normalizedVideo, baseTitle);

    if (gameInstallment !== null) {
        return videoInstallment === gameInstallment;
    }

    if (videoInstallment !== null) {
        return false;
    }

    const allTokens = baseTitle.split(' ').filter(Boolean);
    const meaningfulTokens = allTokens.filter((token) => token.length >= 3);
    const tokens = meaningfulTokens.length > 0 ? meaningfulTokens : allTokens;

    if (tokens.length === 0) {
        return true;
    }

    const matched = tokens.filter((token) => normalizedVideo.includes(token)).length;
    return matched / tokens.length >= 0.6;
}

function getApiKey(): string | null {
    const key = import.meta.env.VITE_YOUTUBE_API_KEY?.trim();
    return key ? key : null;
}

export function hasYouTubeApiKey(): boolean {
    return getApiKey() !== null;
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

const searchResponseSchema = z.object({
    items: z
        .array(
            z.object({
                id: z
                    .object({ videoId: z.string().optional() })
                    .passthrough()
                    .optional(),
            }).passthrough()
        )
        .optional()
        .default([]),
}).passthrough();

const videoItemSchema = z.object({
    id: z.string(),
    snippet: z
        .object({
            title: z.string().optional().default(''),
            channelTitle: z.string().optional().default(''),
        })
        .passthrough()
        .optional(),
    contentDetails: z
        .object({ duration: z.string().optional().default('') })
        .passthrough()
        .optional(),
    statistics: z
        .object({
            viewCount: z.string().optional(),
            commentCount: z.string().optional(),
        })
        .passthrough()
        .optional(),
    status: z
        .object({
            embeddable: z.boolean().optional(),
            privacyStatus: z.string().optional(),
        })
        .passthrough()
        .optional(),
}).passthrough();

const videosResponseSchema = z.object({
    items: z.array(videoItemSchema).optional().default([]),
}).passthrough();

/** Converte duração ISO 8601 (ex.: PT1H2M30S) para segundos. */
export function parseIsoDurationToSeconds(iso: string): number {
    const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso.trim());
    if (!match) {
        return 0;
    }
    const [, days, hours, minutes, seconds] = match;
    return (
        Number(days ?? 0) * 86400 +
        Number(hours ?? 0) * 3600 +
        Number(minutes ?? 0) * 60 +
        Number(seconds ?? 0)
    );
}

function toCount(value: string | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJson(url: URL, options: RequestOptions): Promise<unknown> {
    const { signal, cleanup, isTimedOut } = withTimeoutSignal(options.signal, options.timeoutMs);

    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal,
        });

        if (!response.ok) {
            if (response.status === 403 || response.status === 429) {
                throw new YouTubeError('quota', `HTTP ${response.status}`, response.status);
            }
            throw new YouTubeError('network', `HTTP ${response.status}`, response.status);
        }

        try {
            return (await response.json()) as unknown;
        } catch {
            throw new YouTubeError('invalid_response', 'Invalid JSON payload');
        }
    } catch (error) {
        if (error instanceof YouTubeError) {
            throw error;
        }
        if (isAbortError(error)) {
            throw isTimedOut()
                ? new YouTubeError('timeout', 'Request timed out')
                : new YouTubeError('aborted', 'Request was aborted');
        }
        throw new YouTubeError('network', 'Network error while calling YouTube');
    } finally {
        cleanup();
    }
}

async function searchVideoIds(query: string, key: string, options: RequestOptions): Promise<string[]> {
    const url = new URL('search', API_BASE);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('videoSyndicated', 'true');
    url.searchParams.set('safeSearch', 'none');
    url.searchParams.set('maxResults', String(MAX_SEARCH_RESULTS));
    url.searchParams.set('key', key);

    const parsed = searchResponseSchema.safeParse(await fetchJson(url, options));
    if (!parsed.success) {
        throw new YouTubeError('invalid_response', 'Unexpected search response shape');
    }

    return parsed.data.items
        .map((item) => item.id?.videoId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

async function getVideoDetails(ids: string[], key: string, options: RequestOptions): Promise<YouTubeVideo[]> {
    if (ids.length === 0) {
        return [];
    }

    const url = new URL('videos', API_BASE);
    url.searchParams.set('part', 'snippet,contentDetails,statistics,status');
    url.searchParams.set('id', ids.join(','));
    url.searchParams.set('maxResults', String(ids.length));
    url.searchParams.set('key', key);

    const parsed = videosResponseSchema.safeParse(await fetchJson(url, options));
    if (!parsed.success) {
        throw new YouTubeError('invalid_response', 'Unexpected videos response shape');
    }

    return parsed.data.items
        .filter((item) => item.status?.embeddable !== false && (item.status?.privacyStatus ?? 'public') === 'public')
        .map((item) => {
            const title = item.snippet?.title ?? '';
            return {
                id: item.id,
                title,
                channelTitle: item.snippet?.channelTitle ?? '',
                durationSeconds: parseIsoDurationToSeconds(item.contentDetails?.duration ?? ''),
                viewCount: toCount(item.statistics?.viewCount),
                commentCount: toCount(item.statistics?.commentCount),
                noCommentary: NO_COMMENTARY_RE.test(title),
            } satisfies YouTubeVideo;
        });
}

/** Melhor clipe: do jogo certo, sem comentário, mais visto; ignora curtos. */
export function selectBestGameplayVideo(videos: YouTubeVideo[], gameTitle: string): YouTubeVideo | null {
    if (videos.length === 0) {
        return null;
    }

    const relevant = videos.filter((video) => isRelevantToGame(video.title, gameTitle));
    if (relevant.length === 0) {
        return null;
    }

    const longEnough = relevant.filter((video) => video.durationSeconds >= MIN_DURATION_SECONDS);
    const pool = longEnough.length > 0 ? longEnough : relevant;

    const noCommentary = pool.filter((video) => video.noCommentary);
    const ranked = (noCommentary.length > 0 ? noCommentary : pool)
        .slice()
        .sort((a, b) => b.viewCount - a.viewCount);

    return ranked[0] ?? null;
}

/** Busca no YouTube um clipe incorporável de gameplay sem comentário. */
export async function fetchGameplayVideo(
    title: string,
    options: RequestOptions = {}
): Promise<YouTubeVideo | null> {
    const key = getApiKey();
    if (!key) {
        throw new YouTubeError('missing_key', 'YouTube API key is not configured');
    }

    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
        return null;
    }

    try {
        let ids = await searchVideoIds(`${normalizedTitle} gameplay no commentary`, key, options);
        if (ids.length === 0) {
            ids = await searchVideoIds(`${normalizedTitle} gameplay`, key, options);
        }

        const details = await getVideoDetails(ids, key, options);
        return selectBestGameplayVideo(details, normalizedTitle);
    } catch (error) {
        reportError(error, { scope: 'youtube:fetchGameplayVideo', metadata: { title: normalizedTitle } });
        throw error;
    }
}
