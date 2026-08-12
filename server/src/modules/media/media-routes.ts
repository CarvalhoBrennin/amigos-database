import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { gameplayMediaResponseSchema } from '../../../../shared/index.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';
import type { YouTubeGameplayProvider } from './youtube-gameplay-provider.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import { trackProductEvent, type ProductAnalytics } from '../analytics/product-analytics.js';

const paramsSchema = z.object({ gameId: z.string().trim().min(1).max(64) });

export async function registerMediaRoutes(
    app: FastifyInstance,
    dependencies: {
        catalog: CatalogGateway;
        gameplay: YouTubeGameplayProvider;
        metrics?: Metrics;
        analytics?: ProductAnalytics;
    }
): Promise<void> {
    const metrics = dependencies.metrics ?? noopMetrics;
    const analytics = dependencies.analytics ?? new NoopProductAnalytics();
    app.get('/api/v1/games/:gameId/media/gameplay', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const params = paramsSchema.parse(request.params);
        const game = await dependencies.catalog.getGameById(params.gameId, 'pt');
        if (!game) {
            return reply.code(404).send({
                type: 'https://amigos-database.dev/problems/catalog-game-not-found',
                title: 'Jogo não encontrado',
                status: 404,
                code: 'CATALOG_GAME_NOT_FOUND',
                requestId: request.id,
            });
        }
        try {
            void reply.header('cache-control', 'public, max-age=3600, stale-while-revalidate=86400');
            const response = gameplayMediaResponseSchema.parse(await dependencies.gameplay.getGameplay(game.id, game.title));
            trackProductEvent(analytics, {
                event: 'gameplay_opened',
                gameId: game.id,
                available: response.video !== null,
            }, () => metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
            return response;
        } catch (error) {
            request.log.warn({ err: error, gameId: game.id }, 'Gameplay provider unavailable');
            const fallback = gameplayMediaResponseSchema.parse({ video: null, source: 'YOUTUBE', cached: false });
            trackProductEvent(analytics, {
                event: 'gameplay_opened',
                gameId: game.id,
                available: false,
            }, () => metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
            return fallback;
        }
    });
}
