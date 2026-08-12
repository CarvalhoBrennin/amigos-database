import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

export interface ImportOptions {
    filePath: string;
    apply: boolean;
}

export interface ImportReport {
    mode: 'dry-run' | 'apply';
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
}

export function parseImportOptions(argv: string[]): ImportOptions {
    const fileIndex = argv.indexOf('--file');
    const filePath = fileIndex >= 0 ? argv[fileIndex + 1] : undefined;
    if (!filePath) {
        throw new Error('Use --file <path> to select an import file.');
    }
    const unsupportedForce = argv.includes('--force');
    if (unsupportedForce) {
        throw new Error('--force is intentionally unsupported; structural inconsistencies cannot be ignored.');
    }
    return {
        filePath: path.resolve(filePath),
        apply: argv.includes('--apply'),
    };
}

export async function readJsonFile(filePath: string): Promise<unknown> {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
}

export async function runInTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export function assertNotUnreasonablyFuture(value: string | null, now: Date, field: string): void {
    if (value && new Date(value).getTime() > now.getTime() + 5 * 60 * 1000) {
        throw new Error(`${field} cannot be more than five minutes in the future.`);
    }
}

export function formatImportError(error: unknown): string {
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
    }
    return error instanceof Error ? error.message : 'Unknown import error';
}

export function printReport(report: ImportReport): void {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
