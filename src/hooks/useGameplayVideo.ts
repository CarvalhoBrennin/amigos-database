import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getGameplayMedia } from '@/services/roomApi';

interface GameplayVideoData {
    videoId: string;
    durationSeconds: number;
    viewCount: number;
}

interface UseGameplayVideoResult {
    videoId: string | null;
    startSeconds: number;
    isLoading: boolean;
}

const CLIENT_STALE_TIME_MS = 60 * 60 * 1000;
const MIN_LOADING_MS = 320;

/** Picks an offset away from the beginning and end of the clip. */
function computeRandomStart(durationSeconds: number): number {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 60) {
        return 0;
    }

    const earliest = Math.max(20, Math.floor(durationSeconds * 0.12));
    const latest = Math.max(earliest + 1, Math.floor(durationSeconds * 0.65));
    return earliest + Math.floor(Math.random() * (latest - earliest));
}

export function useGameplayVideo(game: { id: number | string; title: string } | null): UseGameplayVideoResult {
    const gameId = game?.id ?? null;
    const enabled = gameId !== null && String(gameId).trim().length > 0 && String(gameId) !== '0';

    const query = useQuery<GameplayVideoData | null>({
        queryKey: ['gameplay-media', gameId],
        enabled,
        staleTime: CLIENT_STALE_TIME_MS,
        gcTime: CLIENT_STALE_TIME_MS,
        retry: false,
        queryFn: async () => {
            if (gameId === null) {
                return null;
            }
            return (await getGameplayMedia(String(gameId))).video;
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

    const startSeconds = useMemo(() => computeRandomStart(durationSeconds), [durationSeconds]);

    return {
        videoId,
        startSeconds,
        isLoading: enabled && visibleLoading,
    };
}
