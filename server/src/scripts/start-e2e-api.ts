import { buildApp } from '../app.js';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { ServerConfig } from '../config/env.js';
import { migrateDatabase } from '../infrastructure/db/migrate-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';
const webOrigin = process.env.PLAYWRIGHT_WEB_ORIGIN ?? 'http://127.0.0.1:4173';
const config: ServerConfig = {
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 3001,
    webOrigins: [webOrigin],
    publicWebUrl: webOrigin,
    apiPublicUrl: 'http://127.0.0.1:3001',
    databaseUrl,
    sessionSecret: 'e2e-session-secret-with-at-least-32-characters',
    tokenPepper: 'e2e-token-pepper-with-at-least-32-characters',
    youtubeApiKey: null,
    roomTtlHours: 168,
    guestSessionTtlHours: 168,
    adminSessionTtlHours: 12,
    maxRoomParticipants: 12,
    bodyLimitBytes: 65_536,
    youtubeCacheTtlHours: 720,
    youtubeNegativeCacheTtlHours: 72,
    logLevel: 'warn',
    isProduction: false,
};

await migrateDatabase(databaseUrl);
const seedPool = new Pool({ connectionString: databaseUrl });
try {
    const fixtureSql = await readFile('tests/e2e/fixtures/decision-data.sql', 'utf8');
    await seedPool.query(fixtureSql);
} finally {
    await seedPool.end();
}
const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });
