import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import type { ServerConfig } from '../../config/env.js';
import type { Clock } from '../../lib/clock.js';
import { constantTimeEqual, createOpaqueToken, deriveToken, hashToken } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';

const GUEST_COOKIE_NAME = 'amgs_s';

interface GuestSessionRow {
    id: string;
    expires_at: Date;
}

export interface AuthenticatedGuestSession {
    id: string;
    rawToken: string;
    expiresAt: Date;
}

export class GuestSessionService {
    constructor(
        private readonly pool: Pool,
        private readonly config: ServerConfig,
        private readonly clock: Clock
    ) {}

    assertAllowedOrigin(request: FastifyRequest): void {
        const origin = request.headers.origin;
        const referer = request.headers.referer;
        let requestOrigin: string | null = null;

        try {
            if (origin) {
                requestOrigin = new URL(origin).origin;
            } else if (referer) {
                requestOrigin = new URL(referer).origin;
            }
        } catch {
            throw new AppError({
                status: 403,
                code: 'ORIGIN_NOT_ALLOWED',
                title: 'Origem não permitida',
            });
        }

        if (!requestOrigin || !this.config.webOrigins.includes(requestOrigin)) {
            throw new AppError({
                status: 403,
                code: 'ORIGIN_NOT_ALLOWED',
                title: 'Origem não permitida',
            });
        }
    }

    async createOrReuse(request: FastifyRequest, reply: FastifyReply): Promise<{
        session: AuthenticatedGuestSession;
        csrfToken: string;
    }> {
        this.assertAllowedOrigin(request);
        const existingToken = request.cookies[GUEST_COOKIE_NAME];
        const existing = existingToken ? await this.findActiveSession(existingToken) : null;
        const session = existing ?? await this.createSession();
        if (existing) {
            await this.touchSession(existing.id);
        }

        this.setSessionCookie(reply, session.rawToken, session.expiresAt);
        return {
            session,
            csrfToken: this.createCsrfToken(session.rawToken),
        };
    }

    async authenticate(request: FastifyRequest): Promise<AuthenticatedGuestSession> {
        const token = request.cookies[GUEST_COOKIE_NAME];
        if (!token) {
            throw this.unauthorizedError();
        }

        const session = await this.findActiveSession(token);
        if (!session) {
            throw this.unauthorizedError();
        }

        return session;
    }

    async authenticateMutation(request: FastifyRequest): Promise<AuthenticatedGuestSession> {
        this.assertAllowedOrigin(request);
        const session = await this.authenticate(request);
        const suppliedToken = request.headers['x-csrf-token'];
        const expectedToken = this.createCsrfToken(session.rawToken);

        if (typeof suppliedToken !== 'string' || !constantTimeEqual(suppliedToken, expectedToken)) {
            throw new AppError({
                status: 403,
                code: 'CSRF_TOKEN_INVALID',
                title: 'Token de segurança inválido',
            });
        }

        await this.touchSession(session.id);
        return session;
    }

    private async findActiveSession(rawToken: string): Promise<AuthenticatedGuestSession | null> {
        if (rawToken.length < 32 || rawToken.length > 256) {
            return null;
        }

        const now = this.clock.now();
        const result = await this.pool.query<GuestSessionRow>(
            `SELECT id, expires_at
               FROM guest_sessions
              WHERE token_hash = $1
                AND expires_at > $2`,
            [hashToken(rawToken, this.config.tokenPepper), now]
        );
        const row = result.rows[0];
        return row
            ? { id: row.id, rawToken, expiresAt: row.expires_at }
            : null;
    }

    private async touchSession(sessionId: string): Promise<void> {
        await this.pool.query(
            'UPDATE guest_sessions SET last_seen_at = $2 WHERE id = $1',
            [sessionId, this.clock.now()]
        );
    }

    private async createSession(): Promise<AuthenticatedGuestSession> {
        const now = this.clock.now();
        const expiresAt = new Date(now.getTime() + this.config.guestSessionTtlHours * 60 * 60 * 1000);
        const rawToken = createOpaqueToken(32);
        const id = randomUUID();

        await this.pool.query(
            `INSERT INTO guest_sessions (id, token_hash, created_at, last_seen_at, expires_at)
             VALUES ($1, $2, $3, $3, $4)`,
            [id, hashToken(rawToken, this.config.tokenPepper), now, expiresAt]
        );

        return { id, rawToken, expiresAt };
    }

    private createCsrfToken(rawToken: string): string {
        return deriveToken(`csrf:${rawToken}`, this.config.sessionSecret);
    }

    private setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
        reply.setCookie(GUEST_COOKIE_NAME, token, {
            path: '/',
            httpOnly: true,
            secure: this.config.isProduction,
            sameSite: 'lax',
            expires: expiresAt,
        });
    }

    private unauthorizedError(): AppError {
        return new AppError({
            status: 401,
            code: 'GUEST_SESSION_REQUIRED',
            title: 'Sessão necessária',
            detail: 'Inicie uma sessão temporária para continuar.',
        });
    }
}
