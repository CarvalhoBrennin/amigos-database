import type { FastifyInstance } from 'fastify';
import { guestSessionResponseSchema } from '../../../../shared/contracts/session.js';
import type { GuestSessionService } from './guest-session-service.js';

export async function registerSessionRoutes(
    app: FastifyInstance,
    guestSessions: GuestSessionService
): Promise<void> {
    app.post('/api/v1/session/guest', {
        config: {
            rateLimit: { max: 20, timeWindow: '1 minute' },
        },
    }, async (request, reply) => {
        const result = await guestSessions.createOrReuse(request, reply);
        void reply.header('cache-control', 'no-store');
        return guestSessionResponseSchema.parse({
            csrfToken: result.csrfToken,
            expiresAt: result.session.expiresAt.toISOString(),
        });
    });
}
