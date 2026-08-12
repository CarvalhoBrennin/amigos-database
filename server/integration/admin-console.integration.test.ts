import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabaseConnection, type DatabaseConnection } from '../src/infrastructure/db/client.js';
import { PostgresRoomEventBus } from '../src/infrastructure/realtime/postgres-room-event-bus.js';
import { hashPassword } from '../src/lib/password.js';
import { createTestConfig } from '../tests/test-config.js';

const origin = 'http://localhost:5173';
const databaseUrl = process.env.TEST_DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';

interface AdminCredentials {
    cookie: string;
    csrfToken: string;
    userId: string;
}

describe('administrative console security and operations', () => {
    let app: FastifyInstance;
    let database: DatabaseConnection;
    let loginSequence = 0;

    beforeAll(async () => {
        const config = createTestConfig({ databaseUrl });
        database = createDatabaseConnection(config);
        app = await buildApp({ config, database, logger: false });
        await app.ready();
    });

    beforeEach(async () => {
        await database.pool.query(`TRUNCATE TABLE
            admin_audit_log,
            admin_sessions,
            admin_users,
            idempotency_keys,
            room_decisions,
            room_matches,
            room_votes,
            room_candidates,
            room_round_participants,
            room_game_history,
            participant_owned_games,
            participant_subscriptions,
            participant_platforms,
            room_participants,
            rooms,
            guest_sessions,
            game_network_pool_platforms,
            game_network_pools,
            game_subscription_availability,
            game_prices,
            game_platform_offerings,
            game_decision_profiles
            RESTART IDENTITY CASCADE`);
    });

    afterAll(async () => {
        await database.pool.query('TRUNCATE TABLE admin_audit_log, admin_sessions, admin_users CASCADE');
        await app.close();
        await database.close();
    });

    async function insertAdmin(role: 'SUPER_ADMIN' | 'EDITOR' | 'VIEWER', email: string, password: string) {
        const id = randomUUID();
        const now = new Date();
        await database.pool.query(
            `INSERT INTO admin_users (
                id, email, display_name, password_hash, role, active,
                failed_login_attempts, password_changed_at, created_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,TRUE,0,$6,$6,$6)`,
            [id, email, `Admin ${role}`, await hashPassword(password), role, now]
        );
        return id;
    }

    async function login(email: string, password: string, remoteAddress?: string): Promise<AdminCredentials> {
        loginSequence += 1;
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/session/login',
            headers: { origin },
            payload: { email, password },
            remoteAddress: remoteAddress ?? `198.51.100.${100 + loginSequence}`,
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as { csrfToken: string; user: { id: string } };
        const setCookie = response.headers['set-cookie'];
        expect(setCookie).toBeTypeOf('string');
        return {
            cookie: (setCookie as string).split(';', 1)[0] as string,
            csrfToken: body.csrfToken,
            userId: body.user.id,
        };
    }

    function mutationHeaders(admin: AdminCredentials) {
        return {
            origin,
            cookie: admin.cookie,
            'x-admin-csrf-token': admin.csrfToken,
        };
    }

    async function createGuestRoom() {
        const guest = await app.inject({ method: 'POST', url: '/api/v1/session/guest', headers: { origin } });
        expect(guest.statusCode).toBe(200);
        const cookie = String(guest.headers['set-cookie']).split(';', 1)[0] as string;
        const csrfToken = (guest.json() as { csrfToken: string }).csrfToken;
        const room = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: { origin, cookie, 'x-csrf-token': csrfToken, 'idempotency-key': randomUUID() },
            payload: { hostNickname: 'Host da auditoria', regionCode: 'BR' },
        });
        expect(room.statusCode).toBe(201);
        return (room.json() as { room: { id: string; code: string; version: number } }).room;
    }

    it('requires an allowed origin and locks repeated invalid credentials', async () => {
        const email = 'security@example.test';
        await insertAdmin('SUPER_ADMIN', email, 'senha-correta-segura');

        const missingOrigin = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/session/login',
            payload: { email, password: 'senha-correta-segura' },
        });
        expect(missingOrigin.statusCode).toBe(403);

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const invalid = await app.inject({
                method: 'POST',
                url: '/api/v1/admin/session/login',
                headers: { origin },
                payload: { email, password: 'senha-incorreta-segura' },
                remoteAddress: `198.51.100.${attempt + 30}`,
            });
            expect(invalid.statusCode, invalid.body).toBe(401);
            expect(invalid.json()).toMatchObject({ code: 'ADMIN_CREDENTIALS_INVALID' });
        }

        const locked = await database.pool.query<{ failed_login_attempts: number; locked_until: Date | null }>(
            'SELECT failed_login_attempts, locked_until FROM admin_users WHERE email = $1',
            [email]
        );
        expect(locked.rows[0]?.failed_login_attempts).toBe(5);
        expect(locked.rows[0]?.locked_until).toBeInstanceOf(Date);

        const validWhileLocked = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/session/login',
            headers: { origin },
            payload: { email, password: 'senha-correta-segura' },
            remoteAddress: '198.51.100.90',
        });
        expect(validWhileLocked.statusCode).toBe(401);
    });

    it('restores the session after refresh and enforces CSRF and viewer permissions', async () => {
        const email = 'viewer@example.test';
        await insertAdmin('VIEWER', email, 'senha-do-visualizador');
        const viewer = await login(email, 'senha-do-visualizador');

        const session = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/session',
            headers: { cookie: viewer.cookie },
        });
        expect(session.statusCode).toBe(200);
        expect(session.json()).toMatchObject({
            user: { email, role: 'VIEWER' },
            csrfToken: viewer.csrfToken,
        });

        const noCsrf = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/users',
            headers: { origin, cookie: viewer.cookie },
            payload: {
                email: 'blocked@example.test',
                displayName: 'Bloqueado',
                password: 'senha-bloqueada-segura',
                role: 'VIEWER',
            },
        });
        expect(noCsrf.statusCode).toBe(403);
        expect(noCsrf.json()).toMatchObject({ code: 'ADMIN_CSRF_INVALID' });

        const forbidden = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/users',
            headers: mutationHeaders(viewer),
            payload: {
                email: 'blocked@example.test',
                displayName: 'Bloqueado',
                password: 'senha-bloqueada-segura',
                role: 'VIEWER',
            },
        });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.json()).toMatchObject({ code: 'ADMIN_PERMISSION_REQUIRED' });
    });

    it('manages administrators and records append-only audit events', async () => {
        const email = 'root@example.test';
        await insertAdmin('SUPER_ADMIN', email, 'senha-do-super-admin');
        const admin = await login(email, 'senha-do-super-admin');

        const created = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/users',
            headers: mutationHeaders(admin),
            payload: {
                email: 'editor@example.test',
                displayName: 'Editora de dados',
                password: 'senha-segura-da-editora',
                role: 'EDITOR',
            },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({ email: 'editor@example.test', role: 'EDITOR', active: true });

        const users = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/users?page=1&pageSize=10',
            headers: { cookie: admin.cookie },
        });
        expect(users.statusCode).toBe(200);
        expect(users.json()).toMatchObject({ meta: { total: 2 } });

        const audit = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/audit?page=1&pageSize=20',
            headers: { cookie: admin.cookie },
        });
        expect(audit.statusCode).toBe(200);
        expect(JSON.stringify(audit.json())).toContain('ADMIN_USER_CREATED');
        const auditId = (audit.json() as { entries: Array<{ id: string }> }).entries[0]?.id;
        await expect(database.pool.query(
            `UPDATE admin_audit_log SET action = 'TAMPERED' WHERE id = $1`,
            [auditId]
        )).rejects.toMatchObject({ message: expect.stringContaining('append-only') });

        const demoteLastRoot = await app.inject({
            method: 'PATCH',
            url: `/api/v1/admin/users/${admin.userId}`,
            headers: mutationHeaders(admin),
            payload: { role: 'EDITOR' },
        });
        expect(demoteLastRoot.statusCode).toBe(409);
        expect(demoteLastRoot.json()).toMatchObject({ code: 'LAST_SUPER_ADMIN_REQUIRED' });
    });

    it('scopes administrative sessions and allows safe revocation', async () => {
        await insertAdmin('SUPER_ADMIN', 'root-sessions@example.test', 'senha-segura-das-sessoes');
        await insertAdmin('VIEWER', 'viewer-sessions@example.test', 'senha-segura-do-viewer');
        const root = await login('root-sessions@example.test', 'senha-segura-das-sessoes', '198.51.100.41');
        const viewerOne = await login('viewer-sessions@example.test', 'senha-segura-do-viewer', '198.51.100.42');
        const viewerTwo = await login('viewer-sessions@example.test', 'senha-segura-do-viewer', '198.51.100.43');

        const ownSessions = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/admin-sessions?page=1&pageSize=20',
            headers: { cookie: viewerOne.cookie },
        });
        expect(ownSessions.statusCode).toBe(200);
        const ownBody = ownSessions.json() as { sessions: Array<{ id: string; current: boolean; user: { email: string } }>; meta: { total: number } };
        expect(ownBody.meta.total).toBe(2);
        expect(ownBody.sessions.every((item) => item.user.email === 'viewer-sessions@example.test')).toBe(true);
        const current = ownBody.sessions.find((item) => item.current);
        const other = ownBody.sessions.find((item) => !item.current);
        expect(current).toBeDefined();
        expect(other).toBeDefined();

        const allSessions = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/admin-sessions?page=1&pageSize=20',
            headers: { cookie: root.cookie },
        });
        expect(allSessions.statusCode).toBe(200);
        expect((allSessions.json() as { meta: { total: number } }).meta.total).toBe(3);
        const rootSessionId = (allSessions.json() as { sessions: Array<{ id: string; user: { email: string } }> }).sessions
            .find((item) => item.user.email === 'root-sessions@example.test')?.id;

        const forbidden = await app.inject({
            method: 'DELETE',
            url: `/api/v1/admin/admin-sessions/${rootSessionId}`,
            headers: mutationHeaders(viewerOne),
        });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.json()).toMatchObject({ code: 'ADMIN_SESSION_SCOPE_FORBIDDEN' });

        const revoked = await app.inject({
            method: 'DELETE',
            url: `/api/v1/admin/admin-sessions/${other?.id}`,
            headers: mutationHeaders(viewerOne),
        });
        expect(revoked.statusCode).toBe(204);
        const revokedAccess = await app.inject({ method: 'GET', url: '/api/v1/admin/session', headers: { cookie: viewerTwo.cookie } });
        expect(revokedAccess.statusCode).toBe(401);

        const closeCurrent = await app.inject({
            method: 'DELETE',
            url: `/api/v1/admin/admin-sessions/${current?.id}`,
            headers: mutationHeaders(viewerOne),
        });
        expect(closeCurrent.statusCode).toBe(204);
        expect(String(closeCurrent.headers['set-cookie'])).toContain('amgs_admin_s=');
    });

    it('manages reference data with conflicts and audit consistency', async () => {
        await insertAdmin('EDITOR', 'references@example.test', 'senha-segura-referencias');
        const editor = await login('references@example.test', 'senha-segura-referencias');
        const serviceCode = `TEST_SERVICE_${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
        const created = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/references/services',
            headers: mutationHeaders(editor),
            payload: { code: serviceCode, displayName: 'Serviço de teste', publisher: 'Editora de teste', active: true },
        });
        expect(created.statusCode).toBe(201);
        const service = (created.json() as { services: Array<{ id: string; code: string }> }).services.find((item) => item.code === serviceCode);
        expect(service).toBeDefined();

        const duplicate = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/references/services',
            headers: mutationHeaders(editor),
            payload: { code: serviceCode, displayName: 'Duplicado', publisher: 'Editora de teste', active: true },
        });
        expect(duplicate.statusCode).toBe(409);
        expect(duplicate.json()).toMatchObject({ code: 'ADMIN_REFERENCE_CONFLICT' });

        const plan = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/references/plans',
            headers: mutationHeaders(editor),
            payload: { serviceId: service?.id, code: `${serviceCode}_PLAN`, displayName: 'Plano de teste', active: true, sortOrder: 1 },
        });
        expect(plan.statusCode).toBe(201);
        const planId = (plan.json() as { plans: Array<{ id: string; code: string }> }).plans.find((item) => item.code === `${serviceCode}_PLAN`)?.id;

        const inUse = await app.inject({
            method: 'DELETE',
            url: `/api/v1/admin/references/services/${service?.id}`,
            headers: mutationHeaders(editor),
        });
        expect(inUse.statusCode).toBe(409);
        expect(inUse.json()).toMatchObject({ code: 'ADMIN_REFERENCE_IN_USE' });

        const auditCount = await database.pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM admin_audit_log
              WHERE action = 'REFERENCE_SERVICE_CREATED' AND entity_id = $1`,
            [service?.id]
        );
        expect(auditCount.rows[0]?.count).toBe(1);

        expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/references/plans/${planId}`, headers: mutationHeaders(editor) })).statusCode).toBe(200);
        expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/references/services/${service?.id}`, headers: mutationHeaders(editor) })).statusCode).toBe(200);
    });

    it('enforces room operation roles and publishes authoritative room events', async () => {
        await insertAdmin('SUPER_ADMIN', 'room-root@example.test', 'senha-segura-room-root');
        await insertAdmin('EDITOR', 'room-editor@example.test', 'senha-segura-room-editor');
        const root = await login('room-root@example.test', 'senha-segura-room-root');
        const editor = await login('room-editor@example.test', 'senha-segura-room-editor');
        const room = await createGuestRoom();
        const eventBus = new PostgresRoomEventBus(database.pool);
        const received: Array<{ eventType: string; version: number }> = [];
        const unsubscribe = await eventBus.subscribe((event) => {
            if (event.roomId === room.id) received.push(event);
        });
        try {
            const cancelled = await app.inject({
                method: 'PATCH',
                url: `/api/v1/admin/rooms/${room.id}`,
                headers: mutationHeaders(editor),
                payload: { action: 'CANCEL' },
            });
            expect(cancelled.statusCode).toBe(200);
            expect(cancelled.json()).toMatchObject({ status: 'CANCELLED', version: room.version + 1 });
            await expect.poll(() => received.some((event) => event.eventType === 'ROOM_CANCELLED' && event.version === room.version + 1)).toBe(true);

            const repeated = await app.inject({
                method: 'PATCH',
                url: `/api/v1/admin/rooms/${room.id}`,
                headers: mutationHeaders(editor),
                payload: { action: 'CANCEL' },
            });
            expect(repeated.statusCode).toBe(409);

            const editorDelete = await app.inject({
                method: 'DELETE',
                url: `/api/v1/admin/rooms/${room.id}?confirmation=${room.code}`,
                headers: mutationHeaders(editor),
            });
            expect(editorDelete.statusCode).toBe(403);

            const deleted = await app.inject({
                method: 'DELETE',
                url: `/api/v1/admin/rooms/${room.id}?confirmation=${room.code}`,
                headers: mutationHeaders(root),
            });
            expect(deleted.statusCode).toBe(204);
            await expect.poll(() => received.some((event) => event.eventType === 'ROOM_DELETED')).toBe(true);
        } finally {
            unsubscribe();
            await eventBus.close();
        }
    });

    it('purges expired administrative sessions and audits retention in the same operation', async () => {
        await insertAdmin('SUPER_ADMIN', 'retention@example.test', 'senha-segura-retencao');
        const current = await login('retention@example.test', 'senha-segura-retencao', '198.51.100.81');
        await login('retention@example.test', 'senha-segura-retencao', '198.51.100.82');
        const sessionList = await app.inject({
            method: 'GET',
            url: '/api/v1/admin/admin-sessions?page=1&pageSize=10',
            headers: { cookie: current.cookie },
        });
        const targetId = (sessionList.json() as { sessions: Array<{ id: string; current: boolean }> }).sessions.find((item) => !item.current)?.id;
        expect(targetId).toBeDefined();
        await database.pool.query(
            `UPDATE admin_sessions SET created_at = NOW() - INTERVAL '2 days',
                last_seen_at = NOW() - INTERVAL '2 days', expires_at = NOW() - INTERVAL '1 day'
              WHERE id = $1`,
            [targetId]
        );

        const retention = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/retention/run',
            headers: mutationHeaders(current),
        });
        expect(retention.statusCode).toBe(200);
        expect(retention.json()).toMatchObject({ adminSessions: 1 });
        const audit = await database.pool.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count FROM admin_audit_log WHERE action = 'RETENTION_RUN'`
        );
        expect(audit.rows[0]?.count).toBe(1);
    });

    it('edits verified decision data without promoting missing data implicitly', async () => {
        const email = 'decision@example.test';
        await insertAdmin('EDITOR', email, 'senha-segura-de-dados');
        const admin = await login(email, 'senha-segura-de-dados');
        const verifiedAt = new Date().toISOString();

        const profile = await app.inject({
            method: 'PUT',
            url: '/api/v1/admin/games/1/profile',
            headers: mutationHeaders(admin),
            payload: {
                minOnlinePlayers: 2,
                maxOnlinePlayers: 4,
                minSessionMinutes: 30,
                maxSessionMinutes: 90,
                installSizeMb: 1024,
                minPcTier: null,
                freeToPlay: false,
                communication: 5,
                skill: 5,
                chaos: 5,
                strategy: 5,
                story: 5,
                difficultyCode: 'MODERATE',
                dataStatus: 'COMPLETE',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: 'https://data.example.test/game/1',
                lastVerifiedAt: verifiedAt,
            },
        });
        expect(profile.statusCode).toBe(200);
        expect(profile.json()).toMatchObject({ profile: { dataStatus: 'COMPLETE' } });

        const offering = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/games/1/offerings',
            headers: mutationHeaders(admin),
            payload: {
                platformCode: 'PC_STEAM',
                regionCode: 'BR',
                onlineSupported: true,
                freeToPlay: false,
                requiresPaidOnlineSubscription: false,
                onlineRequirementVerificationStatus: 'VERIFIED',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: 'https://data.example.test/game/1/platform',
                verificationStatus: 'VERIFIED',
                lastVerifiedAt: verifiedAt,
                validFrom: verifiedAt,
                validUntil: null,
            },
        });
        expect(offering.statusCode).toBe(201);
        expect((offering.json() as { offerings: unknown[] }).offerings).toHaveLength(1);

        const duplicateOffering = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/games/1/offerings',
            headers: mutationHeaders(admin),
            payload: {
                platformCode: 'PC_STEAM',
                regionCode: 'BR',
                onlineSupported: true,
                freeToPlay: false,
                requiresPaidOnlineSubscription: false,
                onlineRequirementVerificationStatus: 'VERIFIED',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: 'https://data.example.test/game/1/platform',
                verificationStatus: 'VERIFIED',
                lastVerifiedAt: verifiedAt,
                validFrom: verifiedAt,
                validUntil: null,
            },
        });
        expect(duplicateOffering.statusCode).toBe(409);
        expect(duplicateOffering.json()).toMatchObject({ code: 'ADMIN_DECISION_RECORD_CONFLICT' });
        expect((await database.pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM game_platform_offerings WHERE game_id = $1', ['1'])).rows[0]?.count).toBe(1);

        const invalidVerified = await app.inject({
            method: 'POST',
            url: '/api/v1/admin/games/2/offerings',
            headers: mutationHeaders(admin),
            payload: {
                platformCode: 'PC_STEAM',
                regionCode: 'BR',
                onlineSupported: true,
                freeToPlay: false,
                requiresPaidOnlineSubscription: null,
                onlineRequirementVerificationStatus: 'UNKNOWN',
                sourceType: 'ADMIN_IMPORT',
                sourceUrl: null,
                verificationStatus: 'VERIFIED',
                lastVerifiedAt: null,
                validFrom: null,
                validUntil: null,
            },
        });
        expect(invalidVerified.statusCode).toBe(400);
        expect(invalidVerified.json()).toMatchObject({ code: 'VALIDATION_ERROR' });

        const deletedProfile = await app.inject({
            method: 'DELETE',
            url: '/api/v1/admin/games/1/profile',
            headers: mutationHeaders(admin),
        });
        expect(deletedProfile.statusCode).toBe(200);
        expect(deletedProfile.json()).toMatchObject({ profile: null });
        expect((deletedProfile.json() as { offerings: unknown[] }).offerings).toHaveLength(1);
    });
});
