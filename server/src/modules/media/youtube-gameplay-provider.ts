import { z } from 'zod';
import type { GameplayMediaResponse } from '../../../../shared/index.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';

const API_BASE = new URL('https://www.googleapis.com/youtube/v3/');
const MAX_SEARCH_RESULTS = 15;
const MIN_DURATION_SECONDS = 90;
const REQUEST_TIMEOUT_MS = 8_000;
const NO_COMMENTARY_RE = /\b(no[\s-]?commentary|no[\s-]?comments|sem[\s-]?coment[áa]rios?|silent\s?play|gameplay\s?only|no\s?talking)\b/i;
const TRAILING_ROMAN_PATTERN = 'i{1,3}|iv|vi{0,3}|ix|x|xi{0,3}|xii';
const ROMAN_INSTALLMENT_TO_NUMBER: Record<string, string> = {
    i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12',
};

const searchResponseSchema = z.object({
    items: z.array(z.object({ id: z.object({ videoId: z.string().optional() }).optional() }).passthrough()).default([]),
}).passthrough();
const videosResponseSchema = z.object({
    items: z.array(z.object({
        id: z.string(),
        snippet: z.object({ title: z.string().default(''), channelTitle: z.string().default('') }).partial().optional(),
        contentDetails: z.object({ duration: z.string().default('') }).partial().optional(),
        statistics: z.object({ viewCount: z.string().optional(), commentCount: z.string().optional() }).optional(),
        status: z.object({ embeddable: z.boolean().optional(), privacyStatus: z.string().optional() }).optional(),
    }).passthrough()).default([]),
}).passthrough();

export interface YouTubeVideo {
    id: string;
    title: string;
    channelTitle: string;
    durationSeconds: number;
    viewCount: number;
    commentCount: number;
    noCommentary: boolean;
}

interface CacheEntry {
    response: GameplayMediaResponse;
    expiresAt: number;
}

export class YouTubeGameplayProvider {
    private readonly cache = new Map<string, CacheEntry>();

    constructor(
        private readonly apiKey: string | null,
        private readonly foundTtlHours: number,
        private readonly negativeTtlHours: number,
        private readonly fetchFn: typeof fetch = fetch,
        private readonly metrics: Metrics = noopMetrics
    ) {}

    async getGameplay(gameId: string, title: string): Promise<GameplayMediaResponse> {
        const cached = this.cache.get(gameId);
        if (cached && cached.expiresAt > Date.now()) {
            return { ...cached.response, cached: true };
        }
        if (!this.apiKey) {
            return { video: null, source: 'YOUTUBE', cached: false };
        }
        const ids = await this.searchIds(`${title} gameplay no commentary`)
            .then(async (results) => results.length > 0 ? results : this.searchIds(`${title} gameplay`));
        const video = selectBestGameplayVideo(await this.getDetails(ids), title);
        const response: GameplayMediaResponse = {
            video: video ? {
                videoId: video.id,
                title: video.title,
                durationSeconds: video.durationSeconds,
                viewCount: video.viewCount,
            } : null,
            source: 'YOUTUBE',
            cached: false,
        };
        const ttlHours = video ? this.foundTtlHours : this.negativeTtlHours;
        this.cache.set(gameId, { response, expiresAt: Date.now() + ttlHours * 60 * 60 * 1_000 });
        return response;
    }

    private async searchIds(query: string): Promise<string[]> {
        const url = new URL('search', API_BASE);
        url.search = new URLSearchParams({
            part: 'snippet', q: query, type: 'video', order: 'relevance',
            videoEmbeddable: 'true', videoSyndicated: 'true', safeSearch: 'none',
            maxResults: String(MAX_SEARCH_RESULTS), key: this.apiKey ?? '',
        }).toString();
        const parsed = searchResponseSchema.parse(await this.fetchJson(url));
        return parsed.items.map((item) => item.id?.videoId).filter((id): id is string => Boolean(id));
    }

    private async getDetails(ids: string[]): Promise<YouTubeVideo[]> {
        if (ids.length === 0) return [];
        const url = new URL('videos', API_BASE);
        url.search = new URLSearchParams({
            part: 'snippet,contentDetails,statistics,status', id: ids.join(','),
            maxResults: String(ids.length), key: this.apiKey ?? '',
        }).toString();
        const parsed = videosResponseSchema.parse(await this.fetchJson(url));
        return parsed.items
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
                };
            });
    }

    private async fetchJson(url: URL): Promise<unknown> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        this.metrics.record({
            name: 'youtube_requests_total',
            value: 1,
            labels: { resource: url.pathname.split('/').filter(Boolean).at(-1) ?? 'unknown' },
        });
        try {
            const response = await this.fetchFn(url, {
                method: 'GET',
                headers: { accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`YouTube request failed with status ${response.status}`);
            return await response.json() as unknown;
        } catch (error) {
            this.metrics.record({
                name: 'youtube_errors_total',
                value: 1,
                labels: { reason: error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'request' },
            });
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }
}

export function parseIsoDurationToSeconds(iso: string): number {
    const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso.trim());
    if (!match) return 0;
    return Number(match[1] ?? 0) * 86_400 + Number(match[2] ?? 0) * 3_600
        + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
}

export function parseGameIdentity(normalizedGameTitle: string): { baseTitle: string; installment: string | null } {
    const match = new RegExp(`^(.*)\\s(\\d+|${TRAILING_ROMAN_PATTERN})$`, 'i').exec(normalizedGameTitle);
    if (!match?.[1] || !match[2]) return { baseTitle: normalizedGameTitle, installment: null };
    const installment = normalizeInstallmentToken(match[2]);
    return installment ? { baseTitle: match[1].trim(), installment } : { baseTitle: normalizedGameTitle, installment: null };
}

export function extractVideoInstallment(normalizedVideo: string, baseTitle: string): string | null {
    if (!normalizedVideo.includes(baseTitle)) return null;
    const match = new RegExp(`${escapeRegExp(baseTitle)}\\s*!?(?:\\s*[-:])?\\s*(\\d+|${TRAILING_ROMAN_PATTERN})\\b`, 'i').exec(normalizedVideo);
    return match?.[1] ? normalizeInstallmentToken(match[1]) : null;
}

export function isRelevantToGame(videoTitle: string, gameTitle: string): boolean {
    const video = normalizeForMatch(videoTitle);
    const game = normalizeForMatch(gameTitle);
    if (!video || !game) return false;
    const { baseTitle, installment } = parseGameIdentity(game);
    if (!video.includes(baseTitle)) return false;
    const videoInstallment = extractVideoInstallment(video, baseTitle);
    if (installment !== null) return videoInstallment === installment;
    if (videoInstallment !== null) return false;
    if (video.includes(game)) return true;
    const allTokens = baseTitle.split(' ').filter(Boolean);
    const meaningful = allTokens.filter((token) => token.length >= 3);
    const tokens = meaningful.length > 0 ? meaningful : allTokens;
    return tokens.length === 0 || tokens.filter((token) => video.includes(token)).length / tokens.length >= 0.6;
}

export function selectBestGameplayVideo(videos: YouTubeVideo[], gameTitle: string): YouTubeVideo | null {
    const relevant = videos.filter((video) => isRelevantToGame(video.title, gameTitle));
    if (relevant.length === 0) return null;
    const longEnough = relevant.filter((video) => video.durationSeconds >= MIN_DURATION_SECONDS);
    const pool = longEnough.length > 0 ? longEnough : relevant;
    const noCommentary = pool.filter((video) => video.noCommentary);
    return [...(noCommentary.length > 0 ? noCommentary : pool)].sort((left, right) => right.viewCount - left.viewCount)[0] ?? null;
}

function normalizeForMatch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeInstallmentToken(token: string): string | null {
    const lower = token.toLowerCase();
    return /^\d+$/.test(lower) ? lower : ROMAN_INSTALLMENT_TO_NUMBER[lower] ?? null;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toCount(value: string | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
