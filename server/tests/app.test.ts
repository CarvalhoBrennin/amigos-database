import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { buildApp, createDefaultLoggerOptions } from '../src/app.js';
import type { MetricEvent } from '../src/lib/metrics.js';
import { createTestConfig, createTestDatabase } from './test-config.js';

let app: FastifyInstance | null = null;

afterEach(async () => {
    await app?.close();
    app = null;
});

describe('API bootstrap', () => {
    it('returns liveness without requiring the database', async () => {
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase({ ping: async () => Promise.reject(new Error('offline')) }),
            logger: false,
        });

        const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok', service: 'amigos-decision-api' });
        expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('emits bounded HTTP metrics using the route template', async () => {
        const metrics: MetricEvent[] = [];
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase(),
            logger: false,
            metrics: { record: (event) => metrics.push(event) },
        });

        await app.inject({ method: 'GET', url: '/api/v1/health' });

        expect(metrics).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'http_requests_total',
                labels: { method: 'GET', route: '/api/v1/health', status: 200 },
            }),
            expect.objectContaining({
                name: 'http_request_duration_ms',
                labels: { method: 'GET', route: '/api/v1/health', status: 200 },
            }),
        ]));
    });

    it('checks the database on readiness', async () => {
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase(),
            logger: false,
        });

        const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ready' });
    });

    it('returns 503 when the database is unavailable', async () => {
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase({ ping: async () => Promise.reject(new Error('offline')) }),
            logger: false,
        });

        const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    });

    it('accepts only bounded request IDs', async () => {
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase(),
            logger: false,
        });

        const accepted = await app.inject({
            method: 'GET',
            url: '/api/v1/health',
            headers: { 'x-request-id': 'request-123' },
        });
        const rejected = await app.inject({
            method: 'GET',
            url: '/api/v1/health',
            headers: { 'x-request-id': 'x'.repeat(200) },
        });

        expect(accepted.headers['x-request-id']).toBe('request-123');
        expect(rejected.headers['x-request-id']).not.toBe('x'.repeat(200));
    });

    it('does not expose a stack in production errors', async () => {
        app = await buildApp({
            config: createTestConfig({ nodeEnv: 'production', isProduction: true }),
            database: createTestDatabase(),
            logger: false,
        });

        app.get('/test-error', async () => {
            throw new Error('sensitive failure');
        });
        await app.ready();

        const response = await app.inject({ method: 'GET', url: '/test-error' });
        const body = response.json<Record<string, unknown>>();

        expect(response.statusCode).toBe(500);
        expect(body).not.toHaveProperty('stack');
        expect(body).not.toHaveProperty('detail');
        expect(JSON.stringify(body)).not.toContain('sensitive failure');
    });

    it('rejects oversized JSON before authentication', async () => {
        app = await buildApp({
            config: createTestConfig({ bodyLimitBytes: 1_024 }),
            database: createTestDatabase(),
            logger: false,
        });

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: { origin: 'http://localhost:5173' },
            payload: { hostNickname: 'x'.repeat(2_000) },
        });

        expect(response.statusCode).toBe(413);
        expect(response.json()).toMatchObject({ status: 413, code: 'REQUEST_ERROR' });
    });

    it('rate limits room creation and join before expensive work', async () => {
        app = await buildApp({
            config: createTestConfig(),
            database: createTestDatabase(),
            logger: false,
        });
        await app.ready();

        const createStatuses: number[] = [];
        for (let index = 0; index < 11; index += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/rooms',
                headers: { origin: 'http://localhost:5173' },
                payload: { hostNickname: 'Sem sessao' },
            });
            createStatuses.push(response.statusCode);
        }
        const joinStatuses: number[] = [];
        for (let index = 0; index < 31; index += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/rooms/ABCD1234/join',
                headers: { origin: 'http://localhost:5173' },
                payload: { nickname: 'Sem sessao' },
            });
            joinStatuses.push(response.statusCode);
        }

        expect(createStatuses.slice(0, 10)).toEqual(Array(10).fill(401));
        expect(createStatuses.at(-1)).toBe(429);
        expect(joinStatuses.slice(0, 30)).toEqual(Array(30).fill(401));
        expect(joinStatuses.at(-1)).toBe(429);
    });

    it('redacts credentials and invite query values from structured logs', () => {
        const lines: string[] = [];
        const logger = pino(createDefaultLoggerOptions(createTestConfig({ logLevel: 'info' })), {
            write: (line: string) => lines.push(line),
        });

        logger.info({
            inviteToken: 'invite-secret',
            payload: {
                guestToken: 'guest-secret',
                csrfToken: 'csrf-secret',
            },
            req: {
                method: 'GET',
                url: '/r/ABCD1234?invite=query-secret%0D%0Aforged',
                hostname: 'localhost',
                ip: '127.0.0.1',
                socket: { remotePort: 1234 },
                headers: {
                    cookie: 'guest_session=cookie-secret',
                    authorization: 'Bearer auth-secret',
                    'x-csrf-token': 'header-csrf-secret',
                },
            },
        }, 'security_log_test');

        const output = lines.join('');
        expect(output).toContain('[REDACTED]');
        for (const secret of [
            'invite-secret',
            'guest-secret',
            'csrf-secret',
            'query-secret',
            'cookie-secret',
            'auth-secret',
            'header-csrf-secret',
            'forged',
        ]) {
            expect(output).not.toContain(secret);
        }
    });
});
