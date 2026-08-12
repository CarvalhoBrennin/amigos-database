import type { Pool, PoolClient } from 'pg';
import {
    candidateEvaluationSchema,
    matchesResponseSchema,
    nextCardResponseSchema,
    roomConstraintsSchema,
    submitVoteResponseSchema,
    type NextCardResponse,
    type RoomMatch,
    type SubmitVoteResponse,
    type VoteProgress,
    type VoteValue,
} from '../../../../shared/index.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { NoopProductAnalytics } from '../analytics/noop-product-analytics.js';
import { trackProductEvent, type ProductAnalytics } from '../analytics/product-analytics.js';
import type { CatalogGame, CatalogGateway } from '../catalog/catalog-gateway.js';
import { orderCandidatesForParticipant } from '../recommendation/domain/deterministic-order.js';
import { classifyMatch, compareMatches } from './domain/match-classifier.js';

interface MembershipRow {
    room_id: string;
    room_code: string;
    room_status: string;
    room_version: string;
    constraints: unknown;
    expires_at: Date;
    participant_id: string;
}

interface CandidateRow {
    game_id: string;
    base_score: string | number;
    evaluation: unknown;
}

interface MatchRow {
    game_id: string;
    kind: 'PERFECT' | 'STRONG';
    match_score: string | number;
    vote_summary: { yesCount: number; maybeCount: number };
    created_at: Date;
    base_score: string | number;
    evaluation: unknown;
}

export class VotingService {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly metrics: Metrics = noopMetrics,
        private readonly analytics: ProductAnalytics = new NoopProductAnalytics()
    ) {}

    async getNextCard(code: string, guestSessionId: string): Promise<NextCardResponse> {
        const membership = await this.getMembership(code, guestSessionId);
        if (membership.room_status !== 'MATCHING') {
            throw new AppError({ status: 409, code: 'ROOM_NOT_MATCHING', title: 'A sala não está em votação' });
        }
        const [candidatesResult, votesResult, progress] = await Promise.all([
            this.pool.query<CandidateRow>(
                `SELECT game_id, base_score, evaluation
                   FROM room_candidates WHERE room_id = $1`,
                [membership.room_id]
            ),
            this.pool.query<{ game_id: string }>(
                'SELECT game_id FROM room_votes WHERE room_id = $1 AND participant_id = $2',
                [membership.room_id, membership.participant_id]
            ),
            this.getProgress(membership),
        ]);
        const voted = new Set(votesResult.rows.map((row) => row.game_id));
        const evaluations = candidatesResult.rows.map((row) => candidateEvaluationSchema.parse(row.evaluation));
        const ordered = orderCandidatesForParticipant(
            evaluations,
            membership.room_id,
            membership.participant_id
        );
        const nextEvaluation = ordered.find((evaluation) => !voted.has(evaluation.gameId));
        if (!nextEvaluation) {
            return nextCardResponseSchema.parse({ card: null, progress });
        }
        const game = await this.requireCatalogGame(nextEvaluation.gameId);
        return nextCardResponseSchema.parse({
            card: {
                ...catalogSummary(game),
                baseScore: nextEvaluation.baseScore,
                relevantPlatforms: [...new Set(nextEvaluation.assignment.map((item) => item.platformCode))],
                accessKinds: [...new Set(nextEvaluation.assignment.map((item) => item.accessKind))],
                warnings: nextEvaluation.warnings,
            },
            progress,
        });
    }

    async submitVote(options: {
        code: string;
        guestSessionId: string;
        gameId: string;
        value: VoteValue;
    }): Promise<SubmitVoteResponse> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const membership = await this.lockMembership(client, options.code, options.guestSessionId);
            if (membership.room_status !== 'MATCHING') {
                throw new AppError({ status: 409, code: 'ROOM_NOT_MATCHING', title: 'A sala não está em votação' });
            }
            const participant = await client.query(
                `SELECT 1 FROM room_round_participants
                  WHERE room_id = $1 AND participant_id = $2`,
                [membership.room_id, membership.participant_id]
            );
            if (participant.rowCount === 0) {
                throw new AppError({ status: 403, code: 'ROUND_MEMBERSHIP_REQUIRED', title: 'Participante não pertence a esta rodada' });
            }
            const candidateResult = await client.query<CandidateRow>(
                `SELECT game_id, base_score, evaluation
                   FROM room_candidates
                  WHERE room_id = $1 AND game_id = $2`,
                [membership.room_id, options.gameId]
            );
            const candidate = candidateResult.rows[0];
            if (!candidate) {
                throw new AppError({ status: 404, code: 'CANDIDATE_NOT_FOUND', title: 'Jogo não pertence aos candidatos desta sala' });
            }
            const participantCountResult = await client.query<{ count: string }>(
                'SELECT COUNT(*)::text AS count FROM room_round_participants WHERE room_id = $1',
                [membership.room_id]
            );
            const participantCount = Number(participantCountResult.rows[0]?.count ?? 0);
            const existingVotes = await client.query<{ participant_id: string; value: VoteValue }>(
                `SELECT participant_id, value FROM room_votes
                  WHERE room_id = $1 AND game_id = $2`,
                [membership.room_id, options.gameId]
            );
            const ownVote = existingVotes.rows.find((vote) => vote.participant_id === membership.participant_id);
            if (existingVotes.rows.length >= participantCount) {
                if (ownVote?.value === options.value) {
                    const matchResult = await client.query<{
                        game_id: string;
                        kind: 'PERFECT' | 'STRONG';
                        match_score: string | number;
                    }>(
                        `SELECT game_id, kind, match_score
                           FROM room_matches
                          WHERE room_id = $1 AND game_id = $2`,
                        [membership.room_id, options.gameId]
                    );
                    const constraints = roomConstraintsSchema.parse(membership.constraints);
                    const progress = await this.getProgressInTransaction(
                        client,
                        membership,
                        constraints.matchTarget
                    );
                    await client.query('COMMIT');
                    const match = matchResult.rows[0];
                    return submitVoteResponseSchema.parse({
                        roomVersion: Number(membership.room_version),
                        finalized: true,
                        match: match
                            ? {
                                gameId: match.game_id,
                                kind: match.kind,
                                matchScore: Number(match.match_score),
                            }
                            : null,
                        progress,
                    });
                }
                throw new AppError({ status: 409, code: 'VOTE_LOCKED', title: 'A votação deste jogo já foi finalizada' });
            }

            if (ownVote?.value === options.value) {
                const constraints = roomConstraintsSchema.parse(membership.constraints);
                const progress = await this.getProgressInTransaction(
                    client,
                    membership,
                    constraints.matchTarget
                );
                await client.query('COMMIT');
                return submitVoteResponseSchema.parse({
                    roomVersion: Number(membership.room_version),
                    finalized: false,
                    match: null,
                    progress,
                });
            }

            const now = this.clock.now();
            await client.query(
                `INSERT INTO room_votes (
                    room_id, game_id, participant_id, value, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$5)
                ON CONFLICT (room_id, game_id, participant_id) DO UPDATE
                    SET value=EXCLUDED.value, updated_at=EXCLUDED.updated_at`,
                [membership.room_id, options.gameId, membership.participant_id, options.value, now]
            );
            const completedVotes = await client.query<{ value: VoteValue }>(
                `SELECT value FROM room_votes
                  WHERE room_id = $1 AND game_id = $2
                  ORDER BY participant_id`,
                [membership.room_id, options.gameId]
            );
            const finalized = completedVotes.rows.length === participantCount;
            const classified = finalized
                ? classifyMatch(completedVotes.rows.map((row) => row.value), participantCount, Number(candidate.base_score))
                : null;
            let matchCreated = false;
            if (classified) {
                const inserted = await client.query(
                    `INSERT INTO room_matches (
                        room_id, game_id, kind, match_score, vote_summary, created_at
                    ) VALUES ($1,$2,$3,$4,$5,$6)
                    ON CONFLICT (room_id, game_id) DO NOTHING`,
                    [
                        membership.room_id,
                        options.gameId,
                        classified.kind,
                        classified.matchScore,
                        JSON.stringify({ yesCount: classified.yesCount, maybeCount: classified.maybeCount }),
                        now,
                    ]
                );
                matchCreated = inserted.rowCount === 1;
            }
            const updated = await client.query<{ version: string }>(
                'UPDATE rooms SET version=version+1, updated_at=$2 WHERE id=$1 RETURNING version',
                [membership.room_id, now]
            );
            const roomVersion = Number(updated.rows[0]?.version);
            await notifyRoomEvent(client, {
                roomId: membership.room_id,
                roomCode: membership.room_code,
                version: roomVersion,
                eventType: matchCreated ? 'MATCH_CREATED' : 'VOTE_PROGRESS_CHANGED',
            }, this.metrics);
            const constraints = roomConstraintsSchema.parse(membership.constraints);
            const progress = await this.getProgressInTransaction(client, membership, constraints.matchTarget);
            if (matchCreated && progress.matches === progress.target) {
                await notifyRoomEvent(client, {
                    roomId: membership.room_id,
                    roomCode: membership.room_code,
                    version: roomVersion,
                    eventType: 'MATCH_TARGET_REACHED',
                }, this.metrics);
            }
            await client.query('COMMIT');
            const analyticsError = () => this.metrics.record({ name: 'product_analytics_errors_total', value: 1 });
            trackProductEvent(this.analytics, {
                event: 'vote_submitted',
                roomId: membership.room_id,
            }, analyticsError);
            if (matchCreated && classified) {
                trackProductEvent(this.analytics, {
                    event: 'match_created',
                    roomId: membership.room_id,
                    kind: classified.kind,
                }, analyticsError);
            }
            if (matchCreated && progress.matches === progress.target) {
                trackProductEvent(this.analytics, {
                    event: 'match_target_reached',
                    roomId: membership.room_id,
                    target: progress.target,
                }, analyticsError);
            }
            return submitVoteResponseSchema.parse({
                roomVersion,
                finalized,
                match: classified ? {
                    gameId: options.gameId,
                    kind: classified.kind,
                    matchScore: classified.matchScore,
                } : null,
                progress,
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listMatches(code: string, guestSessionId: string): Promise<{ matches: RoomMatch[] }> {
        const membership = await this.getMembership(code, guestSessionId);
        const result = await this.pool.query<MatchRow>(
            `SELECT rm.game_id, rm.kind, rm.match_score, rm.vote_summary, rm.created_at,
                    rc.base_score, rc.evaluation
               FROM room_matches rm
               JOIN room_candidates rc ON rc.room_id=rm.room_id AND rc.game_id=rm.game_id
              WHERE rm.room_id=$1`,
            [membership.room_id]
        );
        const matches = await Promise.all(result.rows.map(async (row): Promise<RoomMatch> => {
            const game = await this.requireCatalogGame(row.game_id);
            return {
                gameId: row.game_id,
                kind: row.kind,
                matchScore: Number(row.match_score),
                baseScore: Number(row.base_score),
                yesCount: row.vote_summary.yesCount,
                maybeCount: row.vote_summary.maybeCount,
                game: catalogSummary(game),
                evaluation: candidateEvaluationSchema.parse(row.evaluation),
                createdAt: row.created_at.toISOString(),
            };
        }));
        matches.sort(compareMatches);
        return matchesResponseSchema.parse({ matches });
    }

    private async getMembership(code: string, guestSessionId: string): Promise<MembershipRow> {
        const result = await this.pool.query<MembershipRow>(membershipQuery(false), [
            code.trim().toUpperCase(),
            guestSessionId,
        ]);
        return this.validateMembership(result.rows[0]);
    }

    private async lockMembership(client: PoolClient, code: string, guestSessionId: string): Promise<MembershipRow> {
        const result = await client.query<MembershipRow>(membershipQuery(true), [
            code.trim().toUpperCase(),
            guestSessionId,
        ]);
        return this.validateMembership(result.rows[0]);
    }

    private validateMembership(row: MembershipRow | undefined): MembershipRow {
        if (!row) throw new AppError({ status: 404, code: 'ROOM_NOT_FOUND', title: 'Sala não encontrada' });
        if (row.expires_at <= this.clock.now() || row.room_status === 'EXPIRED') {
            throw new AppError({ status: 410, code: 'ROOM_EXPIRED', title: 'Esta sala expirou' });
        }
        return row;
    }

    private async getProgress(membership: MembershipRow): Promise<VoteProgress> {
        const constraints = roomConstraintsSchema.parse(membership.constraints);
        return this.getProgressInTransaction(this.pool, membership, constraints.matchTarget);
    }

    private async getProgressInTransaction(
        queryable: Pick<Pool, 'query'> | Pick<PoolClient, 'query'>,
        membership: MembershipRow,
        target: number
    ): Promise<VoteProgress> {
        const result = await queryable.query<{ candidates: string; voted: string; matches: string }>(
            `SELECT
                (SELECT COUNT(*) FROM room_candidates WHERE room_id=$1)::text AS candidates,
                (SELECT COUNT(*) FROM room_votes WHERE room_id=$1 AND participant_id=$2)::text AS voted,
                (SELECT COUNT(*) FROM room_matches WHERE room_id=$1)::text AS matches`,
            [membership.room_id, membership.participant_id]
        );
        const counts = result.rows[0];
        const candidates = Number(counts?.candidates ?? 0);
        const voted = Number(counts?.voted ?? 0);
        return {
            voted,
            remaining: Math.max(0, candidates - voted),
            matches: Number(counts?.matches ?? 0),
            target,
        };
    }

    private async requireCatalogGame(gameId: string): Promise<CatalogGame> {
        const game = await this.catalog.getGameById(gameId, 'pt');
        if (!game) throw new AppError({ status: 404, code: 'CATALOG_GAME_NOT_FOUND', title: 'Jogo não encontrado no catálogo' });
        return game;
    }
}

function membershipQuery(forUpdate: boolean): string {
    return `SELECT r.id AS room_id, r.code AS room_code, r.status AS room_status,
                   r.version AS room_version, r.constraints, r.expires_at,
                   p.id AS participant_id
             FROM rooms r
             JOIN room_participants p ON p.room_id=r.id
             AND p.status <> 'LEFT'
             WHERE r.code=$1 AND p.guest_session_id=$2
             ${forUpdate ? 'FOR UPDATE OF r' : ''}`;
}

function catalogSummary(game: CatalogGame) {
    return {
        id: game.id,
        title: game.title,
        imageUrl: game.imageUrl,
        playerMin: game.players[0],
        playerMax: game.players[1],
        session: game.session,
        difficulty: game.difficulty,
        rating: game.rating,
        summary: game.description,
    };
}
