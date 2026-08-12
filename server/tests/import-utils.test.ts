import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { externalSourceUrlSchema } from '../../shared/index.js';
import { parseImportOptions, runInTransaction } from '../src/scripts/import-utils.js';

describe('decision data import safety', () => {
    it('uses dry-run by default and rejects a force bypass', () => {
        expect(parseImportOptions(['--file', './input.json'])).toMatchObject({ apply: false });
        expect(parseImportOptions(['--file', './input.json', '--apply'])).toMatchObject({ apply: true });
        expect(() => parseImportOptions(['--file', './input.json', '--force'])).toThrow(
            'intentionally unsupported'
        );
    });

    it('accepts only HTTPS provenance URLs', () => {
        expect(externalSourceUrlSchema.safeParse('https://source.example.invalid/data').success).toBe(true);
        expect(externalSourceUrlSchema.safeParse('http://source.example.invalid/data').success).toBe(false);
        expect(externalSourceUrlSchema.safeParse('file:///etc/passwd').success).toBe(false);
    });

    it('commits a successful import transaction', async () => {
        const { pool, query, release } = createPoolDouble();

        const result = await runInTransaction(pool, async (client) => {
            await client.query('INSERT TEST ROW');
            return 7;
        });

        expect(result).toBe(7);
        expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'INSERT TEST ROW', 'COMMIT']);
        expect(release).toHaveBeenCalledOnce();
    });

    it('rolls back the complete import after any record fails', async () => {
        const { pool, query, release } = createPoolDouble();

        await expect(runInTransaction(pool, async (client) => {
            await client.query('INSERT FIRST ROW');
            throw new Error('invalid second record');
        })).rejects.toThrow('invalid second record');

        expect(query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'INSERT FIRST ROW', 'ROLLBACK']);
        expect(release).toHaveBeenCalledOnce();
    });
});

function createPoolDouble(): {
    pool: Pool;
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
} {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
    return { pool, query, release };
}
