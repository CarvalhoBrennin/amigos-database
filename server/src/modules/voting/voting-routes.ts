import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
    matchesResponseSchema,
    nextCardResponseSchema,
    submitVoteRequestSchema,
    submitVoteResponseSchema,
} from '../../../../shared/index.js';
import type { GuestSessionService } from '../auth/guest-session-service.js';
import type { VotingService } from './voting-service.js';

const roomParamsSchema = z.object({
    code: z.string().trim().min(4).max(12).regex(/^[A-Za-z0-9]+$/),
});
const voteParamsSchema = roomParamsSchema.extend({
    gameId: z.string().trim().min(1).max(64),
});

export async function registerVotingRoutes(
    app: FastifyInstance,
    dependencies: { guestSessions: GuestSessionService; voting: VotingService }
): Promise<void> {
    app.get('/api/v1/rooms/:code/cards/next', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticate(request);
        const params = roomParamsSchema.parse(request.params);
        void reply.header('cache-control', 'no-store');
        return nextCardResponseSchema.parse(await dependencies.voting.getNextCard(params.code, session.id));
    });

    app.put('/api/v1/rooms/:code/votes/:gameId', {
        config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const session = await dependencies.guestSessions.authenticateMutation(request);
        const params = voteParamsSchema.parse(request.params);
        const body = submitVoteRequestSchema.parse(request.body);
        void reply.header('cache-control', 'no-store');
        return submitVoteResponseSchema.parse(await dependencies.voting.submitVote({
            code: params.code,
            guestSessionId: session.id,
            gameId: params.gameId,
            value: body.value,
        }));
    });

    app.get('/api/v1/rooms/:code/matches', async (request, reply) => {
        const session = await dependencies.guestSessions.authenticate(request);
        const params = roomParamsSchema.parse(request.params);
        void reply.header('cache-control', 'no-store');
        return matchesResponseSchema.parse(await dependencies.voting.listMatches(params.code, session.id));
    });
}
