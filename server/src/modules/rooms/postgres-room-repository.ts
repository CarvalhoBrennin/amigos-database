import { randomInt, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import {
    defaultParticipantPreferences,
    defaultRoomConstraints,
    participantPreferencesSchema,
    platformCodeSchema,
    prefilterSummarySchema,
    roomConstraintsSchema,
    type ParticipantPublicSnapshot,
    type RoomGameHistoryEntry,
    type RoomPublicSnapshot,
} from '../../../../shared/index.js';
import type { ServerConfig } from '../../config/env.js';
import type { Clock } from '../../lib/clock.js';
import { constantTimeEqual, createOpaqueToken, deriveToken, hashToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { noopMetrics, type Metrics } from '../../lib/metrics.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 8;

interface RoomRow {
    id: string;
    code: string;
    status: RoomPublicSnapshot['status'];
    version: string | number;
    region_code: string;
    constraints: unknown;
    prefilter_summary: unknown | null;
    created_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    expires_at: Date;
}

interface ParticipantRow {
    id: string;
    nickname: string;
    role: ParticipantPublicSnapshot['role'];
    status: ParticipantPublicSnapshot['status'];
    preferences: unknown;
    pc_tier: ParticipantPublicSnapshot['pcTier'];
    joined_at: Date;
    updated_at: Date;
}

interface HistoryRow {
    game_id: string;
    disposition: RoomGameHistoryEntry['disposition'];
    created_by_participant_id: string;
    created_at: Date;
}

interface IdempotentRoomRow {
    roomId: string;
    requestHash: string | null;
}

interface SnapshotOptions {
    includePrivateProfiles?: boolean;
}

export interface CreatedRoomResult {
    room: RoomPublicSnapshot;
    inviteToken: string;
    created: boolean;
}

export interface JoinedRoomResult {
    room: RoomPublicSnapshot;
    joined: boolean;
}

export class PostgresRoomRepository {
    constructor(
        private readonly pool: Pool,
        private readonly config: ServerConfig,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly metrics: Metrics = noopMetrics
    ) {}

    async createRoom(options: {
        guestSessionId: string;
        hostNickname: string;
        regionCode: string;
        idempotencyKey?: string;
    }): Promise<CreatedRoomResult> {
        const requestHash = hashToken(
            JSON.stringify({ hostNickname: options.hostNickname, regionCode: options.regionCode }),
            this.config.tokenPepper
        );
        const inviteToken = options.idempotencyKey
            ? deriveToken(
                `invite:${options.guestSessionId}:${options.idempotencyKey}`,
                this.config.sessionSecret
            )
            : createOpaqueToken(32);

        if (options.idempotencyKey) {
            const existingRoom = await this.findIdempotentRoom(
                options.guestSessionId,
                options.idempotencyKey
            );
            if (existingRoom) {
                this.assertIdempotencyPayload(existingRoom.requestHash, requestHash);
                return {
                    room: await this.getSnapshotById(existingRoom.roomId, options.guestSessionId),
                    inviteToken,
                    created: false,
                };
            }
        }

        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const roomId = await this.createRoomTransaction({ ...options, inviteToken, requestHash });
                return {
                    room: await this.getSnapshotById(roomId, options.guestSessionId),
                    inviteToken,
                    created: true,
                };
            } catch (error) {
                if (this.isUniqueViolation(error) && options.idempotencyKey) {
                    const existingRoom = await this.findIdempotentRoom(
                        options.guestSessionId,
                        options.idempotencyKey
                    );
                    if (existingRoom) {
                        this.assertIdempotencyPayload(existingRoom.requestHash, requestHash);
                        return {
                            room: await this.getSnapshotById(existingRoom.roomId, options.guestSessionId),
                            inviteToken,
                            created: false,
                        };
                    }
                }

                if (!this.isUniqueViolation(error) || attempt === 4) {
                    throw error;
                }
            }
        }

        throw new AppError({
            status: 503,
            code: 'ROOM_CODE_UNAVAILABLE',
            title: 'Não foi possível criar a sala',
        });
    }

    async joinRoom(options: {
        code: string;
        guestSessionId: string;
        nickname: string;
        inviteToken?: string;
    }): Promise<JoinedRoomResult> {
        const client = await this.pool.connect();
        let roomId: string;
        try {
            await client.query('BEGIN');
            const roomResult = await client.query<RoomRow & { invite_token_hash: string }>(
                `SELECT id, code, status, version, region_code, constraints, prefilter_summary,
                        created_at, started_at, completed_at, expires_at, invite_token_hash
                   FROM rooms
                  WHERE code = $1
                  FOR UPDATE`,
                [this.normalizeRoomCode(options.code)]
            );
            const room = roomResult.rows[0];
            if (!room || room.expires_at <= this.clock.now()) {
                throw this.roomNotFoundError();
            }
            roomId = room.id;

            const existing = await client.query<{ id: string; status: 'CONFIGURING' | 'READY' | 'LEFT' }>(
                `SELECT id, status FROM room_participants
                  WHERE room_id = $1 AND guest_session_id = $2`,
                [room.id, options.guestSessionId]
            );
            if (existing.rowCount) {
                if (existing.rows[0]?.status === 'LEFT') {
                    throw this.roomNotFoundError();
                }
                await client.query('COMMIT');
                return {
                    room: await this.getSnapshotById(room.id, options.guestSessionId),
                    joined: false,
                };
            }

            // Validate the invite before exposing whether a room has already started.
            if (!options.inviteToken || !constantTimeEqual(
                hashToken(options.inviteToken, this.config.tokenPepper),
                room.invite_token_hash
            )) {
                throw this.roomNotFoundError();
            }

            if (room.status !== 'LOBBY') {
                throw new AppError({
                    status: 409,
                    code: 'ROOM_ALREADY_STARTED',
                    title: 'A sala já foi iniciada',
                });
            }

            const countResult = await client.query<{ count: string }>(
                `SELECT COUNT(*)::text AS count
                   FROM room_participants
                  WHERE room_id = $1 AND status <> 'LEFT'`,
                [room.id]
            );
            if (Number(countResult.rows[0]?.count ?? 0) >= this.config.maxRoomParticipants) {
                throw new AppError({
                    status: 409,
                    code: 'ROOM_FULL',
                    title: 'A sala está cheia',
                });
            }

            const now = this.clock.now();
            try {
                await client.query(
                    `INSERT INTO room_participants (
                        id, room_id, guest_session_id, nickname, nickname_normalized,
                        role, status, preferences, preferences_schema_version,
                        pc_tier, joined_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 'MEMBER', 'CONFIGURING', $6, 1, NULL, $7, $7)`,
                    [
                        randomUUID(),
                        room.id,
                        options.guestSessionId,
                        options.nickname,
                        this.normalizeNickname(options.nickname),
                        JSON.stringify(defaultParticipantPreferences),
                        now,
                    ]
                );
            } catch (error) {
                if (this.isUniqueViolation(error)) {
                    throw new AppError({
                        status: 409,
                        code: 'NICKNAME_ALREADY_USED',
                        title: 'Este apelido já está em uso na sala',
                    });
                }
                throw error;
            }

            const updatedRoom = await client.query<{ version: string }>(
                `UPDATE rooms SET version = version + 1, updated_at = $2 WHERE id = $1 RETURNING version`,
                [room.id, now]
            );
            await notifyRoomEvent(client, {
                roomId: room.id,
                roomCode: room.code,
                version: Number(updatedRoom.rows[0]?.version),
                eventType: 'PARTICIPANT_JOINED',
            }, this.metrics);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        return {
            room: await this.getSnapshotById(roomId, options.guestSessionId),
            joined: true,
        };
    }

    async getSnapshotByCode(
        code: string,
        guestSessionId: string,
        options: SnapshotOptions = {}
    ): Promise<RoomPublicSnapshot> {
        const result = await this.pool.query<{ id: string }>(
            `SELECT r.id
               FROM rooms r
               JOIN room_participants p ON p.room_id = r.id
                AND p.status <> 'LEFT'
              WHERE r.code = $1
                AND p.guest_session_id = $2`,
            [this.normalizeRoomCode(code), guestSessionId]
        );
        const roomId = result.rows[0]?.id;
        if (!roomId) {
            throw this.roomNotFoundError();
        }
        return this.getSnapshotById(roomId, guestSessionId, options);
    }

    async getSnapshotById(
        roomId: string,
        guestSessionId: string,
        options: SnapshotOptions = {}
    ): Promise<RoomPublicSnapshot> {
        const roomResult = await this.pool.query<RoomRow & { current_participant_id: string }>(
            `SELECT r.id, r.code, r.status, r.version, r.region_code, r.constraints,
                    r.prefilter_summary, r.created_at, r.started_at, r.completed_at,
                    r.expires_at, current_participant.id AS current_participant_id
               FROM rooms r
               JOIN room_participants current_participant
                 ON current_participant.room_id = r.id
                AND current_participant.guest_session_id = $2
                AND current_participant.status <> 'LEFT'
              WHERE r.id = $1`,
            [roomId, guestSessionId]
        );
        const room = roomResult.rows[0];
        if (!room) {
            throw this.roomNotFoundError();
        }
        if (room.expires_at <= this.clock.now() || room.status === 'EXPIRED') {
            throw new AppError({
                status: 410,
                code: 'ROOM_EXPIRED',
                title: 'Esta sala expirou',
            });
        }

        const [participantsResult, platformsResult, subscriptionsResult, ownedGamesResult, historyResult, decisionResult] =
            await Promise.all([
                this.pool.query<ParticipantRow>(
                    `SELECT id, nickname, role, status, preferences, pc_tier, joined_at, updated_at
                       FROM room_participants
                      WHERE room_id = $1
                      ORDER BY joined_at ASC`,
                    [roomId]
                ),
                this.pool.query<{ participant_id: string; platform_code: string }>(
                    `SELECT pp.participant_id, pp.platform_code
                       FROM participant_platforms pp
                       JOIN room_participants p ON p.id = pp.participant_id
                      WHERE p.room_id = $1
                      ORDER BY pp.participant_id, pp.platform_code`,
                    [roomId]
                ),
                this.pool.query<{ participant_id: string; code: string }>(
                    `SELECT ps.participant_id, sp.code
                       FROM participant_subscriptions ps
                       JOIN subscription_plans sp ON sp.id = ps.subscription_plan_id
                       JOIN room_participants p ON p.id = ps.participant_id
                      WHERE p.room_id = $1
                      ORDER BY ps.participant_id, sp.code`,
                    [roomId]
                ),
                this.pool.query<{ participant_id: string; game_id: string; platform_code: string | null }>(
                    `SELECT pog.participant_id, pog.game_id, pog.platform_code
                       FROM participant_owned_games pog
                       JOIN room_participants p ON p.id = pog.participant_id
                      WHERE p.room_id = $1
                      ORDER BY pog.participant_id, pog.game_id, pog.platform_code NULLS FIRST`,
                    [roomId]
                ),
                this.pool.query<HistoryRow>(
                    `SELECT game_id, disposition, created_by_participant_id, created_at
                       FROM room_game_history
                      WHERE room_id = $1
                      ORDER BY created_at ASC, game_id ASC`,
                    [roomId]
                ),
                this.pool.query<{
                    game_id: string;
                    selected_by_participant_id: string;
                    created_at: Date;
                }>(
                    `SELECT game_id, selected_by_participant_id, created_at
                       FROM room_decisions WHERE room_id = $1`,
                    [roomId]
                ),
            ]);

        const platformsByParticipant = new Map<string, ParticipantPublicSnapshot['platforms']>();
        for (const platform of platformsResult.rows) {
            const current = platformsByParticipant.get(platform.participant_id) ?? [];
            current.push(platformCodeSchema.parse(platform.platform_code));
            platformsByParticipant.set(platform.participant_id, current);
        }
        const subscriptionsByParticipant = this.groupRows(subscriptionsResult.rows, 'participant_id', 'code');
        const ownedByParticipant = new Map<string, ParticipantPublicSnapshot['ownedGames']>();
        for (const owned of ownedGamesResult.rows) {
            const current = ownedByParticipant.get(owned.participant_id) ?? [];
            current.push({
                gameId: owned.game_id,
                platformCode: owned.platform_code ? platformCodeSchema.parse(owned.platform_code) : null,
            });
            ownedByParticipant.set(owned.participant_id, current);
        }

        const participants = participantsResult.rows.map((participant): ParticipantPublicSnapshot => {
            const canViewPrivateProfile = options.includePrivateProfiles === true
                || participant.id === room.current_participant_id;
            return {
                id: participant.id,
                nickname: participant.nickname,
                role: participant.role,
                status: participant.status,
                platforms: platformsByParticipant.get(participant.id) ?? [],
                subscriptions: canViewPrivateProfile
                    ? subscriptionsByParticipant.get(participant.id) ?? []
                    : [],
                ownedGames: canViewPrivateProfile
                    ? ownedByParticipant.get(participant.id) ?? []
                    : [],
                pcTier: canViewPrivateProfile ? participant.pc_tier : null,
                preferences: canViewPrivateProfile
                    ? participantPreferencesSchema.parse(participant.preferences)
                    : participantPreferencesSchema.parse(defaultParticipantPreferences),
                joinedAt: participant.joined_at.toISOString(),
                updatedAt: participant.updated_at.toISOString(),
            };
        });

        const history = await Promise.all(historyResult.rows.map(async (entry): Promise<RoomGameHistoryEntry> => {
            const game = await this.catalog.getGameById(entry.game_id, 'pt');
            return {
                gameId: entry.game_id,
                title: game?.title ?? entry.game_id,
                disposition: entry.disposition,
                createdByParticipantId: entry.created_by_participant_id,
                createdAt: entry.created_at.toISOString(),
            };
        }));
        const decision = decisionResult.rows[0];

        return {
            id: room.id,
            code: room.code,
            status: room.status,
            version: Number(room.version),
            regionCode: room.region_code,
            constraints: roomConstraintsSchema.parse(room.constraints),
            currentParticipantId: room.current_participant_id,
            participants,
            history,
            prefilterSummary: room.prefilter_summary
                ? prefilterSummarySchema.parse(room.prefilter_summary)
                : null,
            decision: decision
                ? {
                    gameId: decision.game_id,
                    selectedByParticipantId: decision.selected_by_participant_id,
                    createdAt: decision.created_at.toISOString(),
                }
                : null,
            createdAt: room.created_at.toISOString(),
            startedAt: room.started_at?.toISOString() ?? null,
            completedAt: room.completed_at?.toISOString() ?? null,
            expiresAt: room.expires_at.toISOString(),
        };
    }

    private async createRoomTransaction(options: {
        guestSessionId: string;
        hostNickname: string;
        regionCode: string;
        idempotencyKey?: string;
        inviteToken: string;
        requestHash: string;
    }): Promise<string> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const roomId = randomUUID();
            const now = this.clock.now();
            const expiresAt = new Date(now.getTime() + this.config.roomTtlHours * 60 * 60 * 1000);

            if (options.idempotencyKey) {
                await client.query(
                    `DELETE FROM idempotency_keys
                      WHERE guest_session_id = $1
                        AND operation = 'CREATE_ROOM'
                        AND key_hash = $2
                        AND expires_at <= $3`,
                    [options.guestSessionId, hashToken(options.idempotencyKey, this.config.tokenPepper), now]
                );
                await client.query(
                    `INSERT INTO idempotency_keys (
                        id, guest_session_id, operation, key_hash, response_status,
                        response_body, created_at, expires_at
                    ) VALUES ($1, $2, 'CREATE_ROOM', $3, 201, $4, $5, $6)`,
                    [
                        randomUUID(),
                        options.guestSessionId,
                        hashToken(options.idempotencyKey, this.config.tokenPepper),
                        JSON.stringify({ roomId, requestHash: options.requestHash }),
                        now,
                        expiresAt,
                    ]
                );
            }

            await client.query(
                `INSERT INTO rooms (
                    id, code, host_guest_session_id, status, version, region_code,
                    constraints, constraints_schema_version, invite_token_hash,
                    created_at, updated_at, expires_at
                ) VALUES ($1, $2, $3, 'LOBBY', 1, $4, $5, 1, $6, $7, $7, $8)`,
                [
                    roomId,
                    this.generateRoomCode(),
                    options.guestSessionId,
                    options.regionCode,
                    JSON.stringify({ ...defaultRoomConstraints, regionCode: options.regionCode }),
                    hashToken(options.inviteToken, this.config.tokenPepper),
                    now,
                    expiresAt,
                ]
            );
            await this.insertHostParticipant(client, roomId, options.guestSessionId, options.hostNickname, now);
            await client.query('COMMIT');
            return roomId;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async insertHostParticipant(
        client: PoolClient,
        roomId: string,
        guestSessionId: string,
        nickname: string,
        now: Date
    ): Promise<void> {
        await client.query(
            `INSERT INTO room_participants (
                id, room_id, guest_session_id, nickname, nickname_normalized,
                role, status, preferences, preferences_schema_version,
                pc_tier, joined_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'HOST', 'CONFIGURING', $6, 1, NULL, $7, $7)`,
            [
                randomUUID(),
                roomId,
                guestSessionId,
                nickname,
                this.normalizeNickname(nickname),
                JSON.stringify(defaultParticipantPreferences),
                now,
            ]
        );
    }

    private async findIdempotentRoom(guestSessionId: string, key: string): Promise<IdempotentRoomRow | null> {
        const result = await this.pool.query<{ room_id: string | null; request_hash: string | null }>(
            `SELECT response_body->>'roomId' AS room_id,
                    response_body->>'requestHash' AS request_hash
               FROM idempotency_keys
              WHERE guest_session_id = $1
                AND operation = 'CREATE_ROOM'
                AND key_hash = $2
                AND expires_at > $3`,
            [guestSessionId, hashToken(key, this.config.tokenPepper), this.clock.now()]
        );
        const row = result.rows[0];
        return row?.room_id ? { roomId: row.room_id, requestHash: row.request_hash } : null;
    }

    private assertIdempotencyPayload(existingHash: string | null, requestHash: string): void {
        if (!existingHash || existingHash !== requestHash) {
            throw new AppError({
                status: 409,
                code: 'IDEMPOTENCY_KEY_REUSED',
                title: 'A chave de idempotência já foi usada com outro payload',
            });
        }
    }

    private groupRows<Row extends Record<Key | Value, string>, Key extends keyof Row, Value extends keyof Row>(
        rows: Row[],
        key: Key,
        value: Value
    ): Map<string, string[]> {
        const result = new Map<string, string[]>();
        for (const row of rows) {
            const groupKey = row[key];
            const current = result.get(groupKey) ?? [];
            current.push(row[value]);
            result.set(groupKey, current);
        }
        return result;
    }

    private generateRoomCode(): string {
        return Array.from({ length: ROOM_CODE_LENGTH }, () => (
            ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
        )).join('');
    }

    private normalizeRoomCode(code: string): string {
        return code.trim().toUpperCase();
    }

    private normalizeNickname(nickname: string): string {
        return nickname.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    }

    private isUniqueViolation(error: unknown): boolean {
        return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
    }

    private roomNotFoundError(): AppError {
        return new AppError({
            status: 404,
            code: 'ROOM_NOT_FOUND',
            title: 'Sala não encontrada',
        });
    }
}
