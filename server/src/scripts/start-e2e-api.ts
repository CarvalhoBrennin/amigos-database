import { buildApp } from '../app.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import type { ServerConfig } from '../config/env.js';
import { migrateDatabase } from '../infrastructure/db/migrate-database.js';
import { hashPassword } from '../lib/password.js';

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
    const now = new Date();
    const e2eAdminId = randomUUID();
    await seedPool.query(
        `INSERT INTO admin_users (
            id, email, display_name, password_hash, role, active,
            failed_login_attempts, locked_until, password_changed_at,
            last_login_at, created_at, updated_at
        ) VALUES ($1, $2, 'E2E Admin', $3, 'SUPER_ADMIN', TRUE,
            0, NULL, $4, NULL, $4, $4)
        ON CONFLICT (email) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            active = TRUE,
            failed_login_attempts = 0,
            locked_until = NULL,
            updated_at = EXCLUDED.updated_at`,
        [e2eAdminId, 'admin-e2e@example.test', await hashPassword('e2e-admin-password-123'), now]
    );
} finally {
    await seedPool.end();
}
const app = await buildApp({ config });
await app.listen({ host: config.host, port: config.port });
