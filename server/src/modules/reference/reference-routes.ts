import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
    platformsResponseSchema,
    regionCodeSchema,
    subscriptionPlansResponseSchema,
} from '../../../../shared/index.js';
import type { ReferenceDataRepository } from './reference-data-repository.js';

const subscriptionPlanQuerySchema = z.object({
    region: regionCodeSchema.default('BR'),
});

export async function registerReferenceRoutes(
    app: FastifyInstance,
    references: ReferenceDataRepository
): Promise<void> {
    app.get('/api/v1/reference/platforms', async (_request, reply) => {
        void reply.header('cache-control', 'public, max-age=300, stale-while-revalidate=3600');
        return platformsResponseSchema.parse({ platforms: await references.listPlatforms() });
    });

    app.get('/api/v1/reference/subscription-plans', async (request, reply) => {
        const query = subscriptionPlanQuerySchema.parse(request.query);
        void reply.header('cache-control', 'public, max-age=300, stale-while-revalidate=3600');
        return subscriptionPlansResponseSchema.parse({
            regionCode: query.region,
            plans: await references.listSubscriptionPlans(query.region),
        });
    });
}
