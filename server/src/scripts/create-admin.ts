import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { adminCreateUserRequestSchema } from '../../../shared/index.js';
import { hashPassword } from '../lib/password.js';

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (!argument?.startsWith('--')) continue;
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const next = process.argv[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : '');
    if (key) args.set(key, value ?? '');
    if (inlineValue === undefined && next && !next.startsWith('--')) index += 1;
}

if (args.has('password')) {
    throw new Error('Do not pass passwords as command-line arguments. Use the temporary ADMIN_CREATE_PASSWORD environment variable.');
}

const input = adminCreateUserRequestSchema.parse({
    email: args.get('email'),
    displayName: args.get('name'),
    password: process.env.ADMIN_CREATE_PASSWORD,
    role: args.get('role') ?? 'SUPER_ADMIN',
});
const databaseUrl = z.string().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must use the PostgreSQL protocol'
).parse(process.env.DATABASE_URL ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos');

const pool = new Pool({ connectionString: databaseUrl });
try {
    const now = new Date();
    const userId = randomUUID();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query<{ id: string }>(
            `INSERT INTO admin_users (
                id, email, display_name, password_hash, role, active,
                failed_login_attempts, locked_until, password_changed_at,
                last_login_at, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,TRUE,0,NULL,$6,NULL,$6,$6)
            ON CONFLICT (email) DO NOTHING
            RETURNING id`,
            [userId, input.email, input.displayName, await hashPassword(input.password), input.role, now]
        );
        if (result.rowCount === 0) {
            throw new Error('An administrator with this email already exists.');
        }
        await client.query(
            `INSERT INTO admin_audit_log (
                id, admin_user_id, action, entity_type, entity_id,
                request_id, metadata, created_at
            ) VALUES ($1,$2,'ADMIN_USER_BOOTSTRAPPED','ADMIN_USER',$2,$3,$4,$5)`,
            [randomUUID(), userId, `cli:create-admin:${randomUUID()}`, JSON.stringify({ role: input.role }), now]
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
    process.stdout.write(`Administrator created: ${input.email} (${input.role}).\n`);
} finally {
    await pool.end();
}
