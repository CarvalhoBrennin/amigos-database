import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';

const databaseUrlSchema = z.string().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must use the PostgreSQL protocol'
);
const databaseUrl = databaseUrlSchema.parse(
    process.env.DATABASE_URL ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos'
);
const seedPath = resolve(process.cwd(), 'db/migrations/0002_reference_data_seed.sql');
const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

try {
    const sql = await readFile(seedPath, 'utf8');
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    process.stdout.write('Reference data seeded successfully.\n');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
    await pool.end();
}
