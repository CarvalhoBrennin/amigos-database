import {
    catalogSearchResponseSchema,
    createRoomResponseSchema,
    finalistDetailsSchema,
    gameplayMediaResponseSchema,
    guestSessionResponseSchema,
    joinRoomResponseSchema,
    matchesResponseSchema,
    nextCardResponseSchema,
    platformsResponseSchema,
    roomPublicSnapshotSchema,
    startRoomResponseSchema,
    subscriptionPlansResponseSchema,
    submitVoteResponseSchema,
    type ParticipantProfile,
    type RoomConstraints,
    type RoomGameHistoryDisposition,
    type RoomPublicSnapshot,
    type VoteValue,
} from '@shared/index';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
let guestSessionPromise: Promise<{ csrfToken: string; expiresAt: string }> | null = null;

export class RoomApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly currentVersion?: number
    ) {
        super(message);
        this.name = 'RoomApiError';
    }
}

async function parseError(response: Response): Promise<RoomApiError> {
    const body = await response.json().catch(() => null) as {
        code?: string;
        title?: string;
        detail?: string;
        currentVersion?: number;
    } | null;
    return new RoomApiError(
        response.status,
        body?.code ?? 'REQUEST_ERROR',
        body?.detail ?? body?.title ?? 'Não foi possível concluir a solicitação.',
        body?.currentVersion
    );
}

async function bootstrapGuestSession(force = false): Promise<{ csrfToken: string; expiresAt: string }> {
    if (force) {
        guestSessionPromise = null;
    }
    guestSessionPromise ??= fetch(`${apiBaseUrl}/api/v1/session/guest`, {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json' },
    }).then(async (response) => {
        if (!response.ok) {
            guestSessionPromise = null;
            throw await parseError(response);
        }
        return guestSessionResponseSchema.parse(await response.json());
    });
    return guestSessionPromise;
}

async function requestJson(
    path: string,
    options: {
        method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
        body?: unknown;
        idempotencyKey?: string;
        retrySession?: boolean;
    } = {}
): Promise<unknown> {
    const method = options.method ?? 'GET';
    const session = await bootstrapGuestSession();
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
            accept: 'application/json',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(method === 'GET' ? {} : { 'x-csrf-token': session.csrfToken }),
            ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (response.status === 401 && options.retrySession !== false) {
        await bootstrapGuestSession(true);
        return requestJson(path, { ...options, retrySession: false });
    }
    if (!response.ok) {
        throw await parseError(response);
    }
    return response.status === 204 ? null : response.json();
}

export function createIdempotencyKey(): string {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.randomUUID) {
        return cryptoApi.randomUUID();
    }
    if (cryptoApi?.getRandomValues) {
        const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    throw new Error('Secure randomness is unavailable');
}

export async function createRoom(
    hostNickname: string,
    idempotencyKey = createIdempotencyKey()
): Promise<ReturnType<typeof createRoomResponseSchema.parse>> {
    return createRoomResponseSchema.parse(await requestJson('/api/v1/rooms', {
        method: 'POST',
        body: { hostNickname, regionCode: 'BR' },
        idempotencyKey,
    }));
}

export async function joinRoom(code: string, nickname: string, inviteToken?: string) {
    return joinRoomResponseSchema.parse(await requestJson(`/api/v1/rooms/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        body: { nickname, ...(inviteToken ? { inviteToken } : {}) },
    }));
}

export async function getRoom(code: string): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(`/api/v1/rooms/${encodeURIComponent(code)}`));
}

export async function updateMyProfile(
    code: string,
    expectedRoomVersion: number,
    profile: ParticipantProfile
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/participants/me/profile`,
        { method: 'PATCH', body: { expectedRoomVersion, ...profile } }
    ));
}

export async function setMyReady(
    code: string,
    expectedRoomVersion: number,
    ready: boolean
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/participants/me/ready`,
        { method: 'PUT', body: { expectedRoomVersion, ready } }
    ));
}

export async function updateConstraints(
    code: string,
    expectedRoomVersion: number,
    constraints: RoomConstraints
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/constraints`,
        { method: 'PATCH', body: { expectedRoomVersion, constraints } }
    ));
}

export async function addHistory(
    code: string,
    expectedRoomVersion: number,
    gameId: string,
    disposition: RoomGameHistoryDisposition
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(`/api/v1/rooms/${encodeURIComponent(code)}/history`, {
        method: 'POST',
        body: { expectedRoomVersion, gameId, disposition },
    }));
}

export async function removeHistory(
    code: string,
    expectedRoomVersion: number,
    gameId: string
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/history/${encodeURIComponent(gameId)}`,
        { method: 'DELETE', body: { expectedRoomVersion } }
    ));
}

export async function startRoom(code: string, expectedRoomVersion: number) {
    return startRoomResponseSchema.parse(await requestJson(`/api/v1/rooms/${encodeURIComponent(code)}/start`, {
        method: 'POST',
        body: { expectedRoomVersion },
    }));
}

export async function getNextCard(code: string) {
    return nextCardResponseSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/cards/next`
    ));
}

export async function submitVote(code: string, gameId: string, value: VoteValue) {
    return submitVoteResponseSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/votes/${encodeURIComponent(gameId)}`,
        { method: 'PUT', body: { value } }
    ));
}

export async function getMatches(code: string) {
    return matchesResponseSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/matches`
    ));
}

export async function openShortlist(code: string, expectedRoomVersion: number): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/shortlist`,
        { method: 'POST', body: { expectedRoomVersion } }
    ));
}

export async function getFinalistDetails(code: string, gameId: string) {
    return finalistDetailsSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/games/${encodeURIComponent(gameId)}/details`
    ));
}

export async function completeRoom(
    code: string,
    gameId: string,
    expectedRoomVersion: number
): Promise<RoomPublicSnapshot> {
    return roomPublicSnapshotSchema.parse(await requestJson(
        `/api/v1/rooms/${encodeURIComponent(code)}/decision`,
        { method: 'POST', body: { gameId, expectedRoomVersion } }
    ));
}

export async function getGameplayMedia(gameId: string) {
    return gameplayMediaResponseSchema.parse(await requestJson(
        `/api/v1/games/${encodeURIComponent(gameId)}/media/gameplay`
    ));
}

export async function listPlatforms() {
    return platformsResponseSchema.parse(await requestJson('/api/v1/reference/platforms')).platforms;
}

export async function listSubscriptionPlans(region = 'BR') {
    return subscriptionPlansResponseSchema.parse(await requestJson(
        `/api/v1/reference/subscription-plans?region=${encodeURIComponent(region)}`
    )).plans;
}

export async function searchCatalog(query: string, language = 'pt') {
    const params = new URLSearchParams({ q: query, limit: '10', language });
    return catalogSearchResponseSchema.parse(await requestJson(`/api/v1/catalog/search?${params}`)).games;
}

export function getRoomRealtimeUrl(code: string, reconnect = false): string {
    const httpUrl = new URL(`${apiBaseUrl}/api/v1/realtime/rooms/${encodeURIComponent(code)}`, window.location.origin);
    if (reconnect) httpUrl.searchParams.set('reconnect', '1');
    httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return httpUrl.toString();
}
