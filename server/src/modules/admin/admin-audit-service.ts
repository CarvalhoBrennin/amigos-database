import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Clock } from '../../lib/clock.js';

export interface AdminAuditEvent {
    adminUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    requestId: string;
    metadata?: Record<string, unknown>;
}

export class AdminAuditService {
    constructor(private readonly pool: Pool, private readonly clock: Clock) {}

    async record(event: AdminAuditEvent, client?: PoolClient): Promise<void> {
        const executor = client ?? this.pool;
        await executor.query(
            `INSERT INTO admin_audit_log (
                id, admin_user_id, action, entity_type, entity_id,
                request_id, metadata, created_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
                randomUUID(),
                event.adminUserId,
                event.action,
                event.entityType,
                event.entityId ?? null,
                event.requestId,
                JSON.stringify(sanitizeMetadata(event.metadata ?? {})),
                this.clock.now(),
            ]
        );
    }
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const blocked = /password|token|secret|cookie|authorization|csrf|invite/i;
    return Object.fromEntries(
        Object.entries(metadata)
            .filter(([key]) => !blocked.test(key))
            .map(([key, value]) => [key, sanitizeValue(value)])
    );
}

function sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeValue);
    if (value && typeof value === 'object') return sanitizeMetadata(value as Record<string, unknown>);
    if (typeof value === 'string') return value.slice(0, 500);
    return value;
}
