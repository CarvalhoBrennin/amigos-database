import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { roomRealtimeMessageSchema } from '@shared/index';
import { getRoom, getRoomRealtimeUrl, listPlatforms, listSubscriptionPlans } from '@/services/roomApi';

export const roomKeys = {
    all: ['rooms'] as const,
    detail: (code: string) => ['rooms', code.toUpperCase()] as const,
    platforms: ['reference', 'platforms'] as const,
    plans: (region: string) => ['reference', 'subscription-plans', region] as const,
    nextCard: (code: string) => ['rooms', code.toUpperCase(), 'next-card'] as const,
    matches: (code: string) => ['rooms', code.toUpperCase(), 'matches'] as const,
    finalist: (code: string, gameId: string) => ['rooms', code.toUpperCase(), 'finalists', gameId] as const,
};

export function useRoom(code: string) {
    return useQuery({
        queryKey: roomKeys.detail(code),
        queryFn: () => getRoom(code),
        retry: (count, error) => {
            const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
            return status === 401 || status === 403 || status === 404 ? false : count < 2;
        },
        staleTime: 0,
    });
}

export function useRoomReferences(region = 'BR') {
    const platforms = useQuery({ queryKey: roomKeys.platforms, queryFn: listPlatforms, staleTime: 300_000 });
    const plans = useQuery({ queryKey: roomKeys.plans(region), queryFn: () => listSubscriptionPlans(region), staleTime: 300_000 });
    return { platforms, plans };
}

export function useRoomRealtime(code: string, enabled: boolean, currentVersion: number | undefined) {
    const queryClient = useQueryClient();
    const latestVersion = useRef(currentVersion ?? 0);

    useEffect(() => {
        latestVersion.current = currentVersion ?? latestVersion.current;
    }, [currentVersion]);

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }
        let socket: WebSocket | null = null;
        let reconnectTimer: number | null = null;
        let closed = false;
        let attempt = 0;

        const connect = () => {
            socket = new WebSocket(getRoomRealtimeUrl(code, attempt > 0));
            socket.addEventListener('open', () => {
                attempt = 0;
                void queryClient.invalidateQueries({ queryKey: roomKeys.detail(code) });
                void queryClient.invalidateQueries({ queryKey: roomKeys.nextCard(code) });
                void queryClient.invalidateQueries({ queryKey: roomKeys.matches(code) });
            });
            socket.addEventListener('message', (event) => {
                let payload: unknown;
                try {
                    payload = JSON.parse(String(event.data));
                } catch {
                    return;
                }
                const parsed = roomRealtimeMessageSchema.safeParse(payload);
                if (!parsed.success) {
                    return;
                }
                if (parsed.data.roomVersion > latestVersion.current) {
                    latestVersion.current = parsed.data.roomVersion;
                    void queryClient.invalidateQueries({ queryKey: roomKeys.detail(code) });
                    if (['VOTE_PROGRESS_CHANGED', 'MATCH_CREATED', 'MATCH_TARGET_REACHED'].includes(parsed.data.eventType)) {
                        void queryClient.invalidateQueries({ queryKey: roomKeys.nextCard(code) });
                        void queryClient.invalidateQueries({ queryKey: roomKeys.matches(code) });
                    }
                }
            });
            socket.addEventListener('close', () => {
                if (closed) {
                    return;
                }
                attempt += 1;
                reconnectTimer = window.setTimeout(connect, Math.min(1_000 * 2 ** attempt, 10_000));
            });
        };

        connect();
        return () => {
            closed = true;
            if (reconnectTimer !== null) {
                window.clearTimeout(reconnectTimer);
            }
            socket?.close();
        };
    }, [code, enabled, queryClient]);
}
