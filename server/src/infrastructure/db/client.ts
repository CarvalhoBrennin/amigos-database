import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { ServerConfig } from '../../config/env.js';

export interface DatabaseConnection {
    pool: Pool;
    db: NodePgDatabase;
    ping(): Promise<void>;
    close(): Promise<void>;
}

export function createDatabaseConnection(config: ServerConfig): DatabaseConnection {
    const pool = new Pool({
        connectionString: config.databaseUrl,
        max: config.isProduction ? 10 : 5,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        ssl: config.isProduction ? { rejectUnauthorized: true } : undefined,
    });

    return {
        pool,
        db: drizzle(pool),
        async ping() {
            await pool.query('SELECT 1');
        },
        async close() {
            await pool.end();
        },
    };
}
