import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import { z } from 'zod';
import type { GuestSessionService } from '../auth/guest-session-service.js';
import type { PostgresRoomRepository } from '../rooms/postgres-room-repository.js';
import type { RoomRealtimeHub } from './room-realtime-hub.js';

const realtimeParamsSchema = z.object({
    code: z.string().trim().min(4).max(12).regex(/^[A-Za-z0-9]+$/),
});
const realtimeQuerySchema = z.object({ reconnect: z.enum(['0', '1']).default('0') });

export async function registerRealtimeRoutes(
    app: FastifyInstance,
    dependencies: {
        guestSessions: GuestSessionService;
        rooms: PostgresRoomRepository;
        hub: RoomRealtimeHub;
    }
): Promise<void> {
    await app.register(websocket, {
        options: { maxPayload: 1_024, perMessageDeflate: false },
    });

    app.get('/api/v1/realtime/rooms/:code', {
        websocket: true,
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, (socket, request) => {
        void authorizeSocket(socket, request, dependencies);
    });
}

async function authorizeSocket(
    socket: WebSocket,
    request: Parameters<GuestSessionService['authenticate']>[0],
    dependencies: {
        guestSessions: GuestSessionService;
        rooms: PostgresRoomRepository;
        hub: RoomRealtimeHub;
    }
): Promise<void> {
    try {
        dependencies.guestSessions.assertAllowedOrigin(request);
        const session = await dependencies.guestSessions.authenticate(request);
        const params = realtimeParamsSchema.parse(request.params);
        const query = realtimeQuerySchema.parse(request.query);
        await dependencies.rooms.getSnapshotByCode(params.code, session.id);
        await dependencies.hub.add(params.code, socket, query.reconnect === '1');
    } catch {
        socket.close(1008, 'Não autorizado');
    }
}
