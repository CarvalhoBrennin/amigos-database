import type { PoolClient } from 'pg';
import {
    roomEventNotificationSchema,
    type RoomEventNotification,
} from '../../../../shared/index.js';
import type { Metrics } from '../../lib/metrics.js';

export const ROOM_EVENT_CHANNEL = 'amigos_room_events';

export async function notifyRoomEvent(
    client: PoolClient,
    event: RoomEventNotification,
    metrics?: Metrics
): Promise<void> {
    const validated = roomEventNotificationSchema.parse(event);
    await client.query('SELECT pg_notify($1, $2)', [ROOM_EVENT_CHANNEL, JSON.stringify(validated)]);
    metrics?.record({
        name: 'room_events_published_total',
        value: 1,
        labels: { eventType: validated.eventType },
    });
}
