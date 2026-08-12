import type { Pool, PoolClient } from 'pg';
import {
    finalistDetailsSchema,
    type FinalistDetails,
    type RoomPublicSnapshot,
} from '../../../../shared/index.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import { trackProductEvent, type ProductAnalytics } from '../analytics/product-analytics.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';
import type { VotingService } from '../voting/voting-service.js';
import type { PostgresRoomRepository } from './postgres-room-repository.js';

interface LockedRoomRow {
    id: string;
    code: string;
    status: string;
    version: string;
    expires_at: Date;
    participant_id: string;
    role: 'HOST' | 'MEMBER';
}

export class FinalistService {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly rooms: PostgresRoomRepository,
        private readonly voting: VotingService,
        private readonly catalog: CatalogGateway,
        private readonly metrics: Metrics = noopMetrics,
        private readonly analytics: ProductAnalytics = new NoopProductAnalytics()
    ) {}

    async openShortlist(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
    }): Promise<RoomPublicSnapshot> {
        const result = await this.mutate(options, async (client, room) => {
            if (room.status === 'SHORTLIST') return false;
            if (room.status !== 'MATCHING') {
                throw new AppError({ status: 409, code: 'ROOM_NOT_MATCHING', title: 'A sala não está em votação' });
            }
            const matches = await client.query(
                'SELECT 1 FROM room_matches WHERE room_id=$1 LIMIT 1',
                [room.id]
            );
            if (matches.rowCount === 0) {
                throw new AppError({ status: 422, code: 'SHORTLIST_REQUIRES_MATCH', title: 'É necessário ter ao menos um match' });
            }
            const now = this.clock.now();
            await client.query(
                `UPDATE rooms SET status='SHORTLIST', version=version+1, updated_at=$2 WHERE id=$1`,
                [room.id, now]
            );
            await notifyRoomEvent(client, {
                roomId: room.id,
                roomCode: room.code,
                version: Number(room.version) + 1,
                eventType: 'SHORTLIST_OPENED',
            }, this.metrics);
            return true;
        });
        if (result.changed) {
            trackProductEvent(this.analytics, {
                event: 'shortlist_opened',
                roomId: result.room.id,
            }, () => this.metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
        }
        return this.rooms.getSnapshotByCode(options.code, options.guestSessionId);
    }

    async getFinalistDetails(code: string, gameId: string, guestSessionId: string): Promise<FinalistDetails> {
        const room = await this.rooms.getSnapshotByCode(code, guestSessionId);
        if (!['SHORTLIST', 'COMPLETED'].includes(room.status)) {
            throw new AppError({ status: 409, code: 'SHORTLIST_NOT_OPEN', title: 'Os finalistas ainda não foram abertos' });
        }
        const matches = await this.voting.listMatches(code, guestSessionId);
        const match = matches.matches.find((item) => item.gameId === gameId);
        if (!match) {
            throw new AppError({ status: 404, code: 'FINALIST_NOT_FOUND', title: 'Jogo não pertence aos finalistas desta sala' });
        }
        const game = await this.catalog.getGameById(gameId, 'pt');
        if (!game) {
            throw new AppError({ status: 404, code: 'CATALOG_GAME_NOT_FOUND', title: 'Jogo não encontrado no catálogo' });
        }
        const participantById = new Map(room.participants.map((participant) => [participant.id, participant]));
        return finalistDetailsSchema.parse({
            match,
            description: game.description,
            mechanic: game.mechanic,
            verdict: game.verdict,
            tags: game.tags,
            stats: game.stats,
            storeUrl: game.storeUrl,
            participantAccess: match.evaluation.assignment.map((assignment) => ({
                participantId: assignment.participantId,
                nickname: participantById.get(assignment.participantId)?.nickname ?? 'Participante',
                platformCode: assignment.platformCode,
                accessKind: assignment.accessKind,
                subscriptionPlanCode: assignment.subscriptionPlanCode,
                amountMinor: assignment.amountMinor,
                currency: assignment.currency,
                onlineMultiplayer: assignment.onlineMultiplayer.kind,
            })),
        });
    }

    async complete(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        gameId: string;
    }): Promise<RoomPublicSnapshot> {
        const result = await this.mutate(options, async (client, room) => {
            const existing = await client.query<{ game_id: string }>(
                'SELECT game_id FROM room_decisions WHERE room_id=$1',
                [room.id]
            );
            if (existing.rows[0]?.game_id === options.gameId) return false;
            if (existing.rows[0] || room.status === 'COMPLETED') {
                throw new AppError({ status: 409, code: 'ROOM_ALREADY_COMPLETED', title: 'A sala já possui outra decisão' });
            }
            if (room.status !== 'SHORTLIST') {
                throw new AppError({ status: 409, code: 'SHORTLIST_NOT_OPEN', title: 'Abra os finalistas antes de registrar a decisão' });
            }
            const finalist = await client.query(
                'SELECT 1 FROM room_matches WHERE room_id=$1 AND game_id=$2',
                [room.id, options.gameId]
            );
            if (finalist.rowCount === 0) {
                throw new AppError({ status: 422, code: 'DECISION_MUST_BE_MATCH', title: 'A decisão precisa ser um match desta sala' });
            }
            const now = this.clock.now();
            await client.query(
                `INSERT INTO room_decisions (room_id, game_id, selected_by_participant_id, created_at)
                 VALUES ($1,$2,$3,$4)`,
                [room.id, options.gameId, room.participant_id, now]
            );
            await client.query(
                `UPDATE rooms
                    SET status='COMPLETED', version=version+1, completed_at=$2, updated_at=$2
                  WHERE id=$1`,
                [room.id, now]
            );
            await notifyRoomEvent(client, {
                roomId: room.id,
                roomCode: room.code,
                version: Number(room.version) + 1,
                eventType: 'ROOM_COMPLETED',
            }, this.metrics);
            return true;
        });
        if (result.changed) {
            trackProductEvent(this.analytics, {
                event: 'decision_completed',
                roomId: result.room.id,
                gameId: options.gameId,
            }, () => this.metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
        }
        return this.rooms.getSnapshotByCode(options.code, options.guestSessionId);
    }

    private async mutate(
        options: { code: string; guestSessionId: string; expectedRoomVersion: number },
        operation: (client: PoolClient, room: LockedRoomRow) => Promise<boolean>
    ): Promise<{ room: LockedRoomRow; changed: boolean }> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const room = await this.lockRoom(client, options.code, options.guestSessionId);
            if (room.role !== 'HOST') {
                throw new AppError({ status: 403, code: 'HOST_ROLE_REQUIRED', title: 'Apenas o host pode realizar esta ação' });
            }
            const currentVersion = Number(room.version);
            const existingDecision = room.status === 'COMPLETED';
            if (currentVersion !== options.expectedRoomVersion && !existingDecision) {
                throw new AppError({
                    status: 409,
                    code: 'ROOM_VERSION_CONFLICT',
                    title: 'A sala foi atualizada por outra pessoa',
                    currentVersion,
                });
            }
            const changed = await operation(client, room);
            await client.query('COMMIT');
            return { room, changed };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async lockRoom(client: PoolClient, code: string, guestSessionId: string): Promise<LockedRoomRow> {
        const result = await client.query<LockedRoomRow>(
            `SELECT r.id, r.code, r.status, r.version, r.expires_at,
                    p.id AS participant_id, p.role
               FROM rooms r
               JOIN room_participants p ON p.room_id=r.id
                AND p.status <> 'LEFT'
              WHERE r.code=$1 AND p.guest_session_id=$2
              FOR UPDATE OF r`,
            [code.trim().toUpperCase(), guestSessionId]
        );
        const room = result.rows[0];
        if (!room) throw new AppError({ status: 404, code: 'ROOM_NOT_FOUND', title: 'Sala não encontrada' });
        if (room.expires_at <= this.clock.now()) throw new AppError({ status: 410, code: 'ROOM_EXPIRED', title: 'Esta sala expirou' });
        return room;
    }
}
