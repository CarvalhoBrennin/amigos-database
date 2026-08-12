import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { catalogSearchResponseSchema } from '../../../../shared/index.js';
import type { CatalogGateway } from './catalog-gateway.js';

const searchQuerySchema = z.object({
    q: z.string().trim().min(2).max(80),
    limit: z.coerce.number().int().min(1).max(20).default(10),
    language: z.enum(['pt', 'en', 'es', 'fr', 'de', 'ja']).default('pt'),
});

export async function registerCatalogRoutes(app: FastifyInstance, catalog: CatalogGateway): Promise<void> {
    app.get('/api/v1/catalog/search', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const query = searchQuerySchema.parse(request.query);
        const games = await catalog.searchGames(query.q, query.language, query.limit);
        void reply.header('cache-control', 'private, max-age=30');
        return catalogSearchResponseSchema.parse({ games });
    });
}
