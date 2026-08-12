import type { ServerConfig } from '../src/config/env.js';
import type { DatabaseConnection } from '../src/infrastructure/db/client.js';

export function createTestConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    return {
        nodeEnv: 'test',
        host: '127.0.0.1',
        port: 3001,
        webOrigins: ['http://localhost:5173'],
        publicWebUrl: 'http://localhost:5173',
        apiPublicUrl: 'http://localhost:3001',
        databaseUrl: 'postgresql://postgres:postgres@localhost:5432/amigos_test',
        sessionSecret: 'test-session-secret-with-at-least-32-characters',
        tokenPepper: 'test-token-pepper-with-at-least-32-characters',
        youtubeApiKey: null,
        roomTtlHours: 168,
        guestSessionTtlHours: 168,
        adminSessionTtlHours: 12,
        maxRoomParticipants: 12,
        bodyLimitBytes: 65_536,
        youtubeCacheTtlHours: 720,
        youtubeNegativeCacheTtlHours: 72,
        logLevel: 'silent',
        isProduction: false,
        ...overrides,
    };
}

export function createTestDatabase(options: {
    ping?: () => Promise<void>;
} = {}): DatabaseConnection {
    return {
        pool: {} as DatabaseConnection['pool'],
        db: {} as DatabaseConnection['db'],
        ping: options.ping ?? (async () => undefined),
        close: async () => undefined,
    };
}
