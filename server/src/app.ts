import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { apiProblemSchema } from '../../shared/contracts/api-errors.js';
import type { ServerConfig } from './config/env.js';
import {
    createDatabaseConnection,
    type DatabaseConnection,
} from './infrastructure/db/client.js';
import { AppError, toProblemDetails } from './lib/errors.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { systemClock, type Clock } from './lib/clock.js';
import { GuestSessionService } from './modules/auth/guest-session-service.js';
import { registerSessionRoutes } from './modules/auth/session-routes.js';
import { StaticJsonCatalogGateway } from './modules/catalog/static-json-catalog-gateway.js';
import type { CatalogGateway } from './modules/catalog/catalog-gateway.js';
import { PostgresRoomRepository } from './modules/rooms/postgres-room-repository.js';
import { registerRoomRoutes } from './modules/rooms/room-routes.js';
import { PostgresLobbyRepository } from './modules/rooms/postgres-lobby-repository.js';
import { ReferenceDataRepository } from './modules/reference/reference-data-repository.js';
import { registerReferenceRoutes } from './modules/reference/reference-routes.js';
import { registerCatalogRoutes } from './modules/catalog/catalog-routes.js';
import { PostgresRoomEventBus } from './infrastructure/realtime/postgres-room-event-bus.js';
import { RoomRealtimeHub } from './modules/realtime/room-realtime-hub.js';
import { registerRealtimeRoutes } from './modules/realtime/realtime-routes.js';
import { PostgresDecisionDataRepository } from './modules/recommendation/postgres-decision-data-repository.js';
import { StartRoomService } from './modules/rooms/start-room-service.js';
import { VotingService } from './modules/voting/voting-service.js';
import { registerVotingRoutes } from './modules/voting/voting-routes.js';
import { FinalistService } from './modules/rooms/finalist-service.js';
import { registerFinalistRoutes } from './modules/rooms/finalist-routes.js';
import { YouTubeGameplayProvider } from './modules/media/youtube-gameplay-provider.js';
import { registerMediaRoutes } from './modules/media/media-routes.js';
import {
    StructuredLogMetrics,
    type Metrics,
} from './lib/metrics.js';
import type { ProductAnalytics } from './modules/analytics/product-analytics.js';
import { StructuredLogProductAnalytics } from './modules/analytics/structured-log-product-analytics.js';
import { AdminSessionService } from './modules/admin/admin-session-service.js';
import { AdminAuditService } from './modules/admin/admin-audit-service.js';
import { AdminOperationsService } from './modules/admin/admin-operations-service.js';
import { AdminDecisionDataService } from './modules/admin/admin-decision-data-service.js';
import { AdminReferenceService } from './modules/admin/admin-reference-service.js';
import { registerAdminRoutes } from './modules/admin/admin-routes.js';

export interface BuildAppOptions {
    config: ServerConfig;
    database?: DatabaseConnection;
    logger?: FastifyServerOptions['logger'];
    clock?: Clock;
    catalog?: CatalogGateway;
    metrics?: Metrics;
    analytics?: ProductAnalytics;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

interface SerializedRequest {
    method?: string;
    url?: string;
    hostname?: string;
    ip?: string;
    socket?: { remotePort?: number };
}

export function createDefaultLoggerOptions(config: ServerConfig) {
    return {
        level: config.logLevel,
        base: {
            service: 'amigos-decision-api',
            environment: config.nodeEnv,
        },
        serializers: {
            req(request: SerializedRequest) {
                return {
                    method: request.method,
                    url: redactInviteQuery(request.url),
                    hostname: request.hostname,
                    remoteAddress: request.ip,
                    remotePort: request.socket?.remotePort,
                };
            },
        },
        redact: {
            paths: [
                'req.headers.cookie',
                'req.headers.authorization',
                "req.headers['x-csrf-token']",
                "req.headers['x-admin-csrf-token']",
                "res.headers['set-cookie']",
                '*.inviteToken',
                '*.guestToken',
                '*.csrfToken',
                'inviteToken',
                'guestToken',
                'csrfToken',
                'req.body.inviteToken',
                'req.body.guestToken',
                'req.body.csrfToken',
                'req.body.password',
                'req.body.currentPassword',
                'req.body.newPassword',
            ],
            censor: '[REDACTED]',
        },
    };
}

function redactInviteQuery(rawUrl: string | undefined): string | undefined {
    if (!rawUrl) return rawUrl;
    const sanitized = rawUrl.replace(/[\r\n]/g, '');
    const queryStart = sanitized.indexOf('?');
    if (queryStart < 0) return sanitized;
    const pathname = sanitized.slice(0, queryStart);
    const params = new URLSearchParams(sanitized.slice(queryStart + 1));
    if (params.has('invite')) {
        params.set('invite', '[REDACTED]');
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
    const ownsDatabase = !options.database;
    const database = options.database ?? createDatabaseConnection(options.config);
    const clock = options.clock ?? systemClock;
    const catalog = options.catalog ?? await StaticJsonCatalogGateway.create();
    const app = Fastify({
        bodyLimit: options.config.bodyLimitBytes,
        logger: options.logger ?? createDefaultLoggerOptions(options.config),
        genReqId(request) {
            const supplied = request.headers['x-request-id'];
            if (typeof supplied === 'string' && requestIdPattern.test(supplied)) {
                return supplied;
            }
            return randomUUID();
        },
    });
    const metrics = options.metrics ?? new StructuredLogMetrics((event) => {
        app.log.info({ metric: event }, 'application_metric');
    });
    const analytics = options.analytics ?? new StructuredLogProductAnalytics((event) => {
        app.log.info({ productEvent: event }, 'product_event');
    });
    const requestStartedAt = new WeakMap<object, bigint>();

    app.addHook('onRequest', async (request) => {
        requestStartedAt.set(request, process.hrtime.bigint());
    });
    app.addHook('onResponse', async (request, reply) => {
        const startedAt = requestStartedAt.get(request);
        const route = request.routeOptions.url ?? 'unmatched';
        const labels = {
            method: request.method,
            route,
            status: reply.statusCode,
        };
        metrics.record({ name: 'http_requests_total', value: 1, labels });
        if (startedAt !== undefined) {
            metrics.record({
                name: 'http_request_duration_ms',
                value: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
                labels,
            });
        }
        if (reply.statusCode >= 400) {
            metrics.record({ name: 'http_errors_total', value: 1, labels });
        }
    });

    await registerSecurityPlugins(app, options.config);
    const guestSessions = new GuestSessionService(database.pool, options.config, clock);
    const rooms = new PostgresRoomRepository(database.pool, options.config, clock, catalog, metrics);
    const lobby = new PostgresLobbyRepository(database.pool, clock, catalog, metrics);
    const decisionData = new PostgresDecisionDataRepository(database.pool);
    const startRoom = new StartRoomService(database.pool, clock, catalog, decisionData, rooms, metrics, analytics);
    const voting = new VotingService(database.pool, clock, catalog, metrics, analytics);
    const finalists = new FinalistService(database.pool, clock, rooms, voting, catalog, metrics, analytics);
    const gameplay = new YouTubeGameplayProvider(
        options.config.youtubeApiKey,
        options.config.youtubeCacheTtlHours,
        options.config.youtubeNegativeCacheTtlHours,
        fetch,
        metrics
    );
    const references = new ReferenceDataRepository(database.pool, clock);
    const eventBus = new PostgresRoomEventBus(database.pool, metrics);
    const realtimeHub = new RoomRealtimeHub(eventBus, metrics);
    const adminAudit = new AdminAuditService(database.pool, clock);
    const adminSessions = new AdminSessionService(database.pool, options.config, clock, adminAudit);
    const adminOperations = new AdminOperationsService(database.pool, clock, catalog, adminAudit);
    const adminDecisionData = new AdminDecisionDataService(database.pool, clock, catalog, adminAudit);
    const adminReferences = new AdminReferenceService(database.pool, adminAudit);
    await registerSessionRoutes(app, guestSessions);
    await registerReferenceRoutes(app, references);
    await registerCatalogRoutes(app, catalog);
    await registerRealtimeRoutes(app, { guestSessions, rooms, hub: realtimeHub });
    await registerRoomRoutes(app, {
        config: options.config,
        guestSessions,
        rooms,
        lobby,
        startRoom,
        metrics,
        analytics,
    });
    await registerVotingRoutes(app, { guestSessions, voting });
    await registerFinalistRoutes(app, { guestSessions, finalists });
    await registerMediaRoutes(app, { catalog, gameplay, metrics, analytics });
    await registerAdminRoutes(app, {
        sessions: adminSessions,
        operations: adminOperations,
        decisionData: adminDecisionData,
        references: adminReferences,
    });

    app.addHook('onSend', async (request, reply, payload) => {
        void reply.header('x-request-id', request.id);
        if (request.url.startsWith('/api/v1/admin/')) {
            void reply.header('cache-control', 'no-store, max-age=0');
            void reply.header('pragma', 'no-cache');
        }
        return payload;
    });

    app.get('/api/v1/health', async () => ({
        status: 'ok',
        service: 'amigos-decision-api',
    }));

    app.get('/api/v1/ready', async (_request, reply) => {
        try {
            await database.ping();
            return { status: 'ready' };
        } catch (error) {
            metrics.record({
                name: 'database_query_errors_total',
                value: 1,
                labels: { operation: 'readiness' },
            });
            app.log.error({ err: error }, 'Database readiness check failed');
            return reply.code(503).send({
                type: 'https://amigos-database.dev/problems/service-unavailable',
                title: 'Serviço indisponível',
                status: 503,
                code: 'SERVICE_UNAVAILABLE',
                detail: 'O banco de dados não está disponível.',
                requestId: _request.id,
            });
        }
    });

    app.setNotFoundHandler(async (request, reply) => reply.code(404).send({
        type: 'https://amigos-database.dev/problems/route-not-found',
        title: 'Rota não encontrada',
        status: 404,
        code: 'ROUTE_NOT_FOUND',
        requestId: request.id,
    }));

    app.setErrorHandler(async (error, request, reply) => {
        if (error instanceof AppError) {
            return reply.code(error.status).send(toProblemDetails(error, request.id));
        }

        if (error instanceof ZodError) {
            const problem = {
                type: 'https://amigos-database.dev/problems/validation-error',
                title: 'Dados inválidos',
                status: 400,
                code: 'VALIDATION_ERROR',
                requestId: request.id,
                fieldErrors: error.issues.map((issue) => ({
                    field: issue.path.join('.'),
                    code: issue.code,
                    message: issue.message,
                })),
            };
            return reply.code(400).send(apiProblemSchema.parse(problem));
        }

        if (typeof error === 'object' && error !== null) {
            const structuredProblem = apiProblemSchema.safeParse({
                ...error,
                requestId: request.id,
            });
            if (structuredProblem.success) {
                return reply.code(structuredProblem.data.status).send(structuredProblem.data);
            }
        }

        const statusCode = typeof error === 'object' && error !== null
            && 'statusCode' in error && typeof error.statusCode === 'number'
            ? error.statusCode
            : 500;
        const errorMessage = error instanceof Error ? error.message : 'Unknown request error';
        if (statusCode >= 500) {
            if (isDatabaseError(error)) {
                metrics.record({
                    name: 'database_query_errors_total',
                    value: 1,
                    labels: { operation: 'request' },
                });
            }
            request.log.error({ err: error }, 'Unhandled request error');
        }

        return reply.code(statusCode).send({
            type: 'https://amigos-database.dev/problems/request-error',
            title: statusCode >= 500 ? 'Erro interno' : 'Solicitação inválida',
            status: statusCode,
            code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
            ...(options.config.isProduction ? {} : { detail: errorMessage }),
            requestId: request.id,
        });
    });

    app.addHook('onClose', async () => {
        await realtimeHub.close();
        if (ownsDatabase) {
            await database.close();
        }
    });

    return app;
}

function isDatabaseError(error: unknown): boolean {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && typeof error.code === 'string'
        && /^[0-9A-Z]{5}$/.test(error.code);
}
