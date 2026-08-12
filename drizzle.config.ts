import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    dialect: 'postgresql',
    schema: './server/src/infrastructure/db/schema.ts',
    out: './db/migrations',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos',
    },
    strict: true,
    verbose: true,
});
