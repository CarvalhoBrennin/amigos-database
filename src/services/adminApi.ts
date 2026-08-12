import {
    adminAuditResponseSchema,
    adminCatalogResponseSchema,
    adminDashboardSchema,
    adminGameDecisionDataSchema,
    adminGuestSessionsResponseSchema,
    adminLoginResponseSchema,
    adminManagedSessionsResponseSchema,
    adminReferenceDataSchema,
    adminRetentionResultSchema,
    adminRoomDetailsSchema,
    adminRoomsResponseSchema,
    adminUserSchema,
    adminUsersResponseSchema,
    type AdminRole,
    type GameDecisionProfile,
    type GameNetworkPool,
    type GamePlatformOffering,
    type GamePrice,
    type GameSubscriptionAvailability,
} from '@shared/index';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
let adminCsrfToken: string | null = null;

export class AdminApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
        readonly fieldErrors: Array<{ field: string; message: string }> = []
    ) {
        super(message);
        this.name = 'AdminApiError';
    }
}

async function parseError(response: Response): Promise<AdminApiError> {
    const body = await response.json().catch(() => null) as {
        code?: string;
        title?: string;
        detail?: string;
        fieldErrors?: Array<{ field: string; message: string }>;
    } | null;
    return new AdminApiError(
        response.status,
        body?.code ?? 'ADMIN_REQUEST_ERROR',
        body?.detail ?? body?.title ?? 'Não foi possível concluir a solicitação administrativa.',
        body?.fieldErrors ?? []
    );
}

async function adminRequest(path: string, options: { method?: string; body?: unknown } = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
            accept: 'application/json',
            ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(method === 'GET' ? {} : { 'x-admin-csrf-token': adminCsrfToken ?? '' }),
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    if (response.status === 401) adminCsrfToken = null;
    if (!response.ok) throw await parseError(response);
    return response.status === 204 ? null : response.json();
}

export async function loginAdmin(email: string, password: string) {
    const response = adminLoginResponseSchema.parse(await adminRequest('/api/v1/admin/session/login', {
        method: 'POST',
        body: { email, password },
    }));
    adminCsrfToken = response.csrfToken;
    return response;
}

export async function getAdminSession() {
    const response = adminLoginResponseSchema.parse(await adminRequest('/api/v1/admin/session'));
    adminCsrfToken = response.csrfToken;
    return response;
}

export async function logoutAdmin(): Promise<void> {
    await adminRequest('/api/v1/admin/session', { method: 'DELETE' });
    adminCsrfToken = null;
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
    await adminRequest('/api/v1/admin/session/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
    });
    adminCsrfToken = null;
}

export async function getAdminDashboard() {
    return adminDashboardSchema.parse(await adminRequest('/api/v1/admin/dashboard'));
}

export async function listAdminUsers(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    role?: AdminRole;
    active?: boolean;
} = {}) {
    return adminUsersResponseSchema.parse(await adminRequest(`/api/v1/admin/users?${queryString(params)}`));
}

export async function createAdminUser(input: {
    email: string;
    displayName: string;
    password: string;
    role: AdminRole;
}) {
    return adminUserSchema.parse(await adminRequest('/api/v1/admin/users', { method: 'POST', body: input }));
}

export async function updateAdminUser(userId: string, input: {
    displayName?: string;
    role?: AdminRole;
    active?: boolean;
    newPassword?: string;
}) {
    return adminUserSchema.parse(await adminRequest(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        body: input,
    }));
}

export async function listAdminRooms(params: { page?: number; pageSize?: number; search?: string; status?: string } = {}) {
    return adminRoomsResponseSchema.parse(await adminRequest(`/api/v1/admin/rooms?${queryString(params)}`));
}

export async function getAdminRoom(roomId: string) {
    return adminRoomDetailsSchema.parse(await adminRequest(`/api/v1/admin/rooms/${encodeURIComponent(roomId)}`));
}

export async function updateAdminRoom(roomId: string, input: { action: 'CANCEL' | 'EXPIRE' | 'EXTEND'; extendHours?: number }) {
    return adminRoomDetailsSchema.parse(await adminRequest(`/api/v1/admin/rooms/${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        body: input,
    }));
}

export async function deleteAdminRoom(roomId: string, confirmationCode: string): Promise<void> {
    await adminRequest(
        `/api/v1/admin/rooms/${encodeURIComponent(roomId)}?confirmation=${encodeURIComponent(confirmationCode)}`,
        { method: 'DELETE' }
    );
}

export async function listAdminGuestSessions(params: { page?: number; pageSize?: number; search?: string } = {}) {
    return adminGuestSessionsResponseSchema.parse(await adminRequest(`/api/v1/admin/guest-sessions?${queryString(params)}`));
}

export async function revokeAdminGuestSession(sessionId: string): Promise<void> {
    await adminRequest(`/api/v1/admin/guest-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function listManagedAdminSessions(params: { page?: number; pageSize?: number; search?: string } = {}) {
    return adminManagedSessionsResponseSchema.parse(await adminRequest(`/api/v1/admin/admin-sessions?${queryString(params)}`));
}

export async function revokeManagedAdminSession(sessionId: string): Promise<void> {
    await adminRequest(`/api/v1/admin/admin-sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function listAdminAudit(params: {
    page?: number;
    pageSize?: number;
    action?: string;
    entityType?: string;
    actorId?: string;
} = {}) {
    return adminAuditResponseSchema.parse(await adminRequest(`/api/v1/admin/audit?${queryString(params)}`));
}

export async function runAdminRetention() {
    return adminRetentionResultSchema.parse(await adminRequest('/api/v1/admin/retention/run', { method: 'POST' }));
}

export async function listAdminCatalog(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
} = {}) {
    return adminCatalogResponseSchema.parse(await adminRequest(`/api/v1/admin/games?${queryString(params)}`));
}

export async function getAdminGame(gameId: string) {
    return adminGameDecisionDataSchema.parse(await adminRequest(`/api/v1/admin/games/${encodeURIComponent(gameId)}`));
}

export async function saveAdminGameProfile(gameId: string, profile: GameDecisionProfile) {
    return adminGameDecisionDataSchema.parse(await adminRequest(`/api/v1/admin/games/${encodeURIComponent(gameId)}/profile`, {
        method: 'PUT',
        body: profile,
    }));
}

export async function deleteAdminGameProfile(gameId: string) {
    return adminGameDecisionDataSchema.parse(await adminRequest(`/api/v1/admin/games/${encodeURIComponent(gameId)}/profile`, {
        method: 'DELETE',
    }));
}

type DecisionResource = 'offerings' | 'network-pools' | 'subscription-availability' | 'prices';
type DecisionResourceDelete = 'offering' | 'network-pool' | 'subscription-availability' | 'price';

export async function saveAdminOffering(gameId: string, input: GamePlatformOffering, id?: string) {
    return saveDecisionResource(gameId, 'offerings', input, id);
}

export async function saveAdminNetworkPool(gameId: string, input: GameNetworkPool, id?: string) {
    return saveDecisionResource(gameId, 'network-pools', input, id);
}

export async function saveAdminSubscriptionAvailability(gameId: string, input: GameSubscriptionAvailability, id?: string) {
    return saveDecisionResource(gameId, 'subscription-availability', input, id);
}

export async function saveAdminPrice(gameId: string, input: GamePrice, id?: string) {
    return saveDecisionResource(gameId, 'prices', input, id);
}

async function saveDecisionResource(gameId: string, resource: DecisionResource, input: unknown, id?: string) {
    const suffix = id ? `/${encodeURIComponent(id)}` : '';
    return adminGameDecisionDataSchema.parse(await adminRequest(
        `/api/v1/admin/games/${encodeURIComponent(gameId)}/${resource}${suffix}`,
        { method: id ? 'PUT' : 'POST', body: input }
    ));
}

export async function deleteAdminDecisionResource(
    gameId: string,
    resource: DecisionResourceDelete,
    id: string
) {
    return adminGameDecisionDataSchema.parse(await adminRequest(
        `/api/v1/admin/games/${encodeURIComponent(gameId)}/${resource}/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
    ));
}

export async function getAdminReferences() {
    return adminReferenceDataSchema.parse(await adminRequest('/api/v1/admin/references'));
}

export async function saveAdminReference(resource: string, input: unknown, id?: string) {
    const suffix = id ? `/${encodeURIComponent(id)}` : '';
    return adminReferenceDataSchema.parse(await adminRequest(
        `/api/v1/admin/references/${encodeURIComponent(resource)}${suffix}`,
        { method: id ? 'PUT' : 'POST', body: input }
    ));
}

export async function deleteAdminReference(resource: string, id: string) {
    return adminReferenceDataSchema.parse(await adminRequest(
        `/api/v1/admin/references/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
    ));
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
    const result = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') result.set(key, String(value));
    }
    return result.toString();
}
