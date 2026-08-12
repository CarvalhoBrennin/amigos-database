import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
    createRoomRequestSchema,
    createRoomResponseSchema,
    expectedRoomVersionRequestSchema,
    joinRoomRequestSchema,
    joinRoomResponseSchema,
    roomGameHistoryEntrySchema,
    roomPublicSnapshotSchema,
    startRoomResponseSchema,
    setReadyRequestSchema,
    updateParticipantProfileRequestSchema,
    updateRoomConstraintsRequestSchema,
    updateRoomHistoryRequestSchema,
} from '../../../../shared/index.js';
import type { ServerConfig } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import { trackProductEvent, type ProductAnalytics } from '../analytics/product-analytics.js';
import type { GuestSessionService } from '../auth/guest-session-service.js';
import type { PostgresRoomRepository } from './postgres-room-repository.js';
import type { PostgresLobbyRepository } from './postgres-lobby-repository.js';
import type { StartRoomService } from './start-room-service.js';

const roomParamsSchema = z.object({
    code: z.string().trim().min(4).max(12).regex(/^[A-Za-z0-9]+$/),
});
const idempotencyKeySchema = z.string().min(8).max(128).regex(/^[\x21-\x7E]+$/);
const historyParamsSchema = roomParamsSchema.extend({
    gameId: z.string().trim().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/),
});

export async function registerRoomRoutes(
    app: FastifyInstance,
    dependencies: {
        config: ServerConfig;
        guestSessions: GuestSessionService;
        rooms: PostgresRoomRepository;
        lobby: PostgresLobbyRepository;
        startRoom: StartRoomService;
        metrics?: Metrics;
        analytics?: ProductAnalytics;
    }
): Promise<void> {
    const metrics = dependencies.metrics ?? noopMetrics;
    const analytics = dependencies.analytics ?? new NoopProductAnalytics();
    const analyticsError = () => metrics.record({ name: 'product_analytics_errors_total', value: 1 });
    app.post('/api/v1/rooms', {
        config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    }, async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const body = createRoomRequestSchema.parse(request.body);
        const rawIdempotencyKey = request.headers['idempotency-key'];
        const idempotencyKey = rawIdempotencyKey === undefined
            ? undefined
            : idempotencyKeySchema.parse(rawIdempotencyKey);
        const result = await dependencies.rooms.createRoom({
            guestSessionId: session.id,
            hostNickname: body.hostNickname,
            regionCode: body.regionCode,
            idempotencyKey,
        });
        const shareUrl = new URL(`/r/${result.room.code}`, dependencies.config.publicWebUrl);
        shareUrl.searchParams.set('invite', result.inviteToken);
        if (result.created) {
            trackProductEvent(analytics, { event: 'room_created', roomId: result.room.id }, analyticsError);
        }

        void reply.header('cache-control', 'no-store').code(201);
        return createRoomResponseSchema.parse({
            room: result.room,
            invite: { shareUrl: shareUrl.toString() },
        });
    });

    app.post('/api/v1/rooms/:code/join', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = joinRoomRequestSchema.parse(request.body);
        const result = await dependencies.rooms.joinRoom({
            code: params.code,
            guestSessionId: session.id,
            nickname: body.nickname,
            inviteToken: body.inviteToken,
        });
        if (result.joined) {
            trackProductEvent(analytics, { event: 'participant_joined', roomId: result.room.id }, analyticsError);
        }

        void reply.header('cache-control', 'no-store');
        return joinRoomResponseSchema.parse({ room: result.room });
    });

    app.get('/api/v1/rooms/:code', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticate(request);
        const params = roomParamsSchema.parse(request.params);
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.patch('/api/v1/rooms/:code/participants/me/profile', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = updateParticipantProfileRequestSchema.parse(request.body);
        const { expectedRoomVersion, ...profile } = body;
        await dependencies.lobby.updateProfile({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion,
            profile,
        });
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.put('/api/v1/rooms/:code/participants/me/ready', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = setReadyRequestSchema.parse(request.body);
        const readyResult = await dependencies.lobby.setReady({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
            ready: body.ready,
        });
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        if (body.ready && readyResult.changed) {
            trackProductEvent(analytics, { event: 'participant_ready', roomId: room.id }, analyticsError);
        }

        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.patch('/api/v1/rooms/:code/constraints', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = updateRoomConstraintsRequestSchema.parse(request.body);
        await dependencies.lobby.updateConstraints({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
            constraints: body.constraints,
        });
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.get('/api/v1/rooms/:code/history', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticate(request);
        const params = roomParamsSchema.parse(request.params);
        const history = await dependencies.lobby.listHistory(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return z.object({ history: z.array(roomGameHistoryEntrySchema) }).parse({ history });
    });

    app.post('/api/v1/rooms/:code/history', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = updateRoomHistoryRequestSchema.parse(request.body);
        await dependencies.lobby.addHistory({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
            gameId: body.gameId,
            disposition: body.disposition,
        });
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.delete('/api/v1/rooms/:code/history/:gameId', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = historyParamsSchema.parse(request.params);
        const body = expectedRoomVersionRequestSchema.parse(request.body);
        await dependencies.lobby.removeHistory({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
            gameId: params.gameId,
        });
        const room = await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(room);
    });

    app.post('/api/v1/rooms/:code/start', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = expectedRoomVersionRequestSchema.parse(request.body);
        const result = await dependencies.startRoom.start({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
        });
        void reply.header('cache-control', 'no-store');
        return startRoomResponseSchema.parse(result);
    });

    app.get('/api/v1/rooms/:code/invite', async () => {
        throw new AppError({
            status: 404,
            code: 'ROUTE_NOT_FOUND',
            title: 'Rota não encontrada',
        });
    });
}
