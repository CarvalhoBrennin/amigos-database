import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
    AdminDashboard,
    AdminRole,
    AdminUser,
} from '../../../../shared/contracts/admin.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { notifyRoomEvent } from '../../infrastructure/realtime/room-event-notifier.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';
import { purgeExpiredData } from '../retention/purge-expired-data.js';
import type { AdminAuditService } from './admin-audit-service.js';

interface PageOptions {
    page: number;
    pageSize: number;
}

interface AdminUserRow {
    id: string;
    email: string;
    display_name: string;
    role: AdminRole;
    active: boolean;
    locked_until: Date | null;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

interface AdminUserWithPasswordRow extends AdminUserRow {
    password_hash: string;
}

export class AdminOperationsService {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly audit: AdminAuditService
    ) {}

    async dashboard(): Promise<AdminDashboard> {
        const now = this.clock.now();
        const [rooms, participants, sessions, profiles, stale, catalogIds] = await Promise.all([
            this.pool.query<{
                total: number;
                active: number;
                lobby: number;
                matching: number;
                completed: number;
                expired_pending_purge: number;
            }>(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE expires_at > $1 AND status NOT IN ('CANCELLED','EXPIRED'))::int AS active,
                        COUNT(*) FILTER (WHERE status = 'LOBBY')::int AS lobby,
                        COUNT(*) FILTER (WHERE status = 'MATCHING')::int AS matching,
                        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
                        COUNT(*) FILTER (WHERE expires_at <= $1)::int AS expired_pending_purge
                   FROM rooms`,
                [now]
            ),
            this.pool.query<{ total: number; active: number }>(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE status <> 'LEFT')::int AS active
                   FROM room_participants`
            ),
            this.pool.query<{ guest_active: number; admin_active: number }>(
                `SELECT
                    (SELECT COUNT(*)::int FROM guest_sessions WHERE expires_at > $1) AS guest_active,
                    (SELECT COUNT(*)::int FROM admin_sessions WHERE expires_at > $1 AND revoked_at IS NULL) AS admin_active`,
                [now]
            ),
            this.pool.query<{ complete: number; partial: number; unknown: number; total: number }>(
                `SELECT COUNT(*) FILTER (WHERE data_status = 'COMPLETE')::int AS complete,
                        COUNT(*) FILTER (WHERE data_status = 'PARTIAL')::int AS partial,
                        COUNT(*) FILTER (WHERE data_status = 'UNKNOWN')::int AS unknown,
                        COUNT(*)::int AS total
                   FROM game_decision_profiles`
            ),
            this.pool.query<{ count: number }>(
                `SELECT (
                    (SELECT COUNT(*) FROM game_platform_offerings WHERE verification_status = 'STALE' OR valid_until < $1) +
                    (SELECT COUNT(*) FROM game_network_pools WHERE verification_status = 'STALE' OR valid_until < $1) +
                    (SELECT COUNT(*) FROM game_subscription_availability WHERE verification_status = 'STALE' OR valid_until < $1) +
                    (SELECT COUNT(*) FROM game_prices WHERE valid_until < $1)
                )::int AS count`,
                [now]
            ),
            this.catalog.listGameIds(),
        ]);
        const room = rooms.rows[0];
        const participant = participants.rows[0];
        const session = sessions.rows[0];
        const profile = profiles.rows[0];
        const catalogGames = catalogIds.length;
        return {
            rooms: {
                total: room?.total ?? 0,
                active: room?.active ?? 0,
                lobby: room?.lobby ?? 0,
                matching: room?.matching ?? 0,
                completed: room?.completed ?? 0,
                expiredPendingPurge: room?.expired_pending_purge ?? 0,
            },
            participants: {
                total: participant?.total ?? 0,
                active: participant?.active ?? 0,
            },
            sessions: {
                guestActive: session?.guest_active ?? 0,
                adminActive: session?.admin_active ?? 0,
            },
            decisionData: {
                catalogGames,
                complete: profile?.complete ?? 0,
                partial: profile?.partial ?? 0,
                unknown: profile?.unknown ?? 0,
                missing: Math.max(0, catalogGames - (profile?.total ?? 0)),
                staleRecords: stale.rows[0]?.count ?? 0,
            },
            generatedAt: now.toISOString(),
        };
    }

    async listUsers(options: PageOptions & { search?: string; role?: AdminRole; active?: boolean }) {
        const conditions: string[] = [];
        const values: unknown[] = [];
        if (options.search) {
            values.push(`%${escapeLike(options.search.trim().toLowerCase())}%`);
            conditions.push(`(email LIKE $${values.length} ESCAPE '\\' OR lower(display_name) LIKE $${values.length} ESCAPE '\\')`);
        }
        if (options.role) {
            values.push(options.role);
            conditions.push(`role = $${values.length}`);
        }
        if (options.active !== undefined) {
            values.push(options.active);
            conditions.push(`active = $${values.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const totalResult = await this.pool.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM admin_users ${where}`,
            values
        );
        values.push(options.pageSize, (options.page - 1) * options.pageSize);
        const result = await this.pool.query<AdminUserRow>(
            `SELECT id, email, display_name, role, active, locked_until,
                    last_login_at, created_at, updated_at
               FROM admin_users ${where}
              ORDER BY created_at DESC, id
              LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values
        );
        const total = totalResult.rows[0]?.total ?? 0;
        return { users: result.rows.map(toPublicUser), meta: pageMeta(options, total) };
    }

    async createUser(options: {
        email: string;
        displayName: string;
        password: string;
        role: AdminRole;
        actorId: string;
        requestId: string;
    }): Promise<AdminUser> {
        const now = this.clock.now();
        const id = randomUUID();
        const passwordHash = await hashPassword(options.password);
        try {
            const result = await withTransaction(this.pool, async (client) => {
                const inserted = await client.query<AdminUserRow>(
                `INSERT INTO admin_users (
                    id, email, display_name, password_hash, role, active,
                    failed_login_attempts, locked_until, password_changed_at,
                    last_login_at, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,TRUE,0,NULL,$6,NULL,$6,$6)
                RETURNING id, email, display_name, role, active, locked_until,
                          last_login_at, created_at, updated_at`,
                [id, options.email.trim().toLowerCase(), options.displayName.trim(), passwordHash, options.role, now]
                );
                await this.audit.record({
                    adminUserId: options.actorId,
                    action: 'ADMIN_USER_CREATED',
                    entityType: 'ADMIN_USER',
                    entityId: id,
                    requestId: options.requestId,
                    metadata: { role: options.role },
                }, client);
                return inserted.rows[0] as AdminUserRow;
            });
            return toPublicUser(result);
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new AppError({ status: 409, code: 'ADMIN_EMAIL_IN_USE', title: 'Este e-mail já está em uso' });
            }
            throw error;
        }
    }

    async updateUser(options: {
        userId: string;
        displayName?: string;
        role?: AdminRole;
        active?: boolean;
        newPassword?: string;
        actorId: string;
        requestId: string;
    }): Promise<AdminUser> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const currentResult = await client.query<AdminUserWithPasswordRow>(
                `SELECT id, email, display_name, password_hash, role, active, locked_until,
                        last_login_at, created_at, updated_at
                   FROM admin_users WHERE id = $1 FOR UPDATE`,
                [options.userId]
            );
            const current = currentResult.rows[0];
            if (!current) throw new AppError({ status: 404, code: 'ADMIN_USER_NOT_FOUND', title: 'Administrador não encontrado' });
            const nextRole = options.role ?? current.role;
            const nextActive = options.active ?? current.active;
            if (current.role === 'SUPER_ADMIN' && current.active
                && (nextRole !== 'SUPER_ADMIN' || !nextActive)) {
                const superAdmins = await client.query<{ id: string }>(
                    `SELECT id FROM admin_users
                      WHERE role = 'SUPER_ADMIN' AND active = TRUE FOR UPDATE`
                );
                if (superAdmins.rows.length <= 1) {
                    throw new AppError({
                        status: 409,
                        code: 'LAST_SUPER_ADMIN_REQUIRED',
                        title: 'O último super administrador não pode ser desativado ou rebaixado',
                    });
                }
            }
            const passwordHash = options.newPassword
                ? await hashPassword(options.newPassword)
                : current.password_hash;
            const now = this.clock.now();
            const result = await client.query<AdminUserRow>(
                `UPDATE admin_users
                    SET display_name = $2, role = $3, active = $4, password_hash = $5,
                        password_changed_at = CASE WHEN $6 THEN $7 ELSE password_changed_at END,
                        failed_login_attempts = CASE WHEN $6 OR $4 THEN 0 ELSE failed_login_attempts END,
                        locked_until = CASE WHEN $6 OR $4 THEN NULL ELSE locked_until END,
                        updated_at = $7
                  WHERE id = $1
                  RETURNING id, email, display_name, role, active, locked_until,
                            last_login_at, created_at, updated_at`,
                [
                    current.id,
                    options.displayName?.trim() ?? current.display_name,
                    nextRole,
                    nextActive,
                    passwordHash,
                    Boolean(options.newPassword),
                    now,
                ]
            );
            if (options.newPassword || !nextActive) {
                await client.query(
                    'UPDATE admin_sessions SET revoked_at = $2 WHERE admin_user_id = $1 AND revoked_at IS NULL',
                    [current.id, now]
                );
            }
            await this.audit.record({
                adminUserId: options.actorId,
                action: 'ADMIN_USER_UPDATED',
                entityType: 'ADMIN_USER',
                entityId: current.id,
                requestId: options.requestId,
                metadata: {
                    roleChanged: nextRole !== current.role,
                    activeChanged: nextActive !== current.active,
                    passwordChanged: Boolean(options.newPassword),
                },
            }, client);
            await client.query('COMMIT');
            return toPublicUser(result.rows[0] as AdminUserRow);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async changeOwnPassword(options: {
        userId: string;
        currentPassword: string;
        newPassword: string;
        requestId: string;
    }): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query<{ password_hash: string }>(
                'SELECT password_hash FROM admin_users WHERE id = $1 AND active = TRUE FOR UPDATE',
                [options.userId]
            );
            const row = result.rows[0];
            if (!row || !await verifyPassword(options.currentPassword, row.password_hash)) {
                throw new AppError({ status: 401, code: 'ADMIN_PASSWORD_INVALID', title: 'A senha atual está incorreta' });
            }
            if (await verifyPassword(options.newPassword, row.password_hash)) {
                throw new AppError({ status: 400, code: 'ADMIN_PASSWORD_UNCHANGED', title: 'A nova senha precisa ser diferente da atual' });
            }
            const now = this.clock.now();
            await client.query(
                `UPDATE admin_users SET password_hash = $2, password_changed_at = $3,
                        failed_login_attempts = 0, locked_until = NULL, updated_at = $3
                  WHERE id = $1`,
                [options.userId, await hashPassword(options.newPassword), now]
            );
            await client.query(
                'UPDATE admin_sessions SET revoked_at = $2 WHERE admin_user_id = $1 AND revoked_at IS NULL',
                [options.userId, now]
            );
            await this.audit.record({
                adminUserId: options.userId,
                action: 'ADMIN_PASSWORD_CHANGED',
                entityType: 'ADMIN_USER',
                entityId: options.userId,
                requestId: options.requestId,
            }, client);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listRooms(options: PageOptions & { search?: string; status?: string }) {
        const values: unknown[] = [];
        const conditions: string[] = [];
        if (options.search) {
            values.push(`%${escapeLike(options.search.trim().toLowerCase())}%`);
            conditions.push(`(lower(r.code) LIKE $${values.length} ESCAPE '\\' OR EXISTS (
                SELECT 1 FROM room_participants search_participant
                 WHERE search_participant.room_id = r.id
                   AND lower(search_participant.nickname) LIKE $${values.length} ESCAPE '\\'
            ))`);
        }
        if (options.status) {
            values.push(options.status);
            conditions.push(`r.status = $${values.length}`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const count = await this.pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM rooms r ${where}`, values);
        values.push(options.pageSize, (options.page - 1) * options.pageSize);
        const result = await this.pool.query<{
            id: string;
            code: string;
            status: string;
            version: string;
            region_code: string;
            participant_count: number;
            ready_count: number;
            candidate_count: number;
            vote_count: number;
            match_count: number;
            decision_game_id: string | null;
            created_at: Date;
            updated_at: Date;
            expires_at: Date;
        }>(
            `SELECT r.id, r.code, r.status, r.version, r.region_code,
                    (SELECT COUNT(*)::int FROM room_participants p WHERE p.room_id = r.id AND p.status <> 'LEFT') AS participant_count,
                    (SELECT COUNT(*)::int FROM room_participants p WHERE p.room_id = r.id AND p.status = 'READY') AS ready_count,
                    (SELECT COUNT(*)::int FROM room_candidates c WHERE c.room_id = r.id) AS candidate_count,
                    (SELECT COUNT(*)::int FROM room_votes v WHERE v.room_id = r.id) AS vote_count,
                    (SELECT COUNT(*)::int FROM room_matches m WHERE m.room_id = r.id) AS match_count,
                    (SELECT d.game_id FROM room_decisions d WHERE d.room_id = r.id) AS decision_game_id,
                    r.created_at, r.updated_at, r.expires_at
               FROM rooms r ${where}
              ORDER BY r.created_at DESC, r.id
              LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values
        );
        const total = count.rows[0]?.total ?? 0;
        return {
            rooms: result.rows.map(mapRoomListItem),
            meta: pageMeta(options, total),
        };
    }

    async getRoom(roomId: string) {
        const roomResult = await this.pool.query<{
            id: string;
            code: string;
            status: string;
            version: string;
            region_code: string;
            constraints: Record<string, unknown>;
            prefilter_summary: Record<string, unknown> | null;
            participant_count: number;
            ready_count: number;
            candidate_count: number;
            vote_count: number;
            match_count: number;
            history_count: number;
            decision_game_id: string | null;
            selected_by_participant_id: string | null;
            decision_created_at: Date | null;
            created_at: Date;
            updated_at: Date;
            started_at: Date | null;
            completed_at: Date | null;
            expires_at: Date;
        }>(
            `SELECT r.id, r.code, r.status, r.version, r.region_code, r.constraints,
                    r.prefilter_summary, r.created_at, r.updated_at, r.started_at,
                    r.completed_at, r.expires_at,
                    (SELECT COUNT(*)::int FROM room_participants p WHERE p.room_id = r.id AND p.status <> 'LEFT') AS participant_count,
                    (SELECT COUNT(*)::int FROM room_participants p WHERE p.room_id = r.id AND p.status = 'READY') AS ready_count,
                    (SELECT COUNT(*)::int FROM room_candidates c WHERE c.room_id = r.id) AS candidate_count,
                    (SELECT COUNT(*)::int FROM room_votes v WHERE v.room_id = r.id) AS vote_count,
                    (SELECT COUNT(*)::int FROM room_matches m WHERE m.room_id = r.id) AS match_count,
                    (SELECT COUNT(*)::int FROM room_game_history h WHERE h.room_id = r.id) AS history_count,
                    d.game_id AS decision_game_id, d.selected_by_participant_id, d.created_at AS decision_created_at
               FROM rooms r
               LEFT JOIN room_decisions d ON d.room_id = r.id
              WHERE r.id = $1`,
            [roomId]
        );
        const room = roomResult.rows[0];
        if (!room) throw new AppError({ status: 404, code: 'ADMIN_ROOM_NOT_FOUND', title: 'Sala não encontrada' });
        const participants = await this.pool.query<{
            id: string;
            nickname: string;
            role: 'HOST' | 'MEMBER';
            status: 'CONFIGURING' | 'READY' | 'LEFT';
            platforms: string[];
            subscriptions: string[];
            owned_games_count: number;
            joined_at: Date;
            updated_at: Date;
        }>(
            `SELECT p.id, p.nickname, p.role, p.status, p.joined_at, p.updated_at,
                    COALESCE(array_agg(DISTINCT pp.platform_code) FILTER (WHERE pp.platform_code IS NOT NULL), '{}') AS platforms,
                    COALESCE(array_agg(DISTINCT sp.code) FILTER (WHERE sp.code IS NOT NULL), '{}') AS subscriptions,
                    COUNT(DISTINCT owned.id)::int AS owned_games_count
               FROM room_participants p
               LEFT JOIN participant_platforms pp ON pp.participant_id = p.id
               LEFT JOIN participant_subscriptions ps ON ps.participant_id = p.id
               LEFT JOIN subscription_plans sp ON sp.id = ps.subscription_plan_id
               LEFT JOIN participant_owned_games owned ON owned.participant_id = p.id
              WHERE p.room_id = $1
              GROUP BY p.id
              ORDER BY p.joined_at, p.id`,
            [roomId]
        );
        return {
            ...mapRoomListItem(room),
            constraints: room.constraints,
            prefilterSummary: room.prefilter_summary,
            participants: participants.rows.map((participant) => ({
                id: participant.id,
                nickname: participant.nickname,
                role: participant.role,
                status: participant.status,
                platforms: participant.platforms,
                subscriptions: participant.subscriptions,
                ownedGamesCount: participant.owned_games_count,
                joinedAt: participant.joined_at.toISOString(),
                updatedAt: participant.updated_at.toISOString(),
            })),
            historyCount: room.history_count,
            decision: room.decision_game_id && room.selected_by_participant_id && room.decision_created_at
                ? {
                    gameId: room.decision_game_id,
                    selectedByParticipantId: room.selected_by_participant_id,
                    createdAt: room.decision_created_at.toISOString(),
                }
                : null,
            startedAt: room.started_at?.toISOString() ?? null,
            completedAt: room.completed_at?.toISOString() ?? null,
        };
    }

    async updateRoom(options: {
        roomId: string;
        action: 'CANCEL' | 'EXPIRE' | 'EXTEND';
        extendHours?: number;
        actorId: string;
        requestId: string;
    }) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const current = await client.query<{ code: string; status: string; expires_at: Date }>(
                'SELECT code, status, expires_at FROM rooms WHERE id = $1 FOR UPDATE',
                [options.roomId]
            );
            const room = current.rows[0];
            if (!room) throw new AppError({ status: 404, code: 'ADMIN_ROOM_NOT_FOUND', title: 'Sala não encontrada' });
            const now = this.clock.now();
            let version: number;
            let eventType: 'ROOM_CANCELLED' | 'ROOM_EXPIRED' | 'ROOM_EXPIRY_CHANGED';
            if (options.action === 'CANCEL') {
                if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(room.status)) {
                    throw new AppError({ status: 409, code: 'ADMIN_ROOM_NOT_CANCELLABLE', title: 'Esta sala já está em um estado terminal' });
                }
                const updated = await client.query<{ version: string }>(
                    `UPDATE rooms SET status = 'CANCELLED', version = version + 1, updated_at = $2
                      WHERE id = $1 RETURNING version`,
                    [options.roomId, now]
                );
                version = Number(updated.rows[0]?.version);
                eventType = 'ROOM_CANCELLED';
            } else if (options.action === 'EXPIRE') {
                if (['EXPIRED', 'CANCELLED'].includes(room.status)) {
                    throw new AppError({ status: 409, code: 'ADMIN_ROOM_NOT_EXPIRABLE', title: 'Esta sala já está expirada ou cancelada' });
                }
                const updated = await client.query<{ version: string }>(
                    `UPDATE rooms SET status = 'EXPIRED', expires_at = $2,
                            version = version + 1, updated_at = $2 WHERE id = $1
                      RETURNING version`,
                    [options.roomId, now]
                );
                version = Number(updated.rows[0]?.version);
                eventType = 'ROOM_EXPIRED';
            } else {
                if (['EXPIRED', 'CANCELLED'].includes(room.status)) {
                    throw new AppError({
                        status: 409,
                        code: 'ADMIN_ROOM_NOT_EXTENDABLE',
                        title: 'Uma sala expirada ou cancelada não pode ser reativada',
                    });
                }
                const base = room.expires_at > now ? room.expires_at : now;
                const expiresAt = new Date(base.getTime() + (options.extendHours as number) * 60 * 60 * 1_000);
                const updated = await client.query<{ version: string }>(
                    `UPDATE rooms SET expires_at = $2,
                            version = version + 1, updated_at = $3 WHERE id = $1
                      RETURNING version`,
                    [options.roomId, expiresAt, now]
                );
                version = Number(updated.rows[0]?.version);
                eventType = 'ROOM_EXPIRY_CHANGED';
            }
            await this.audit.record({
                adminUserId: options.actorId,
                action: options.action === 'CANCEL'
                    ? 'ROOM_CANCELLED'
                    : options.action === 'EXPIRE'
                        ? 'ROOM_EXPIRED'
                        : 'ROOM_EXTENDED',
                entityType: 'ROOM',
                entityId: options.roomId,
                requestId: options.requestId,
                metadata: { code: room.code, extendHours: options.extendHours ?? null },
            }, client);
            await notifyRoomEvent(client, {
                roomId: options.roomId,
                roomCode: room.code,
                version,
                eventType,
            });
            await client.query('COMMIT');
            return this.getRoom(options.roomId);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deleteRoom(options: { roomId: string; confirmationCode: string; actorId: string; requestId: string }): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const room = await client.query<{ code: string; version: string }>('SELECT code, version FROM rooms WHERE id = $1 FOR UPDATE', [options.roomId]);
            const current = room.rows[0];
            const code = current?.code;
            if (!code || !current) throw new AppError({ status: 404, code: 'ADMIN_ROOM_NOT_FOUND', title: 'Sala não encontrada' });
            if (code !== options.confirmationCode.trim().toUpperCase()) {
                throw new AppError({ status: 400, code: 'ADMIN_CONFIRMATION_MISMATCH', title: 'O código de confirmação não confere' });
            }
            await client.query('DELETE FROM rooms WHERE id = $1', [options.roomId]);
            await this.audit.record({
                adminUserId: options.actorId,
                action: 'ROOM_DELETED',
                entityType: 'ROOM',
                entityId: options.roomId,
                requestId: options.requestId,
                metadata: { code },
            }, client);
            await notifyRoomEvent(client, {
                roomId: options.roomId,
                roomCode: code,
                version: Number(current.version) + 1,
                eventType: 'ROOM_DELETED',
            });
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listGuestSessions(options: PageOptions & { search?: string }) {
        const values: unknown[] = [this.clock.now()];
        const where = options.search
            ? (() => {
                values.push(`${options.search.trim().toLowerCase()}%`);
                return `WHERE lower(s.id::text) LIKE $2`;
            })()
            : '';
        const count = await this.pool.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM guest_sessions s ${options.search ? 'WHERE lower(s.id::text) LIKE $1' : ''}`,
            options.search ? [values[1]] : []
        );
        values.push(options.pageSize, (options.page - 1) * options.pageSize);
        const sessions = await this.pool.query<{
            id: string;
            active_room_count: number;
            created_at: Date;
            last_seen_at: Date;
            expires_at: Date;
        }>(
            `SELECT s.id,
                    COUNT(DISTINCT p.room_id) FILTER (WHERE r.expires_at > $1 AND p.status <> 'LEFT')::int AS active_room_count,
                    s.created_at, s.last_seen_at, s.expires_at
               FROM guest_sessions s
               LEFT JOIN room_participants p ON p.guest_session_id = s.id
               LEFT JOIN rooms r ON r.id = p.room_id
               ${where}
              GROUP BY s.id
              ORDER BY s.created_at DESC, s.id
              LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values
        );
        const total = count.rows[0]?.total ?? 0;
        return {
            sessions: sessions.rows.map((session) => ({
                id: session.id,
                activeRoomCount: session.active_room_count,
                createdAt: session.created_at.toISOString(),
                lastSeenAt: session.last_seen_at.toISOString(),
                expiresAt: session.expires_at.toISOString(),
            })),
            meta: pageMeta(options, total),
        };
    }

    async revokeGuestSession(options: { sessionId: string; actorId: string; requestId: string }): Promise<void> {
        await withTransaction(this.pool, async (client) => {
            const result = await client.query(
                'UPDATE guest_sessions SET expires_at = $2 WHERE id = $1 RETURNING id',
                [options.sessionId, this.clock.now()]
            );
            if (result.rowCount === 0) throw new AppError({ status: 404, code: 'ADMIN_SESSION_NOT_FOUND', title: 'Sessão não encontrada' });
            await this.audit.record({
                adminUserId: options.actorId,
                action: 'GUEST_SESSION_REVOKED',
                entityType: 'GUEST_SESSION',
                entityId: options.sessionId,
                requestId: options.requestId,
            }, client);
        });
    }

    async listAdminSessions(options: PageOptions & {
        search?: string;
        actorId: string;
        currentSessionId: string;
        canManageAll: boolean;
    }) {
        const values: unknown[] = [];
        const conditions: string[] = [];
        if (!options.canManageAll) {
            values.push(options.actorId);
            conditions.push(`s.admin_user_id = $${values.length}`);
        }
        if (options.search) {
            values.push(`%${escapeLike(options.search.trim().toLowerCase())}%`);
            conditions.push(`(lower(s.id::text) LIKE $${values.length} ESCAPE '\\'
                OR lower(u.email) LIKE $${values.length} ESCAPE '\\'
                OR lower(u.display_name) LIKE $${values.length} ESCAPE '\\')`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const count = await this.pool.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total
               FROM admin_sessions s
               JOIN admin_users u ON u.id = s.admin_user_id
               ${where}`,
            values
        );
        values.push(options.pageSize, (options.page - 1) * options.pageSize);
        const result = await this.pool.query<{
            id: string;
            admin_user_id: string;
            email: string;
            display_name: string;
            role: AdminRole;
            created_at: Date;
            last_seen_at: Date;
            expires_at: Date;
            revoked_at: Date | null;
        }>(
            `SELECT s.id, s.admin_user_id, u.email, u.display_name, u.role,
                    s.created_at, s.last_seen_at, s.expires_at, s.revoked_at
               FROM admin_sessions s
               JOIN admin_users u ON u.id = s.admin_user_id
               ${where}
              ORDER BY (s.id = $${values.length + 1}) DESC, s.created_at DESC, s.id
              LIMIT $${values.length - 1} OFFSET $${values.length}`,
            [...values, options.currentSessionId]
        );
        const total = count.rows[0]?.total ?? 0;
        return {
            sessions: result.rows.map((session) => ({
                id: session.id,
                user: {
                    id: session.admin_user_id,
                    email: session.email,
                    displayName: session.display_name,
                    role: session.role,
                },
                current: session.id === options.currentSessionId,
                createdAt: session.created_at.toISOString(),
                lastSeenAt: session.last_seen_at.toISOString(),
                expiresAt: session.expires_at.toISOString(),
                revokedAt: session.revoked_at?.toISOString() ?? null,
            })),
            meta: pageMeta(options, total),
        };
    }

    async revokeAdminSession(options: {
        sessionId: string;
        currentSessionId: string;
        actorId: string;
        canManageAll: boolean;
        requestId: string;
    }): Promise<{ current: boolean }> {
        return withTransaction(this.pool, async (client) => {
            const targetResult = await client.query<{ admin_user_id: string; revoked_at: Date | null }>(
                'SELECT admin_user_id, revoked_at FROM admin_sessions WHERE id = $1 FOR UPDATE',
                [options.sessionId]
            );
            const target = targetResult.rows[0];
            if (!target) throw new AppError({ status: 404, code: 'ADMIN_SESSION_NOT_FOUND', title: 'Sessão administrativa não encontrada' });
            if (target.admin_user_id !== options.actorId && !options.canManageAll) {
                throw new AppError({ status: 403, code: 'ADMIN_SESSION_SCOPE_FORBIDDEN', title: 'Você só pode encerrar as suas próprias sessões' });
            }
            if (target.revoked_at) {
                throw new AppError({ status: 409, code: 'ADMIN_SESSION_ALREADY_REVOKED', title: 'Esta sessão já foi encerrada' });
            }
            const now = this.clock.now();
            await client.query('UPDATE admin_sessions SET revoked_at = $2 WHERE id = $1', [options.sessionId, now]);
            const current = options.sessionId === options.currentSessionId;
            await this.audit.record({
                adminUserId: options.actorId,
                action: 'ADMIN_SESSION_REVOKED',
                entityType: 'ADMIN_SESSION',
                entityId: options.sessionId,
                requestId: options.requestId,
                metadata: { current, targetUserId: target.admin_user_id },
            }, client);
            return { current };
        });
    }

    async listAudit(options: PageOptions & { action?: string; entityType?: string; actorId?: string }) {
        const values: unknown[] = [];
        const conditions: string[] = [];
        for (const [column, value] of [
            ['l.action', options.action],
            ['l.entity_type', options.entityType],
            ['l.admin_user_id', options.actorId],
        ] as const) {
            if (value) {
                values.push(value);
                conditions.push(`${column} = $${values.length}`);
            }
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const count = await this.pool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM admin_audit_log l ${where}`, values);
        values.push(options.pageSize, (options.page - 1) * options.pageSize);
        const result = await this.pool.query<{
            id: string;
            admin_user_id: string | null;
            actor_display_name: string | null;
            actor_email: string | null;
            action: string;
            entity_type: string;
            entity_id: string | null;
            request_id: string;
            metadata: Record<string, unknown>;
            created_at: Date;
        }>(
            `SELECT l.id, l.admin_user_id, u.display_name AS actor_display_name,
                    u.email AS actor_email, l.action, l.entity_type, l.entity_id,
                    l.request_id, l.metadata, l.created_at
               FROM admin_audit_log l
               LEFT JOIN admin_users u ON u.id = l.admin_user_id
               ${where}
              ORDER BY l.created_at DESC, l.id
              LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values
        );
        const total = count.rows[0]?.total ?? 0;
        return {
            entries: result.rows.map((entry) => ({
                id: entry.id,
                actor: entry.admin_user_id && entry.actor_display_name && entry.actor_email
                    ? { id: entry.admin_user_id, displayName: entry.actor_display_name, email: entry.actor_email }
                    : null,
                action: entry.action,
                entityType: entry.entity_type,
                entityId: entry.entity_id,
                requestId: entry.request_id,
                metadata: entry.metadata,
                createdAt: entry.created_at.toISOString(),
            })),
            meta: pageMeta(options, total),
        };
    }

    async runRetention(options: { actorId: string; requestId: string }) {
        return purgeExpiredData(this.pool, this.clock.now(), undefined, undefined, async (client, result) => {
            await this.audit.record({
                adminUserId: options.actorId,
                action: 'RETENTION_RUN',
                entityType: 'SYSTEM',
                entityId: null,
                requestId: options.requestId,
                metadata: {
                    rooms: result.rooms,
                    guestSessions: result.guestSessions,
                    adminSessions: result.adminSessions,
                    idempotencyKeys: result.idempotencyKeys,
                },
            }, client);
        });
    }
}

function pageMeta(options: PageOptions, total: number) {
    return {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize),
    };
}

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function toPublicUser(row: AdminUserRow): AdminUser {
    return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        active: row.active,
        lockedUntil: row.locked_until?.toISOString() ?? null,
        lastLoginAt: row.last_login_at?.toISOString() ?? null,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
    };
}

function mapRoomListItem(room: {
    id: string;
    code: string;
    status: string;
    version: string;
    region_code: string;
    participant_count: number;
    ready_count: number;
    candidate_count: number;
    vote_count: number;
    match_count: number;
    decision_game_id: string | null;
    created_at: Date;
    updated_at: Date;
    expires_at: Date;
}) {
    return {
        id: room.id,
        code: room.code,
        status: room.status,
        version: Number(room.version),
        regionCode: room.region_code,
        participantCount: room.participant_count,
        readyCount: room.ready_count,
        candidateCount: room.candidate_count,
        voteCount: room.vote_count,
        matchCount: room.match_count,
        decisionGameId: room.decision_game_id,
        createdAt: room.created_at.toISOString(),
        updatedAt: room.updated_at.toISOString(),
        expiresAt: room.expires_at.toISOString(),
    };
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function countActiveSuperAdmins(client: PoolClient): Promise<number> {
    const result = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM admin_users WHERE role = 'SUPER_ADMIN' AND active = TRUE`
    );
    return result.rows[0]?.count ?? 0;
}

async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
