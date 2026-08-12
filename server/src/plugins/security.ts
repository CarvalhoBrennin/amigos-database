import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config/env.js';
import { AppError } from '../lib/errors.js';

export async function registerSecurityPlugins(app: FastifyInstance, config: ServerConfig): Promise<void> {
    await app.register(cookie);
    await app.register(cors, {
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['content-type', 'x-csrf-token', 'x-admin-csrf-token', 'x-request-id', 'idempotency-key'],
        origin(origin, callback) {
            if (!origin || config.webOrigins.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new AppError({
                status: 403,
                code: 'ORIGIN_NOT_ALLOWED',
                title: 'Origem não permitida',
            }), false);
        },
    });
    await app.register(helmet, {
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'same-site' },
        hsts: config.isProduction
            ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
            : false,
    });
    await app.register(rateLimit, {
        global: true,
        max: 300,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip,
        errorResponseBuilder: (_request, context) => ({
            type: 'https://amigos-database.dev/problems/rate-limit-exceeded',
            title: 'Muitas solicitações',
            status: 429,
            code: 'RATE_LIMIT_EXCEEDED',
            detail: `Tente novamente em ${Math.ceil(context.ttl / 1000)} segundos.`,
        }),
    });
}
