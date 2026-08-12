import type WebSocket from 'ws';
import { WebSocket as WebSocketState } from 'ws';
import {
    roomRealtimeMessageSchema,
    type RoomEventNotification,
} from '../../../../shared/index.js';
import type { RoomEventBus, Unsubscribe } from '../../infrastructure/realtime/postgres-room-event-bus.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';

interface ManagedSocket {
    socket: WebSocket;
    isAlive: boolean;
}

const MAX_BUFFERED_BYTES = 64 * 1_024;

export class RoomRealtimeHub {
    private readonly socketsByRoom = new Map<string, Set<ManagedSocket>>();
    private unsubscribe: Unsubscribe | null = null;
    private heartbeat: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly eventBus: RoomEventBus,
        private readonly metrics: Metrics = noopMetrics
    ) {}

    async add(roomCode: string, socket: WebSocket, reconnect = false): Promise<void> {
        await this.ensureStarted();
        const managed: ManagedSocket = { socket, isAlive: true };
        const normalizedCode = roomCode.toUpperCase();
        const roomSockets = this.socketsByRoom.get(normalizedCode) ?? new Set<ManagedSocket>();
        roomSockets.add(managed);
        this.socketsByRoom.set(normalizedCode, roomSockets);
        this.metrics.record({ name: 'websocket_connections', value: 1 });
        if (reconnect) {
            this.metrics.record({ name: 'websocket_reconnects_total', value: 1 });
        }

        let removed = false;
        const removeSocket = () => {
            if (removed) return;
            removed = true;
            roomSockets.delete(managed);
            this.metrics.record({ name: 'websocket_connections', value: -1 });
            if (roomSockets.size === 0) {
                this.socketsByRoom.delete(normalizedCode);
            }
        };

        socket.on('pong', () => {
            managed.isAlive = true;
        });
        socket.on('close', () => {
            removeSocket();
        });
        socket.on('error', () => {
            removeSocket();
            this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'socket_error' } });
        });
        socket.on('message', () => {
            socket.close(1008, 'Comandos não suportados');
        });
    }

    async close(): Promise<void> {
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const roomSockets of this.socketsByRoom.values()) {
            for (const managed of roomSockets) {
                managed.socket.close(1001, 'Servidor encerrando');
            }
        }
        this.socketsByRoom.clear();
        await this.eventBus.close();
    }

    private async ensureStarted(): Promise<void> {
        if (!this.unsubscribe) {
            this.unsubscribe = await this.eventBus.subscribe((event) => this.broadcast(event));
        }
        if (!this.heartbeat) {
            this.heartbeat = setInterval(() => this.checkConnections(), 30_000);
            this.heartbeat.unref();
        }
    }

    private broadcast(event: RoomEventNotification): void {
        const roomSockets = this.socketsByRoom.get(event.roomCode.toUpperCase());
        if (!roomSockets) {
            return;
        }
        const message = JSON.stringify(roomRealtimeMessageSchema.parse({
            type: 'ROOM_UPDATED',
            roomVersion: event.version,
            eventType: event.eventType,
        }));
        for (const managed of roomSockets) {
            if (managed.socket.readyState === WebSocketState.OPEN) {
                if (managed.socket.bufferedAmount > MAX_BUFFERED_BYTES) {
                    managed.socket.close(1013, 'Cliente muito lento');
                    this.metrics.record({
                        name: 'room_event_delivery_errors_total',
                        value: 1,
                        labels: { reason: 'socket_backpressure' },
                    });
                    continue;
                }
                managed.socket.send(message, (error) => {
                    if (error) {
                        this.metrics.record({ name: 'room_event_delivery_errors_total', value: 1, labels: { reason: 'socket_send' } });
                    }
                });
            }
        }
    }

    private checkConnections(): void {
        for (const [roomCode, roomSockets] of this.socketsByRoom) {
            for (const managed of roomSockets) {
                if (!managed.isAlive) {
                    managed.socket.terminate();
                    continue;
                }
                managed.isAlive = false;
                managed.socket.ping();
            }
            if (roomSockets.size === 0) {
                this.socketsByRoom.delete(roomCode);
            }
        }
    }
}
