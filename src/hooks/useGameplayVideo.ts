import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    YouTubeError,
    fetchGameplayVideo,
    hasYouTubeApiKey,
} from '@/services/youtube';

interface GameplayVideoData {
    videoId: string;
    durationSeconds: number;
    viewCount: number;
}

interface CacheEntry {
    video: GameplayVideoData | null;
    fetchedAt: number;
}

interface UseGameplayVideoResult {
    videoId: string | null;
    startSeconds: number;
    isLoading: boolean;
    hasKey: boolean;
}

const CACHE_PREFIX = 'gameplay-video:v3:';
const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const NOT_FOUND_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MIN_LOADING_MS = 320;
function readCache(gameId: number): CacheEntry | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(`${CACHE_PREFIX}${gameId}`);
        if (!raw) {
            return null;
        }

        const entry = JSON.parse(raw) as CacheEntry;
        const ttl = entry.video ? FOUND_TTL_MS : NOT_FOUND_TTL_MS;
        if (!Number.isFinite(entry.fetchedAt) || Date.now() - entry.fetchedAt > ttl) {
            window.localStorage.removeItem(`${CACHE_PREFIX}${gameId}`);
            return null;
        }

        return entry;
    } catch {
        return null;
    }
}

function writeCache(gameId: number, video: GameplayVideoData | null): void {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        const entry: CacheEntry = { video, fetchedAt: Date.now() };
        window.localStorage.setItem(`${CACHE_PREFIX}${gameId}`, JSON.stringify(entry));
    } catch {
        // localStorage indisponível.
    }
}

/** Offset aleatório longe do início e do fim do clipe. */
function computeRandomStart(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 60) {
        return 0;
    }

    const earliest = Math.max(20, Math.floor(durationSeconds * 0.12));
    const latest = Math.max(earliest + 1, Math.floor(durationSeconds * 0.65));
    return earliest + Math.floor(Math.random() * (latest - earliest));
}

export function useGameplayVideo(game: { id: number; title: string } | null): UseGameplayVideoResult {
    const hasKey = hasYouTubeApiKey();
    const gameId = game?.id ?? null;
    const title = game?.title ?? '';
    const enabled = hasKey && gameId !== null && gameId > 0 && title.trim().length > 0;

    const query = useQuery<GameplayVideoData | null>({
        queryKey: ['youtube-gameplay', 'v3', gameId],
        enabled,
        staleTime: FOUND_TTL_MS,
        gcTime: FOUND_TTL_MS,
        retry: false,
        queryFn: async () => {
            if (gameId === null) {
                return null;
            }

            const cached = readCache(gameId);
            if (cached) {
                return cached.video;
            }

            try {
                const video = await fetchGameplayVideo(title);
                const data: GameplayVideoData | null = video
                    ? { videoId: video.id, durationSeconds: video.durationSeconds, viewCount: video.viewCount }
                    : null;
                writeCache(gameId, data);
                return data;
            } catch (error) {
                // Erros de quota/config não devem derrubar a página.
                if (error instanceof YouTubeError && error.code === 'missing_key') {
                    return null;
                }
                throw error;
            }
        },
    });

    const { data, isLoading: queryLoading } = query;
    const videoId = data?.videoId ?? null;
    const durationSeconds = data?.durationSeconds ?? 0;
    const [visibleLoading, setVisibleLoading] = useState(enabled && queryLoading);

    useEffect(() => {
        if (queryLoading) {
            setVisibleLoading(true);
            return;
        }

        if (!visibleLoading) {
            return;
        }

        const timeout = window.setTimeout(() => setVisibleLoading(false), MIN_LOADING_MS);
        return () => window.clearTimeout(timeout);
    }, [gameId, queryLoading, visibleLoading]);

    // Novo offset quando o vídeo resolvido muda.
    const startSeconds = useMemo(() => computeRandomStart(durationSeconds), [durationSeconds]);

    return {
        videoId,
        startSeconds,
        isLoading: enabled && visibleLoading,
        hasKey,
    };
}