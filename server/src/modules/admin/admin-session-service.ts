import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type {
    AdminPermission,
    AdminRole,
    AdminSession,
    AdminUser,
} from '../../../../shared/index.js';
import type { ServerConfig } from '../../config/env.js';
import type { Clock } from '../../lib/clock.js';
import { constantTimeEqual, createOpaqueToken, deriveToken, hashToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import type { AdminAuditService } from './admin-audit-service.js';

const adminCookieName = 'amgs_admin_s';
const lockThreshold = 5;
const lockDurationMs = 15 * 60 * 1_000;
const touchIntervalMs = 5 * 60 * 1_000;

const permissionsByRole: Record<AdminRole, AdminPermission[]> = {
    VIEWER: [
        'DASHBOARD_READ',
        'ROOMS_READ',
        'SESSIONS_READ',
        'DECISION_DATA_READ',
        'REFERENCES_READ',
        'AUDIT_READ',
    ],
    EDITOR: [
        'DASHBOARD_READ',
        'ROOMS_READ',
        'ROOMS_WRITE',
        'SESSIONS_READ',
        'SESSIONS_WRITE',
        'DECISION_DATA_READ',
        'DECISION_DATA_WRITE',
        'REFERENCES_READ',
        'REFERENCES_WRITE',
        'AUDIT_READ',
    ],
    SUPER_ADMIN: [
        'ADMIN_USERS_READ',
        'ADMIN_USERS_WRITE',
        'DASHBOARD_READ',
        'ROOMS_READ',
        'ROOMS_WRITE',
        'ROOMS_DELETE',
        'SESSIONS_READ',
        'SESSIONS_WRITE',
        'DECISION_DATA_READ',
        'DECISION_DATA_WRITE',
        'REFERENCES_READ',
        'REFERENCES_WRITE',
        'AUDIT_READ',
        'RETENTION_RUN',
    ],
};

interface AdminPublicRow {
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

interface AdminLoginRow extends AdminPublicRow {
    password_hash: string;
    failed_login_attempts: number;
}

interface AdminAuthRow extends AdminPublicRow {
    session_id: string;
    session_expires_at: Date;
    last_seen_at: Date;
}

export interface AuthenticatedAdmin {
    sessionId: string;
    user: AdminUser;
    permissions: AdminPermission[];
    expiresAt: Date;
}

let dummyPasswordHash: Promise<string> | null = null;

export class AdminSessionService {
    constructor(
        private readonly pool: Pool,
        private readonly config: ServerConfig,
        private readonly clock: Clock,
        private readonly audit: AdminAuditService
    ) {}

    async login(options: {
        email: string;
        password: string;
        request: FastifyRequest;
        reply: FastifyReply;
    }): Promise<{ session: AdminSession; csrfToken: string }> {
        this.assertAllowedOrigin(options.request);
        const email = options.email.trim().toLowerCase();
        const result = await this.pool.query<AdminLoginRow>(
            `SELECT id, email, display_name, password_hash, role, active,
                    failed_login_attempts, locked_until, last_login_at, created_at, updated_at
               FROM admin_users
              WHERE email = $1`,
            [email]
        );
        const row = result.rows[0];
        const fallbackHash = await this.getDummyPasswordHash();
        const passwordValid = await verifyPassword(options.password, row?.password_hash ?? fallbackHash);
        const now = this.clock.now();

        if (!row || !passwordValid || !row.active || (row.locked_until !== null && row.locked_until > now)) {
            await this.recordFailedLogin({
                userId: row?.id ?? null,
                shouldIncrement: Boolean(row?.active && (!row.locked_until || row.locked_until <= now)),
                subjectHash: hashToken(`admin-login-subject:${email}`, this.config.tokenPepper),
                requestId: options.request.id,
                now,
            });
            throw invalidCredentialsError();
        }

        const rawToken = createOpaqueToken(32);
        const csrfToken = deriveToken(`admin-csrf:${rawToken}`, this.config.sessionSecret);
        const expiresAt = new Date(now.getTime() + this.config.adminSessionTtlHours * 60 * 60 * 1_000);
        const ipHash = options.request.ip
            ? hashToken(`admin-ip:${options.request.ip}`, this.config.tokenPepper)
            : null;
        const userAgent = options.request.headers['user-agent'];
        const userAgentHash = userAgent
            ? hashToken(`admin-ua:${userAgent}`, this.config.tokenPepper)
            : null;
        const sessionId = randomUUID();

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE admin_users
                    SET failed_login_attempts = 0, locked_until = NULL,
                        last_login_at = $2, updated_at = $2
                  WHERE id = $1`,
                [row.id, now]
            );
            await client.query(
                `INSERT INTO admin_sessions (
                    id, admin_user_id, token_hash, created_at, last_seen_at,
                    expires_at, revoked_at, ip_hash, user_agent_hash
                ) VALUES ($1,$2,$3,$4,$4,$5,NULL,$6,$7)`,
                [
                    sessionId,
                    row.id,
                    hashToken(rawToken, this.config.tokenPepper),
                    now,
                    expiresAt,
                    ipHash,
                    userAgentHash,
                ]
            );
            await this.audit.record({
                adminUserId: row.id,
                action: 'ADMIN_LOGIN',
                entityType: 'ADMIN_SESSION',
                entityId: sessionId,
                requestId: options.request.id,
            }, client);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

        this.setCookie(options.reply, rawToken, expiresAt);
        return {
            session: {
                user: toPublicUser({ ...row, locked_until: null, last_login_at: now, updated_at: now }),
                permissions: permissionsByRole[row.role],
                expiresAt: expiresAt.toISOString(),
            },
            csrfToken,
        };
    }

    async authenticate(request: FastifyRequest): Promise<AuthenticatedAdmin> {
        const rawToken = request.cookies[adminCookieName];
        if (!rawToken || rawToken.length > 256) throw authenticationRequiredError();
        const now = this.clock.now();
        const result = await this.pool.query<AdminAuthRow>(
            `SELECT u.id, u.email, u.display_name, u.role, u.active,
                    u.locked_until, u.last_login_at,
                    u.created_at, u.updated_at,
                    s.id AS session_id, s.expires_at AS session_expires_at, s.last_seen_at
               FROM admin_sessions s
               JOIN admin_users u ON u.id = s.admin_user_id
              WHERE s.token_hash = $1
                AND s.revoked_at IS NULL
                AND s.expires_at > $2
                AND u.active = TRUE`,
            [hashToken(rawToken, this.config.tokenPepper), now]
        );
        const row = result.rows[0];
        if (!row) throw authenticationRequiredError();
        if (now.getTime() - row.last_seen_at.getTime() >= touchIntervalMs) {
            await this.pool.query(
                'UPDATE admin_sessions SET last_seen_at = $2 WHERE id = $1 AND revoked_at IS NULL',
                [row.session_id, now]
            );
        }
        return {
            sessionId: row.session_id,
            user: toPublicUser(row),
            permissions: permissionsByRole[row.role],
            expiresAt: row.session_expires_at,
        };
    }

    async authenticateMutation(request: FastifyRequest): Promise<AuthenticatedAdmin> {
        this.assertAllowedOrigin(request);
        const admin = await this.authenticate(request);
        const rawToken = request.cookies[adminCookieName];
        const rawCsrf = request.headers['x-admin-csrf-token'];
        if (!rawToken || typeof rawCsrf !== 'string' || rawCsrf.length > 256) {
            throw new AppError({ status: 403, code: 'ADMIN_CSRF_INVALID', title: 'Validação de segurança inválida' });
        }
        const expected = deriveToken(`admin-csrf:${rawToken}`, this.config.sessionSecret);
        if (!constantTimeEqual(rawCsrf, expected)) {
            throw new AppError({ status: 403, code: 'ADMIN_CSRF_INVALID', title: 'Validação de segurança inválida' });
        }
        return admin;
    }

    getCsrfToken(request: FastifyRequest): string {
        const rawToken = request.cookies[adminCookieName];
        if (!rawToken || rawToken.length > 256) throw authenticationRequiredError();
        return deriveToken(`admin-csrf:${rawToken}`, this.config.sessionSecret);
    }

    requirePermission(admin: AuthenticatedAdmin, permission: AdminPermission): void {
        if (!admin.permissions.includes(permission)) {
            throw new AppError({
                status: 403,
                code: 'ADMIN_PERMISSION_REQUIRED',
                title: 'Você não tem permissão para realizar esta ação',
            });
        }
    }

    async logout(admin: AuthenticatedAdmin, reply: FastifyReply, requestId: string): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'UPDATE admin_sessions SET revoked_at = $2 WHERE id = $1 AND revoked_at IS NULL',
                [admin.sessionId, this.clock.now()]
            );
            await this.audit.record({
                adminUserId: admin.user.id,
                action: 'ADMIN_LOGOUT',
                entityType: 'ADMIN_SESSION',
                entityId: admin.sessionId,
                requestId,
            }, client);
            await client.query('COMMIT');
            this.clearCookie(reply);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    clearCookie(reply: FastifyReply): void {
        reply.clearCookie(adminCookieName, {
            path: '/',
            httpOnly: true,
            secure: this.config.isProduction,
            sameSite: 'strict',
        });
    }

    private async recordFailedLogin(options: {
        userId: string | null;
        shouldIncrement: boolean;
        subjectHash: string;
        requestId: string;
        now: Date;
    }): Promise<void> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            if (options.userId && options.shouldIncrement) {
                await client.query(
                    `UPDATE admin_users
                        SET failed_login_attempts = failed_login_attempts + 1,
                            locked_until = CASE
                                WHEN failed_login_attempts + 1 >= $3 THEN $2::timestamptz + ($4::double precision * INTERVAL '1 millisecond')
                                ELSE NULL
                            END,
                            updated_at = $2
                      WHERE id = $1`,
                    [options.userId, options.now, lockThreshold, lockDurationMs]
                );
            }
            await this.audit.record({
                adminUserId: options.userId,
                action: 'ADMIN_LOGIN_FAILED',
                entityType: 'ADMIN_SESSION',
                entityId: null,
                requestId: options.requestId,
                metadata: { subjectHash: options.subjectHash },
            }, client);
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private setCookie(reply: FastifyReply, rawToken: string, expiresAt: Date): void {
        reply.setCookie(adminCookieName, rawToken, {
            path: '/',
            httpOnly: true,
            secure: this.config.isProduction,
            sameSite: 'strict',
            expires: expiresAt,
        });
    }

    private assertAllowedOrigin(request: FastifyRequest): void {
        const rawOrigin = request.headers.origin ?? request.headers.referer;
        if (!rawOrigin) {
            throw new AppError({ status: 403, code: 'ADMIN_ORIGIN_REQUIRED', title: 'Origem da solicitação ausente' });
        }
        let origin: string;
        try {
            origin = new URL(rawOrigin).origin;
        } catch {
            throw new AppError({ status: 403, code: 'ADMIN_ORIGIN_INVALID', title: 'Origem da solicitação inválida' });
        }
        if (!this.config.webOrigins.includes(origin)) {
            throw new AppError({ status: 403, code: 'ORIGIN_NOT_ALLOWED', title: 'Origem não permitida' });
        }
    }

    private getDummyPasswordHash(): Promise<string> {
        dummyPasswordHash ??= hashPassword('not-a-real-admin-password-value');
        return dummyPasswordHash;
    }
}

function toPublicUser(row: AdminPublicRow): AdminUser {
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

function authenticationRequiredError(): AppError {
    return new AppError({ status: 401, code: 'ADMIN_AUTH_REQUIRED', title: 'Autenticação administrativa necessária' });
}

function invalidCredentialsError(): AppError {
    return new AppError({ status: 401, code: 'ADMIN_CREDENTIALS_INVALID', title: 'E-mail ou senha inválidos' });
}

export function getAdminPermissions(role: AdminRole): AdminPermission[] {
    return [...permissionsByRole[role]];
}
