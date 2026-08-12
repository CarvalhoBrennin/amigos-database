import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
    completeRoomRequestSchema,
    expectedRoomVersionRequestSchema,
    finalistDetailsSchema,
    roomPublicSnapshotSchema,
} from '../../../../shared/index.js';
import type { GuestSessionService } from '../auth/guest-session-service.js';
import type { FinalistService } from './finalist-service.js';

const roomParamsSchema = z.object({
    code: z.string().trim().min(4).max(12).regex(/^[A-Za-z0-9]+$/),
});
const gameParamsSchema = roomParamsSchema.extend({
    gameId: z.string().trim().min(1).max(64),
});

export async function registerFinalistRoutes(
    app: FastifyInstance,
    dependencies: { guestSessions: GuestSessionService; finalists: FinalistService }
): Promise<void> {
    app.post('/api/v1/rooms/:code/shortlist', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = expectedRoomVersionRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(await dependencies.finalists.openShortlist({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
        }));
    });

    app.get('/api/v1/rooms/:code/games/:gameId/details', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticate(request);
        const params = gameParamsSchema.parse(request.params);
        void reply.header('cache-control', 'no-store');
        return finalistDetailsSchema.parse(await dependencies.finalists.getFinalistDetails(
            params.code,
            params.gameId,
            session.id
        ));
    });

    app.post('/api/v1/rooms/:code/decision', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = roomParamsSchema.parse(request.params);
        const body = completeRoomRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return roomPublicSnapshotSchema.parse(await dependencies.finalists.complete({
            code: params.code,
            guestSessionId: session.id,
            expectedRoomVersion: body.expectedRoomVersion,
            gameId: body.gameId,
        }));
    });
}
