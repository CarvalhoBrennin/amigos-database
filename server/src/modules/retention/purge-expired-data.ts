import type { Pool, PoolClient } from 'pg';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import { trackProductEvent, type ProductAnalytics } from '../analytics/product-analytics.js';

export interface PurgeExpiredDataResult {
    rooms: number;
    guestSessions: number;
    adminSessions: number;
    idempotencyKeys: number;
}

export async function purgeExpiredData(
    pool: Pool,
    now = new Date(),
    metrics: Metrics = noopMetrics,
    analytics: ProductAnalytics = new NoopProductAnalytics(),
    beforeCommit?: (client: PoolClient, result: PurgeExpiredDataResult) => Promise<void>
): Promise<PurgeExpiredDataResult> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const idempotencyResult = await client.query<{ id: string }>(
            'DELETE FROM idempotency_keys WHERE expires_at <= $1 RETURNING id',
            [now]
        );
        const roomsResult = await client.query<{ id: string; code: string; version: string }>(
            'DELETE FROM rooms WHERE expires_at <= $1 RETURNING id, code, version',
            [now]
        );
        const guestSessionsResult = await client.query<{ id: string }>(
            `DELETE FROM guest_sessions AS guest
              WHERE guest.expires_at <= $1
                AND NOT EXISTS (
                    SELECT 1
                      FROM rooms AS room
                      LEFT JOIN room_participants AS participant ON participant.room_id = room.id
                     WHERE room.expires_at > $1
                       AND (
                           room.host_guest_session_id = guest.id
                           OR participant.guest_session_id = guest.id
                       )
                )
              RETURNING id`,
            [now]
        );
        const adminSessionsResult = await client.query<{ id: string }>(
            'DELETE FROM admin_sessions WHERE expires_at <= $1 RETURNING id',
            [now]
        );
        for (const room of roomsResult.rows) {
            await notifyRoomEvent(client, {
                roomId: room.id,
                roomCode: room.code,
                version: Number(room.version) + 1,
                eventType: 'ROOM_EXPIRED',
            });
        }
        const result = {
            rooms: roomsResult.rowCount ?? 0,
            guestSessions: guestSessionsResult.rowCount ?? 0,
            adminSessions: adminSessionsResult.rowCount ?? 0,
            idempotencyKeys: idempotencyResult.rowCount ?? 0,
        };
        await beforeCommit?.(client, result);
        await client.query('COMMIT');
        for (const [entity, count] of Object.entries(result)) {
            metrics.record({
                name: 'retention_rows_deleted_total',
                value: count,
                labels: { entity },
            });
        }
        for (const room of roomsResult.rows) {
            metrics.record({
                name: 'room_events_published_total',
                value: 1,
                labels: { eventType: 'ROOM_EXPIRED' },
            });
            trackProductEvent(
                analytics,
                { event: 'room_expired', roomId: room.id },
                () => metrics.record({ name: 'product_analytics_errors_total', value: 1 })
            );
        }
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        metrics.record({
            name: 'database_query_errors_total',
            value: 1,
            labels: { operation: 'purge_expired_data' },
        });
        throw error;
    } finally {
        client.release();
    }
}
