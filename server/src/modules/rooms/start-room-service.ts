import type { Pool, PoolClient } from 'pg';
import {
    prefilterSummarySchema,
    type CandidateEvaluation,
    type DecisionParticipant,
    type PrefilterSummary,
    type RoomPublicSnapshot,
    type StartRoomResponse,
    type SubscriptionCapabilities,
} from '../../../../shared/index.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import {
    trackProductEvent,
    type ProductAnalytics,
} from '../analytics/product-analytics.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';
import { deterministicRankSeed } from '../recommendation/domain/deterministic-order.js';
import { evaluateCandidates } from '../recommendation/domain/recommendation-engine.js';
import type { DecisionContext } from '../recommendation/domain/types.js';
import type { DecisionDataRepository } from '../recommendation/decision-data-repository.js';
import type { PostgresRoomRepository } from './postgres-room-repository.js';

interface LockedStartRow {
    id: string;
    code: string;
    status: string;
    version: string;
    role: 'HOST' | 'MEMBER';
    expires_at: Date;
}

export class StartRoomService {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly decisionData: DecisionDataRepository,
        private readonly rooms: PostgresRoomRepository,
        private readonly metrics: Metrics = noopMetrics,
        private readonly analytics: ProductAnalytics = new NoopProductAnalytics()
    ) {}

    async start(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
    }): Promise<StartRoomResponse> {
        const room = await this.rooms.getSnapshotByCode(options.code, options.guestSessionId, {
            includePrivateProfiles: true,
        });
        this.assertStartableSnapshot(room);
        const currentParticipant = room.participants.find((participant) => participant.id === room.currentParticipantId);
        if (currentParticipant?.role !== 'HOST') {
            throw new AppError({ status: 403, code: 'HOST_ROLE_REQUIRED', title: 'Apenas o host pode iniciar a sala' });
        }

        const planCodes = room.participants.flatMap((participant) => participant.subscriptions);
        const [catalogIds, planCapabilities] = await Promise.all([
            this.catalog.listGameIds(),
            this.decisionData.getPlanCapabilities(planCodes, room.regionCode, this.clock.now()),
        ]);
        const candidates = await this.decisionData.listCandidateData(catalogIds, room.regionCode);
        const context = this.buildContext(room, planCapabilities);
        const recommendationStartedAt = performance.now();
        const evaluations = evaluateCandidates(context, candidates);
        this.metrics.record({
            name: 'recommendation_duration_ms',
            value: performance.now() - recommendationStartedAt,
        });
        const summary = this.buildPrefilterSummary(catalogIds.length, candidates.length, evaluations);
        const selected = evaluations
            .filter((evaluation) => evaluation.eligible)
            .sort((left, right) => right.baseScore - left.baseScore || left.gameId.localeCompare(right.gameId))
            .slice(0, room.constraints.maxEvaluationsPerParticipant);

        this.metrics.record({
            name: 'recommendation_candidates_total',
            value: selected.length,
            labels: { status: 'eligible' },
        });
        for (const [reason, count] of Object.entries(summary.rejectedByReason)) {
            this.metrics.record({
                name: 'recommendation_rejections_total',
                value: count,
                labels: { reason },
            });
        }

        if (selected.length === 0) {
            throw new AppError({
                status: 422,
                code: 'NO_ELIGIBLE_CANDIDATES',
                title: 'Nenhum jogo atende às regras atuais',
                detail: `Foram avaliados ${summary.totalConsidered} jogos; revise os filtros ou importe dados de decisão verificados.`,
            });
        }

        return this.materialize({ ...options, participantIds: room.participants
            .filter((participant) => participant.status !== 'LEFT')
            .map((participant) => participant.id), evaluations: selected, summary });
    }

    private buildContext(
        room: RoomPublicSnapshot,
        planCapabilities: Map<string, SubscriptionCapabilities>
    ): DecisionContext {
        return {
            now: this.clock.now(),
            room: { id: room.id, regionCode: room.regionCode, constraints: room.constraints },
            participants: room.participants
                .filter((participant) => participant.status !== 'LEFT')
                .map((participant): DecisionParticipant => ({
                    id: participant.id,
                    platforms: participant.platforms,
                    subscriptions: participant.subscriptions.flatMap((planCode) => {
                        const capabilities = planCapabilities.get(planCode);
                        return capabilities ? [{ planCode, capabilities, regionCode: room.regionCode }] : [];
                    }),
                    ownedGames: participant.ownedGames.map((game) => ({
                        gameId: game.gameId,
                        platformCode: game.platformCode ?? null,
                    })),
                    pcTier: participant.pcTier,
                    preferences: participant.preferences,
                })),
            history: room.history.map((entry) => ({
                gameId: entry.gameId,
                disposition: entry.disposition,
            })),
        };
    }

    private buildPrefilterSummary(
        totalCatalogGames: number,
        decisionDataGames: number,
        evaluations: CandidateEvaluation[]
    ): PrefilterSummary {
        const rejectedByReason: Record<string, number> = {};
        const missingDecisionData = Math.max(0, totalCatalogGames - decisionDataGames);
        if (missingDecisionData > 0) {
            rejectedByReason.INSUFFICIENT_DECISION_DATA = missingDecisionData;
        }
        for (const evaluation of evaluations) {
            for (const reason of evaluation.rejectionReasons) {
                rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
            }
        }
        return prefilterSummarySchema.parse({
            totalConsidered: totalCatalogGames,
            eligible: evaluations.filter((evaluation) => evaluation.eligible).length,
            rejectedByReason,
        });
    }

    private async materialize(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        participantIds: string[];
        evaluations: CandidateEvaluation[];
        summary: PrefilterSummary;
    }): Promise<StartRoomResponse> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const locked = await this.lockRoom(client, options.code, options.guestSessionId);
            if (locked.role !== 'HOST') {
                throw new AppError({ status: 403, code: 'HOST_ROLE_REQUIRED', title: 'Apenas o host pode iniciar a sala' });
            }
            if (locked.status !== 'LOBBY') {
                throw new AppError({ status: 409, code: 'ROOM_ALREADY_STARTED', title: 'A sala já foi iniciada' });
            }
            const currentVersion = Number(locked.version);
            if (currentVersion !== options.expectedRoomVersion) {
                throw new AppError({
                    status: 409,
                    code: 'ROOM_VERSION_CONFLICT',
                    title: 'A sala foi atualizada por outra pessoa',
                    currentVersion,
                });
            }
            const participants = await client.query<{ id: string; status: string; platform_count: string }>(
                `SELECT p.id, p.status, COUNT(pp.platform_code)::text AS platform_count
                   FROM room_participants p
                   LEFT JOIN participant_platforms pp ON pp.participant_id = p.id
                  WHERE p.room_id = $1 AND p.status <> 'LEFT'
                  GROUP BY p.id, p.status
                  ORDER BY p.id`,
                [locked.id]
            );
            if (participants.rows.length < 2) {
                throw new AppError({ status: 422, code: 'ROOM_REQUIRES_MORE_PARTICIPANTS', title: 'A sala precisa de pelo menos duas pessoas' });
            }
            if (participants.rows.some((participant) => participant.status !== 'READY' || Number(participant.platform_count) < 1)) {
                throw new AppError({ status: 422, code: 'PARTICIPANTS_NOT_READY', title: 'Todos precisam concluir o setup e ficar prontos' });
            }
            const persistedIds = participants.rows.map((participant) => participant.id).sort();
            if (persistedIds.join(':') !== [...options.participantIds].sort().join(':')) {
                throw new AppError({
                    status: 409,
                    code: 'ROOM_VERSION_CONFLICT',
                    title: 'A composição da sala mudou',
                    currentVersion,
                });
            }

            for (const participant of participants.rows) {
                await client.query(
                    `INSERT INTO room_round_participants (room_id, participant_id)
                     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [locked.id, participant.id]
                );
            }
            const now = this.clock.now();
            for (const evaluation of options.evaluations) {
                await client.query(
                    `INSERT INTO room_candidates (
                        room_id, game_id, base_score, rank_seed, evaluation,
                        data_snapshot_version, created_at
                    ) VALUES ($1,$2,$3,$4,$5,1,$6)
                    ON CONFLICT (room_id, game_id) DO NOTHING`,
                    [
                        locked.id,
                        evaluation.gameId,
                        evaluation.baseScore,
                        deterministicRankSeed(locked.id, evaluation.gameId),
                        JSON.stringify(evaluation),
                        now,
                    ]
                );
            }
            const updated = await client.query<{ version: string }>(
                `UPDATE rooms
                    SET status='MATCHING', version=version+1, prefilter_summary=$2,
                        started_at=$3, updated_at=$3
                  WHERE id=$1
                  RETURNING version`,
                [locked.id, JSON.stringify(options.summary), now]
            );
            const version = Number(updated.rows[0]?.version);
            await notifyRoomEvent(client, {
                roomId: locked.id,
                roomCode: locked.code,
                version,
                eventType: 'ROOM_STARTED',
            }, this.metrics);
            await client.query('COMMIT');
            trackProductEvent(this.analytics, {
                event: 'room_started',
                roomId: locked.id,
                participantCount: participants.rows.length,
            }, () => this.metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
            trackProductEvent(this.analytics, {
                event: 'candidate_pool_generated',
                roomId: locked.id,
                participantCount: participants.rows.length,
                eligibleCount: options.evaluations.length,
                rejectionCounts: options.summary.rejectedByReason,
            }, () => this.metrics.record({ name: 'product_analytics_errors_total', value: 1 }));
            return { roomVersion: version, status: 'MATCHING', prefilterSummary: options.summary };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private assertStartableSnapshot(room: RoomPublicSnapshot): void {
        if (room.status !== 'LOBBY') {
            throw new AppError({ status: 409, code: 'ROOM_ALREADY_STARTED', title: 'A sala já foi iniciada' });
        }
        const active = room.participants.filter((participant) => participant.status !== 'LEFT');
        if (active.length < 2) {
            throw new AppError({ status: 422, code: 'ROOM_REQUIRES_MORE_PARTICIPANTS', title: 'A sala precisa de pelo menos duas pessoas' });
        }
        if (active.some((participant) => participant.status !== 'READY' || participant.platforms.length === 0)) {
            throw new AppError({ status: 422, code: 'PARTICIPANTS_NOT_READY', title: 'Todos precisam concluir o setup e ficar prontos' });
        }
    }

    private async lockRoom(client: PoolClient, code: string, guestSessionId: string): Promise<LockedStartRow> {
        const result = await client.query<LockedStartRow>(
            `SELECT r.id, r.code, r.status, r.version, r.expires_at, p.role
               FROM rooms r
               JOIN room_participants p ON p.room_id = r.id
                AND p.status <> 'LEFT'
              WHERE r.code = $1 AND p.guest_session_id = $2
              FOR UPDATE OF r`,
            [code.trim().toUpperCase(), guestSessionId]
        );
        const room = result.rows[0];
        if (!room) throw new AppError({ status: 404, code: 'ROOM_NOT_FOUND', title: 'Sala não encontrada' });
        if (room.expires_at <= this.clock.now()) {
            throw new AppError({ status: 410, code: 'ROOM_EXPIRED', title: 'Esta sala expirou' });
        }
        return room;
    }
}
