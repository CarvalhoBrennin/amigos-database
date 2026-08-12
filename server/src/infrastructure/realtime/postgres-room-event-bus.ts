import type { Pool, PoolClient } from 'pg';
import {
    roomEventNotificationSchema,
    type RoomEventNotification,
} from '../../../../shared/index.js';
import { ROOM_EVENT_CHANNEL } from './room-event-notifier.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';

export type Unsubscribe = () => void;
export type RoomEventHandler = (event: RoomEventNotification) => void;

export interface RoomEventBus {
    publish(event: RoomEventNotification): Promise<void>;
    subscribe(handler: RoomEventHandler): Promise<Unsubscribe>;
    close(): Promise<void>;
}

export class PostgresRoomEventBus implements RoomEventBus {
    private readonly handlers = new Set<RoomEventHandler>();
    private listenerClient: PoolClient | null = null;
    private starting: Promise<void> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private closed = false;

    constructor(
        private readonly pool: Pool,
        private readonly metrics: Metrics = noopMetrics
    ) {}

    async publish(event: RoomEventNotification): Promise<void> {
        const validated = roomEventNotificationSchema.parse(event);
        await this.pool.query('SELECT pg_notify($1, $2)', [ROOM_EVENT_CHANNEL, JSON.stringify(validated)]);
    }

    async subscribe(handler: RoomEventHandler): Promise<Unsubscribe> {
        this.handlers.add(handler);
        await this.ensureStarted();
        return () => {
            this.handlers.delete(handler);
        };
    }

    async close(): Promise<void> {
        this.closed = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const client = this.listenerClient;
        this.listenerClient = null;
        this.handlers.clear();
        if (client) {
            await client.query(`UNLISTEN ${ROOM_EVENT_CHANNEL}`);
            client.release();
        }
    }

    private async ensureStarted(): Promise<void> {
        if (this.listenerClient) {
            return;
        }
        if (!this.starting) {
            this.starting = this.start().finally(() => {
                this.starting = null;
            });
        }
        await this.starting;
    }

    private async start(): Promise<void> {
        const client = await this.pool.connect();
        client.on('notification', (message) => {
            if (message.channel !== ROOM_EVENT_CHANNEL || !message.payload) {
                return;
            }
            let rawPayload: unknown;
            try {
                rawPayload = JSON.parse(message.payload);
            } catch {
                this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'invalid_json' } });
                return;
            }
            const parsed = roomEventNotificationSchema.safeParse(rawPayload);
            if (!parsed.success) {
                this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'invalid_payload' } });
                return;
            }
            for (const handler of this.handlers) {
                try {
                    handler(parsed.data);
                } catch {
                    this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'handler_error' } });
                }
            }
        });
        try {
            await client.query(`LISTEN ${ROOM_EVENT_CHANNEL}`);
            if (this.closed) {
                client.release();
                return;
            }
            client.on('error', () => {
                this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'listener_error' } });
                this.metrics.record({ name: 'database_query_errors_total', value: 1, labels: { operation: 'listen' } });
                if (this.listenerClient === client) {
                    this.listenerClient = null;
                    client.release(true);
                    this.scheduleReconnect();
                }
            });
            this.listenerClient = client;
        } catch (error) {
            client.release(true);
            this.metrics.record({ name: 'database_query_errors_total', value: 1, labels: { operation: 'listen' } });
            throw error;
        }
    }

    private scheduleReconnect(): void {
        if (this.closed || this.reconnectTimer || this.handlers.size === 0) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.ensureStarted().catch(() => this.scheduleReconnect());
        }, 1_000);
        this.reconnectTimer.unref();
    }
}
