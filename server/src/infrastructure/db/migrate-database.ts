import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export async function migrateDatabase(databaseUrl: string): Promise<void> {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
        await migrate(drizzle(pool), { migrationsFolder: 'db/migrations' });
    } finally {
        await pool.end();
    }
}
