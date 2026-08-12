import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
    adminAuditResponseSchema,
    adminCatalogResponseSchema,
    adminChangeOwnPasswordRequestSchema,
    adminCreateNetworkPoolRequestSchema,
    adminCreatePlatformOfferingRequestSchema,
    adminCreatePriceRequestSchema,
    adminCreateSubscriptionAvailabilityRequestSchema,
    adminCreateUserRequestSchema,
    adminDashboardSchema,
    adminGameDecisionDataSchema,
    adminGuestSessionsResponseSchema,
    adminLoginRequestSchema,
    adminLoginResponseSchema,
    adminManagedSessionsResponseSchema,
    adminPaginationSchema,
    adminPlanRegionMutationSchema,
    adminPlatformMutationSchema,
    adminReferenceDataSchema,
    adminReferenceResourceSchema,
    adminRetentionResultSchema,
    adminRoleSchema,
    adminRoomDetailsSchema,
    adminRoomsResponseSchema,
    adminRoomStatusSchema,
    adminSubscriptionPlanMutationSchema,
    adminSubscriptionServiceMutationSchema,
    adminUpdateRoomRequestSchema,
    adminUpdateUserRequestSchema,
    adminUpsertDecisionProfileRequestSchema,
    adminUserSchema,
    adminUsersResponseSchema,
} from '../../../../shared/index.js';
import type { AdminDecisionDataService } from './admin-decision-data-service.js';
import type { AdminOperationsService } from './admin-operations-service.js';
import type { AdminReferenceService } from './admin-reference-service.js';
import type { AdminSessionService, AuthenticatedAdmin } from './admin-session-service.js';

const uuidParamsSchema = z.object({ id: z.string().uuid() });
const roomParamsSchema = z.object({ roomId: z.string().uuid() });
const gameParamsSchema = z.object({ gameId: z.string().trim().min(1).max(64) });
const gameResourceParamsSchema = gameParamsSchema.extend({ id: z.string().uuid() });
const referenceParamsSchema = z.object({ resource: adminReferenceResourceSchema });
const referenceItemParamsSchema = referenceParamsSchema.extend({ id: z.string().trim().min(1).max(100) });
const roomDeleteQuerySchema = z.object({ confirmation: z.string().trim().min(4).max(12) });
const optionalBooleanSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

const userListQuerySchema = adminPaginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    role: adminRoleSchema.optional(),
    active: optionalBooleanSchema.optional(),
});
const roomListQuerySchema = adminPaginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    status: adminRoomStatusSchema.optional(),
});
const sessionListQuerySchema = adminPaginationSchema.extend({
    search: z.string().trim().max(100).optional(),
});
const auditListQuerySchema = adminPaginationSchema.extend({
    action: z.string().trim().max(80).optional(),
    entityType: z.string().trim().max(80).optional(),
    actorId: z.string().uuid().optional(),
});
const catalogListQuerySchema = adminPaginationSchema.extend({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['COMPLETE', 'PARTIAL', 'UNKNOWN', 'MISSING']).optional(),
});
const decisionResourceSchema = z.enum(['offering', 'network-pool', 'subscription-availability', 'price']);
const deleteDecisionParamsSchema = gameResourceParamsSchema.extend({ resource: decisionResourceSchema });

export async function registerAdminRoutes(
    app: FastifyInstance,
    dependencies: {
        sessions: AdminSessionService;
        operations: AdminOperationsService;
        decisionData: AdminDecisionDataService;
        references: AdminReferenceService;
    }
): Promise<void> {
    app.post('/api/v1/admin/session/login', {
        config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    }, async (request, reply) => {
        const body = adminLoginRequestSchema.parse(request.body);
        const result = await dependencies.sessions.login({ ...body, request, reply });
        void reply.header('cache-control', 'no-store');
        return adminLoginResponseSchema.parse({ ...result.session, csrfToken: result.csrfToken });
    });

    app.get('/api/v1/admin/session', async (request, reply) => {
        const admin = await dependencies.sessions.authenticate(request);
        void reply.header('cache-control', 'no-store');
        return adminLoginResponseSchema.parse({
            user: admin.user,
            permissions: admin.permissions,
            expiresAt: admin.expiresAt.toISOString(),
            csrfToken: dependencies.sessions.getCsrfToken(request),
        });
    });

    app.delete('/api/v1/admin/session', async (request, reply) => {
        const admin = await dependencies.sessions.authenticateMutation(request);
        await dependencies.sessions.logout(admin, reply, request.id);
        return reply.code(204).send();
    });

    app.post('/api/v1/admin/session/password', async (request, reply) => {
        const admin = await dependencies.sessions.authenticateMutation(request);
        const body = adminChangeOwnPasswordRequestSchema.parse(request.body);
        await dependencies.operations.changeOwnPassword({
            userId: admin.user.id,
            ...body,
            requestId: request.id,
        });
        dependencies.sessions.clearCookie(reply);
        return reply.code(204).send();
    });

    app.get('/api/v1/admin/dashboard', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'DASHBOARD_READ');
        void reply.header('cache-control', 'no-store');
        return adminDashboardSchema.parse(await dependencies.operations.dashboard());
    });

    app.get('/api/v1/admin/users', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'ADMIN_USERS_READ');
        const query = userListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminUsersResponseSchema.parse(await dependencies.operations.listUsers(query));
    });

    app.post('/api/v1/admin/users', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'ADMIN_USERS_WRITE');
        const body = adminCreateUserRequestSchema.parse(request.body);
        const user = await dependencies.operations.createUser({
            ...body,
            actorId: admin.user.id,
            requestId: request.id,
        });
        return reply.code(201).send(adminUserSchema.parse(user));
    });

    app.patch('/api/v1/admin/users/:id', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'ADMIN_USERS_WRITE');
        const params = uuidParamsSchema.parse(request.params);
        const body = adminUpdateUserRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return adminUserSchema.parse(await dependencies.operations.updateUser({
            userId: params.id,
            ...body,
            actorId: admin.user.id,
            requestId: request.id,
        }));
    });

    app.get('/api/v1/admin/rooms', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'ROOMS_READ');
        const query = roomListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminRoomsResponseSchema.parse(await dependencies.operations.listRooms(query));
    });

    app.get('/api/v1/admin/rooms/:roomId', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'ROOMS_READ');
        const params = roomParamsSchema.parse(request.params);
        void reply.header('cache-control', 'no-store');
        return adminRoomDetailsSchema.parse(await dependencies.operations.getRoom(params.roomId));
    });

    app.patch('/api/v1/admin/rooms/:roomId', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'ROOMS_WRITE');
        const params = roomParamsSchema.parse(request.params);
        const body = adminUpdateRoomRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return adminRoomDetailsSchema.parse(await dependencies.operations.updateRoom({
            roomId: params.roomId,
            ...body,
            actorId: admin.user.id,
            requestId: request.id,
        }));
    });

    app.delete('/api/v1/admin/rooms/:roomId', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'ROOMS_DELETE');
        const params = roomParamsSchema.parse(request.params);
        const query = roomDeleteQuerySchema.parse(request.query);
        await dependencies.operations.deleteRoom({
            roomId: params.roomId,
            confirmationCode: query.confirmation,
            actorId: admin.user.id,
            requestId: request.id,
        });
        return reply.code(204).send();
    });

    app.get('/api/v1/admin/guest-sessions', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'SESSIONS_READ');
        const query = sessionListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminGuestSessionsResponseSchema.parse(await dependencies.operations.listGuestSessions(query));
    });

    app.delete('/api/v1/admin/guest-sessions/:id', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'SESSIONS_WRITE');
        const params = uuidParamsSchema.parse(request.params);
        await dependencies.operations.revokeGuestSession({
            sessionId: params.id,
            actorId: admin.user.id,
            requestId: request.id,
        });
        return reply.code(204).send();
    });

    app.get('/api/v1/admin/admin-sessions', async (request, reply) => {
        const admin = await dependencies.sessions.authenticate(request);
        const query = sessionListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminManagedSessionsResponseSchema.parse(await dependencies.operations.listAdminSessions({
            ...query,
            actorId: admin.user.id,
            currentSessionId: admin.sessionId,
            canManageAll: admin.permissions.includes('ADMIN_USERS_READ'),
        }));
    });

    app.delete('/api/v1/admin/admin-sessions/:id', async (request, reply) => {
        const admin = await dependencies.sessions.authenticateMutation(request);
        const params = uuidParamsSchema.parse(request.params);
        const result = await dependencies.operations.revokeAdminSession({
            sessionId: params.id,
            currentSessionId: admin.sessionId,
            actorId: admin.user.id,
            canManageAll: admin.permissions.includes('ADMIN_USERS_WRITE'),
            requestId: request.id,
        });
        if (result.current) dependencies.sessions.clearCookie(reply);
        return reply.code(204).send();
    });

    app.get('/api/v1/admin/audit', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'AUDIT_READ');
        const query = auditListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminAuditResponseSchema.parse(await dependencies.operations.listAudit(query));
    });

    app.post('/api/v1/admin/retention/run', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'RETENTION_RUN');
        void reply.header('cache-control', 'no-store');
        return adminRetentionResultSchema.parse(await dependencies.operations.runRetention({
            actorId: admin.user.id,
            requestId: request.id,
        }));
    });

    app.get('/api/v1/admin/games', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'DECISION_DATA_READ');
        const query = catalogListQuerySchema.parse(request.query);
        void reply.header('cache-control', 'no-store');
        return adminCatalogResponseSchema.parse(await dependencies.decisionData.listCatalog(query));
    });

    app.get('/api/v1/admin/games/:gameId', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'DECISION_DATA_READ');
        const params = gameParamsSchema.parse(request.params);
        void reply.header('cache-control', 'no-store');
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.getGame(params.gameId));
    });

    app.put('/api/v1/admin/games/:gameId/profile', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        const body = adminUpsertDecisionProfileRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.upsertProfile(
            params.gameId,
            body,
            auditContext(admin, request)
        ));
    });

    app.delete('/api/v1/admin/games/:gameId/profile', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.deleteProfile(
            params.gameId,
            auditContext(admin, request)
        ));
    });

    registerDecisionResourceRoutes(app, dependencies);

    app.get('/api/v1/admin/references', async (request, reply) => {
        await authorize(request, dependencies.sessions, 'REFERENCES_READ');
        void reply.header('cache-control', 'no-store');
        return adminReferenceDataSchema.parse(await dependencies.references.listAll());
    });

    app.post('/api/v1/admin/references/:resource', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'REFERENCES_WRITE');
        const params = referenceParamsSchema.parse(request.params);
        const result = await mutateReference(dependencies.references, params.resource, request.body, auditContext(admin, request));
        return reply.code(201).send(adminReferenceDataSchema.parse(result));
    });

    app.put('/api/v1/admin/references/:resource/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'REFERENCES_WRITE');
        const params = referenceItemParamsSchema.parse(request.params);
        const result = await mutateReference(dependencies.references, params.resource, request.body, auditContext(admin, request), params.id);
        return adminReferenceDataSchema.parse(result);
    });

    app.delete('/api/v1/admin/references/:resource/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'REFERENCES_WRITE');
        const params = referenceItemParamsSchema.parse(request.params);
        return adminReferenceDataSchema.parse(await dependencies.references.delete(
            params.resource,
            params.id,
            auditContext(admin, request)
        ));
    });
}

function registerDecisionResourceRoutes(
    app: FastifyInstance,
    dependencies: {
        sessions: AdminSessionService;
        decisionData: AdminDecisionDataService;
    }
): void {
    app.post('/api/v1/admin/games/:gameId/offerings', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        const body = adminCreatePlatformOfferingRequestSchema.parse(request.body);
        return reply.code(201).send(adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveOffering(
            params.gameId, body, auditContext(admin, request)
        )));
    });
    app.put('/api/v1/admin/games/:gameId/offerings/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameResourceParamsSchema.parse(request.params);
        const body = adminCreatePlatformOfferingRequestSchema.parse(request.body);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveOffering(
            params.gameId, body, auditContext(admin, request), params.id
        ));
    });
    app.post('/api/v1/admin/games/:gameId/network-pools', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        const body = adminCreateNetworkPoolRequestSchema.parse(request.body);
        return reply.code(201).send(adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveNetworkPool(
            params.gameId, body, auditContext(admin, request)
        )));
    });
    app.put('/api/v1/admin/games/:gameId/network-pools/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameResourceParamsSchema.parse(request.params);
        const body = adminCreateNetworkPoolRequestSchema.parse(request.body);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveNetworkPool(
            params.gameId, body, auditContext(admin, request), params.id
        ));
    });
    app.post('/api/v1/admin/games/:gameId/subscription-availability', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        const body = adminCreateSubscriptionAvailabilityRequestSchema.parse(request.body);
        return reply.code(201).send(adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveSubscriptionAvailability(
            params.gameId, body, auditContext(admin, request)
        )));
    });
    app.put('/api/v1/admin/games/:gameId/subscription-availability/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameResourceParamsSchema.parse(request.params);
        const body = adminCreateSubscriptionAvailabilityRequestSchema.parse(request.body);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.saveSubscriptionAvailability(
            params.gameId, body, auditContext(admin, request), params.id
        ));
    });
    app.post('/api/v1/admin/games/:gameId/prices', async (request, reply) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameParamsSchema.parse(request.params);
        const body = adminCreatePriceRequestSchema.parse(request.body);
        return reply.code(201).send(adminGameDecisionDataSchema.parse(await dependencies.decisionData.savePrice(
            params.gameId, body, auditContext(admin, request)
        )));
    });
    app.put('/api/v1/admin/games/:gameId/prices/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = gameResourceParamsSchema.parse(request.params);
        const body = adminCreatePriceRequestSchema.parse(request.body);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.savePrice(
            params.gameId, body, auditContext(admin, request), params.id
        ));
    });
    app.delete('/api/v1/admin/games/:gameId/:resource/:id', async (request) => {
        const admin = await authorizeMutation(request, dependencies.sessions, 'DECISION_DATA_WRITE');
        const params = deleteDecisionParamsSchema.parse(request.params);
        return adminGameDecisionDataSchema.parse(await dependencies.decisionData.deleteResource(
            params.gameId,
            params.resource,
            params.id,
            auditContext(admin, request)
        ));
    });
}

async function authorize(
    request: FastifyRequest,
    sessions: AdminSessionService,
    permission: Parameters<AdminSessionService['requirePermission']>[1]
): Promise<AuthenticatedAdmin> {
    const admin = await sessions.authenticate(request);
    sessions.requirePermission(admin, permission);
    return admin;
}

async function authorizeMutation(
    request: FastifyRequest,
    sessions: AdminSessionService,
    permission: Parameters<AdminSessionService['requirePermission']>[1]
): Promise<AuthenticatedAdmin> {
    const admin = await sessions.authenticateMutation(request);
    sessions.requirePermission(admin, permission);
    return admin;
}

function auditContext(admin: AuthenticatedAdmin, request: FastifyRequest) {
    return { actorId: admin.user.id, requestId: request.id };
}

async function mutateReference(
    references: AdminReferenceService,
    resource: z.infer<typeof adminReferenceResourceSchema>,
    rawBody: unknown,
    context: { actorId: string; requestId: string },
    id?: string
) {
    if (resource === 'platforms') {
        return references.savePlatform(adminPlatformMutationSchema.parse(rawBody), context, id);
    }
    if (resource === 'services') {
        return references.saveService(adminSubscriptionServiceMutationSchema.parse(rawBody), context, id);
    }
    if (resource === 'plans') {
        return references.savePlan(adminSubscriptionPlanMutationSchema.parse(rawBody), context, id);
    }
    return references.savePlanRegion(adminPlanRegionMutationSchema.parse(rawBody), context, id);
}
