import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
    roomConstraintsSchema,
    type ParticipantProfile,
    type RoomConstraints,
    type RoomEventType,
    type RoomGameHistoryDisposition,
    type RoomGameHistoryEntry,
} from '../../../../shared/index.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';

interface LockedRoomContext {
    room_id: string;
    room_code: string;
    room_status: string;
    room_version: string;
    region_code: string;
    expires_at: Date;
    participant_id: string;
    participant_role: 'HOST' | 'MEMBER';
    participant_status: 'CONFIGURING' | 'READY' | 'LEFT';
}

interface HistoryRow {
    game_id: string;
    disposition: RoomGameHistoryDisposition;
    created_by_participant_id: string;
    created_at: Date;
}

export class PostgresLobbyRepository {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly metrics: Metrics = noopMetrics
    ) {}

    async updateProfile(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        profile: ParticipantProfile;
    }): Promise<number> {
        await this.assertKnownGames(options.profile.ownedGames.map((game) => game.gameId));
        return this.transaction(async (client) => {
            const context = await this.lockRoom(client, options.code, options.guestSessionId);
            this.assertLobby(context);
            this.assertExpectedVersion(context, options.expectedRoomVersion);
            await this.assertActivePlatforms(client, [
                ...options.profile.platforms,
                ...options.profile.ownedGames.flatMap((game) => game.platformCode ? [game.platformCode] : []),
            ]);
            await this.assertActivePlans(client, context.region_code, options.profile.subscriptions);

            await client.query('DELETE FROM participant_platforms WHERE participant_id = $1', [context.participant_id]);
            if (options.profile.platforms.length > 0) {
                await client.query(
                    `INSERT INTO participant_platforms (participant_id, platform_code)
                     SELECT $1, code FROM UNNEST($2::varchar[]) AS code`,
                    [context.participant_id, options.profile.platforms]
                );
            }

            await client.query('DELETE FROM participant_subscriptions WHERE participant_id = $1', [context.participant_id]);
            if (options.profile.subscriptions.length > 0) {
                await client.query(
                    `INSERT INTO participant_subscriptions (
                        participant_id, subscription_plan_id, self_reported, declared_at
                    )
                    SELECT $1, id, TRUE, $3
                      FROM subscription_plans
                     WHERE code = ANY($2::varchar[])`,
                    [context.participant_id, options.profile.subscriptions, this.clock.now()]
                );
            }

            await client.query('DELETE FROM participant_owned_games WHERE participant_id = $1', [context.participant_id]);
            if (options.profile.ownedGames.length > 0) {
                const ownedIds = options.profile.ownedGames.map(() => randomUUID());
                const gameIds = options.profile.ownedGames.map((game) => game.gameId);
                const platformCodes = options.profile.ownedGames.map((game) => game.platformCode ?? null);
                await client.query(
                    `INSERT INTO participant_owned_games (
                        id, participant_id, game_id, platform_code, ownership_source, created_at
                    )
                    SELECT item.id, $1, item.game_id, item.platform_code, 'SELF_REPORTED', $5
                      FROM UNNEST($2::uuid[], $3::varchar[], $4::varchar[])
                           AS item(id, game_id, platform_code)`,
                    [context.participant_id, ownedIds, gameIds, platformCodes, this.clock.now()]
                );
            }

            const now = this.clock.now();
            await client.query(
                `UPDATE room_participants
                    SET preferences = $2,
                        preferences_schema_version = 1,
                        pc_tier = $3,
                        status = 'CONFIGURING',
                        updated_at = $4
                  WHERE id = $1`,
                [
                    context.participant_id,
                    JSON.stringify(options.profile.preferences),
                    options.profile.pcTier ?? null,
                    now,
                ]
            );
            return this.incrementVersionAndNotify(client, context, 'PARTICIPANT_PROFILE_CHANGED', now);
        });
    }

    async setReady(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        ready: boolean;
    }): Promise<{ version: number; changed: boolean }> {
        return this.transaction(async (client) => {
            const context = await this.lockRoom(client, options.code, options.guestSessionId);
            this.assertLobby(context);
            this.assertExpectedVersion(context, options.expectedRoomVersion);
            const nextStatus = options.ready ? 'READY' : 'CONFIGURING';
            if (options.ready) {
                const platformResult = await client.query(
                    'SELECT 1 FROM participant_platforms WHERE participant_id = $1 LIMIT 1',
                    [context.participant_id]
                );
                if (platformResult.rowCount === 0) {
                    throw new AppError({
                        status: 422,
                        code: 'PARTICIPANT_SETUP_INCOMPLETE',
                        title: 'Selecione ao menos uma plataforma antes de ficar pronto',
                    });
                }
            }
            if (context.participant_status === nextStatus) {
                return { version: Number(context.room_version), changed: false };
            }
            const now = this.clock.now();
            await client.query(
                'UPDATE room_participants SET status = $2, updated_at = $3 WHERE id = $1',
                [context.participant_id, nextStatus, now]
            );
            return {
                version: await this.incrementVersionAndNotify(client, context, 'PARTICIPANT_READY_CHANGED', now),
                changed: true,
            };
        });
    }

    async updateConstraints(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        constraints: RoomConstraints;
    }): Promise<number> {
        return this.transaction(async (client) => {
            const context = await this.lockRoom(client, options.code, options.guestSessionId);
            this.assertLobby(context);
            this.assertHost(context);
            this.assertExpectedVersion(context, options.expectedRoomVersion);
            const constraints = roomConstraintsSchema.parse(options.constraints);
            if (constraints.regionCode !== context.region_code) {
                throw new AppError({
                    status: 400,
                    code: 'ROOM_REGION_IMMUTABLE',
                    title: 'A região da sala não pode ser alterada',
                });
            }
            const now = this.clock.now();
            await client.query(
                `UPDATE rooms
                    SET constraints = $2, constraints_schema_version = 1, updated_at = $3
                  WHERE id = $1`,
                [context.room_id, JSON.stringify(constraints), now]
            );
            return this.incrementVersionAndNotify(client, context, 'ROOM_CONSTRAINTS_CHANGED', now);
        });
    }

    async addHistory(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        gameId: string;
        disposition: RoomGameHistoryDisposition;
    }): Promise<number> {
        await this.assertKnownGames([options.gameId]);
        return this.transaction(async (client) => {
            const context = await this.lockRoom(client, options.code, options.guestSessionId);
            this.assertLobby(context);
            this.assertExpectedVersion(context, options.expectedRoomVersion);
            const countResult = await client.query<{ count: string }>(
                'SELECT COUNT(*)::text AS count FROM room_game_history WHERE room_id = $1',
                [context.room_id]
            );
            const existing = await client.query(
                'SELECT 1 FROM room_game_history WHERE room_id = $1 AND game_id = $2',
                [context.room_id, options.gameId]
            );
            if (existing.rowCount === 0 && Number(countResult.rows[0]?.count ?? 0) >= 500) {
                throw new AppError({
                    status: 422,
                    code: 'ROOM_HISTORY_LIMIT_REACHED',
                    title: 'O histórico da sala atingiu o limite',
                });
            }
            const now = this.clock.now();
            await client.query(
                `INSERT INTO room_game_history (
                    room_id, game_id, disposition, created_by_participant_id, created_at
                ) VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (room_id, game_id) DO UPDATE
                    SET disposition = EXCLUDED.disposition,
                        created_by_participant_id = EXCLUDED.created_by_participant_id,
                        created_at = EXCLUDED.created_at`,
                [context.room_id, options.gameId, options.disposition, context.participant_id, now]
            );
            return this.incrementVersionAndNotify(client, context, 'ROOM_HISTORY_CHANGED', now);
        });
    }

    async removeHistory(options: {
        code: string;
        guestSessionId: string;
        expectedRoomVersion: number;
        gameId: string;
    }): Promise<number> {
        return this.transaction(async (client) => {
            const context = await this.lockRoom(client, options.code, options.guestSessionId);
            this.assertLobby(context);
            this.assertExpectedVersion(context, options.expectedRoomVersion);
            const entryResult = await client.query<{ created_by_participant_id: string }>(
                `SELECT created_by_participant_id
                   FROM room_game_history
                  WHERE room_id = $1 AND game_id = $2`,
                [context.room_id, options.gameId]
            );
            const entry = entryResult.rows[0];
            if (!entry) {
                throw new AppError({ status: 404, code: 'HISTORY_ENTRY_NOT_FOUND', title: 'Jogo não encontrado no histórico' });
            }
            if (context.participant_role !== 'HOST' && entry.created_by_participant_id !== context.participant_id) {
                throw new AppError({
                    status: 403,
                    code: 'HOST_ROLE_REQUIRED',
                    title: 'Somente o host pode remover esta entrada',
                });
            }
            const now = this.clock.now();
            await client.query(
                'DELETE FROM room_game_history WHERE room_id = $1 AND game_id = $2',
                [context.room_id, options.gameId]
            );
            return this.incrementVersionAndNotify(client, context, 'ROOM_HISTORY_CHANGED', now);
        });
    }

    async listHistory(code: string, guestSessionId: string): Promise<RoomGameHistoryEntry[]> {
        const membership = await this.pool.query<{ room_id: string }>(
            `SELECT r.id AS room_id
               FROM rooms r
               JOIN room_participants p ON p.room_id = r.id
                AND p.status <> 'LEFT'
              WHERE r.code = $1 AND p.guest_session_id = $2`,
            [this.normalizeCode(code), guestSessionId]
        );
        const roomId = membership.rows[0]?.room_id;
        if (!roomId) {
            throw this.roomNotFoundError();
        }
        const result = await this.pool.query<HistoryRow>(
            `SELECT game_id, disposition, created_by_participant_id, created_at
               FROM room_game_history
              WHERE room_id = $1
              ORDER BY created_at, game_id`,
            [roomId]
        );
        return Promise.all(result.rows.map(async (row) => ({
            gameId: row.game_id,
            title: (await this.catalog.getGameById(row.game_id, 'pt'))?.title ?? row.game_id,
            disposition: row.disposition,
            createdByParticipantId: row.created_by_participant_id,
            createdAt: row.created_at.toISOString(),
        })));
    }

    private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
        const client = await this.pool.connect();
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

    private async lockRoom(client: PoolClient, code: string, guestSessionId: string): Promise<LockedRoomContext> {
        const result = await client.query<LockedRoomContext>(
            `SELECT r.id AS room_id,
                    r.code AS room_code,
                    r.status AS room_status,
                    r.version AS room_version,
                    r.region_code,
                    r.expires_at,
                    p.id AS participant_id,
                    p.role AS participant_role,
                    p.status AS participant_status
               FROM rooms r
               JOIN room_participants p ON p.room_id = r.id
              WHERE r.code = $1 AND p.guest_session_id = $2
              FOR UPDATE OF r, p`,
            [this.normalizeCode(code), guestSessionId]
        );
        const context = result.rows[0];
        if (!context) {
            throw this.roomNotFoundError();
        }
        if (context.expires_at <= this.clock.now() || context.room_status === 'EXPIRED') {
            throw new AppError({ status: 410, code: 'ROOM_EXPIRED', title: 'Esta sala expirou' });
        }
        if (context.participant_status === 'LEFT') {
            throw this.roomNotFoundError();
        }
        return context;
    }

    private assertLobby(context: LockedRoomContext): void {
        if (context.room_status !== 'LOBBY') {
            throw new AppError({
                status: 409,
                code: 'ROOM_NOT_IN_LOBBY',
                title: 'A configuração da sala está bloqueada após o início',
            });
        }
    }

    private assertHost(context: LockedRoomContext): void {
        if (context.participant_role !== 'HOST') {
            throw new AppError({ status: 403, code: 'HOST_ROLE_REQUIRED', title: 'Apenas o host pode realizar esta ação' });
        }
    }

    private assertExpectedVersion(context: LockedRoomContext, expectedVersion: number): void {
        const currentVersion = Number(context.room_version);
        if (currentVersion !== expectedVersion) {
            throw new AppError({
                status: 409,
                code: 'ROOM_VERSION_CONFLICT',
                title: 'A sala foi atualizada por outra pessoa',
                detail: 'Atualize o estado da sala e tente novamente.',
                currentVersion,
            });
        }
    }

    private async assertKnownGames(gameIds: string[]): Promise<void> {
        if (gameIds.length === 0) {
            return;
        }
        const knownGames = new Set(await this.catalog.listGameIds());
        const unknownGame = gameIds.find((gameId) => !knownGames.has(gameId));
        if (unknownGame) {
            throw new AppError({
                status: 400,
                code: 'CATALOG_GAME_NOT_FOUND',
                title: 'Jogo não encontrado no catálogo',
                detail: `O jogo ${unknownGame} não existe no catálogo atual.`,
            });
        }
    }

    private async assertActivePlatforms(client: PoolClient, platformCodes: string[]): Promise<void> {
        const uniqueCodes = [...new Set(platformCodes)];
        if (uniqueCodes.length === 0) {
            return;
        }
        const result = await client.query<{ code: string }>(
            'SELECT code FROM platform_references WHERE active = TRUE AND code = ANY($1::varchar[])',
            [uniqueCodes]
        );
        if (result.rowCount !== uniqueCodes.length) {
            throw new AppError({ status: 400, code: 'PLATFORM_NOT_ACTIVE', title: 'Uma plataforma selecionada não está disponível' });
        }
    }

    private async assertActivePlans(client: PoolClient, regionCode: string, planCodes: string[]): Promise<void> {
        const uniqueCodes = [...new Set(planCodes)];
        if (uniqueCodes.length === 0) {
            return;
        }
        const now = this.clock.now();
        const result = await client.query<{ code: string }>(
            `SELECT DISTINCT sp.code
               FROM subscription_plans sp
               JOIN subscription_services ss ON ss.id = sp.service_id
               JOIN subscription_plan_regions spr ON spr.subscription_plan_id = sp.id
              WHERE sp.code = ANY($1::varchar[])
                AND spr.region_code = $2
                AND sp.active = TRUE AND ss.active = TRUE AND spr.active = TRUE
                AND (spr.valid_from IS NULL OR spr.valid_from <= $3)
                AND (spr.valid_until IS NULL OR spr.valid_until >= $3)`,
            [uniqueCodes, regionCode, now]
        );
        if (result.rowCount !== uniqueCodes.length) {
            throw new AppError({ status: 400, code: 'SUBSCRIPTION_PLAN_NOT_ACTIVE', title: 'Um plano selecionado não está disponível para esta região' });
        }
    }

    private async incrementVersionAndNotify(
        client: PoolClient,
        context: LockedRoomContext,
        eventType: RoomEventType,
        now: Date
    ): Promise<number> {
        const result = await client.query<{ version: string }>(
            'UPDATE rooms SET version = version + 1, updated_at = $2 WHERE id = $1 RETURNING version',
            [context.room_id, now]
        );
        const version = Number(result.rows[0]?.version);
        await notifyRoomEvent(client, {
            roomId: context.room_id,
            roomCode: context.room_code,
            version,
            eventType,
        }, this.metrics);
        return version;
    }

    private normalizeCode(code: string): string {
        return code.trim().toUpperCase();
    }

    private roomNotFoundError(): AppError {
        return new AppError({ status: 404, code: 'ROOM_NOT_FOUND', title: 'Sala não encontrada' });
    }
}
