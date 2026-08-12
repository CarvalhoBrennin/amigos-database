import { z } from 'zod';
import { migrateDatabase } from '../infrastructure/db/migrate-database.js';

const databaseUrlSchema = z.string().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must use the PostgreSQL protocol'
);

const databaseUrl = databaseUrlSchema.parse(
    process.env.DATABASE_URL ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos'
);
await migrateDatabase(databaseUrl);
process.stdout.write('Database migrations applied successfully.\n');
