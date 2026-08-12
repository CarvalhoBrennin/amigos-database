import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabaseConnection, type DatabaseConnection } from '../src/infrastructure/db/client.js';
import { PostgresRoomEventBus } from '../src/infrastructure/realtime/postgres-room-event-bus.js';
import { notifyRoomEvent } from '../src/infrastructure/realtime/room-event-notifier.js';
import { createTestConfig } from '../tests/test-config.js';
import { purgeExpiredData } from '../src/modules/retention/purge-expired-data.js';

const origin = 'http://localhost:5173';
const databaseUrl = process.env.TEST_DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';

interface TestSession {
    cookie: string;
    csrfToken: string;
}

interface CreatedRoomBody {
    room: {
        id: string;
        code: string;
        version: number;
        currentParticipantId: string;
        participants: Array<{ id: string; nickname: string; role: string }>;
    };
    invite: { shareUrl: string };
}

describe('room guest authentication and authorization', () => {
    let app: FastifyInstance;
    let database: DatabaseConnection;

    beforeAll(async () => {
        const config = createTestConfig({ databaseUrl });
        database = createDatabaseConnection(config);
        app = await buildApp({ config, database, logger: false });
        await app.ready();
    });

    beforeEach(async () => {
        await database.pool.query(`TRUNCATE TABLE
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
        await app.close();
        await database.close();
    });

    async function createSession(remoteAddress?: string): Promise<TestSession> {
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/session/guest',
            headers: { origin },
            ...(remoteAddress ? { remoteAddress } : {}),
        });
        expect(response.statusCode).toBe(200);
        const setCookie = response.headers['set-cookie'];
        expect(setCookie).toBeTypeOf('string');
        return {
            cookie: (setCookie as string).split(';', 1)[0] as string,
            csrfToken: (response.json() as { csrfToken: string }).csrfToken,
        };
    }

    async function createRoom(
        session: TestSession,
        idempotencyKey = 'create-room-test-key',
        remoteAddress?: string
    ): Promise<CreatedRoomBody> {
        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: {
                origin,
                cookie: session.cookie,
                'x-csrf-token': session.csrfToken,
                'idempotency-key': idempotencyKey,
            },
            payload: { hostNickname: 'Host Seguro', regionCode: 'BR' },
            ...(remoteAddress ? { remoteAddress } : {}),
        });
        expect(response.statusCode).toBe(201);
        return response.json() as CreatedRoomBody;
    }

    it('creates a guest/host and keeps create idempotent with a stable invite', async () => {
        const session = await createSession();
        const first = await createRoom(session);
        const second = await createRoom(session);

        expect(second.room.id).toBe(first.room.id);
        expect(second.invite.shareUrl).toBe(first.invite.shareUrl);
        expect(first.room.version).toBe(1);
        expect(first.room.participants).toEqual([
            expect.objectContaining({ nickname: 'Host Seguro', role: 'HOST' }),
        ]);

        const persisted = await database.pool.query<{ sessions: string; rooms: string; participants: string }>(
            `SELECT
                (SELECT COUNT(*) FROM guest_sessions)::text AS sessions,
                (SELECT COUNT(*) FROM rooms)::text AS rooms,
                (SELECT COUNT(*) FROM room_participants)::text AS participants`
        );
        expect(persisted.rows[0]).toEqual({ sessions: '1', rooms: '1', participants: '1' });
        expect(JSON.stringify(first.room)).not.toContain('invite');
    });

    it('does not treat a participant marked LEFT as an active room membership', async () => {
        const session = await createSession();
        const created = await createRoom(session, 'left-participant-key');
        await database.pool.query(
            `UPDATE room_participants SET status = 'LEFT', left_at = NOW()
              WHERE id = $1`,
            [created.room.currentParticipantId]
        );

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}`,
            headers: { cookie: session.cookie },
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });
    });

    it('collapses concurrent create retries to one room for the same idempotency key', async () => {
        const session = await createSession('198.51.100.103');
        const headers = {
            origin,
            cookie: session.cookie,
            'x-csrf-token': session.csrfToken,
            'idempotency-key': 'concurrent-create-key',
        };
        const responses = await Promise.all([
            app.inject({
                method: 'POST',
                url: '/api/v1/rooms',
                headers,
                payload: { hostNickname: 'Host Concorrente', regionCode: 'BR' },
                remoteAddress: '198.51.100.103',
            }),
            app.inject({
                method: 'POST',
                url: '/api/v1/rooms',
                headers,
                payload: { hostNickname: 'Host Concorrente', regionCode: 'BR' },
                remoteAddress: '198.51.100.103',
            }),
        ]);

        expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 201]);
        const bodies = responses.map((response) => response.json() as CreatedRoomBody);
        expect(bodies[0]?.room.id).toBe(bodies[1]?.room.id);
        expect(bodies[0]?.invite.shareUrl).toBe(bodies[1]?.invite.shareUrl);
        const counts = await database.pool.query<{ rooms: string; participants: string }>(
            `SELECT
                (SELECT COUNT(*) FROM rooms)::text AS rooms,
                (SELECT COUNT(*) FROM room_participants)::text AS participants`
        );
        expect(counts.rows[0]).toEqual({ rooms: '1', participants: '1' });
    });

    it('rejects reuse of an idempotency key with a different request payload', async () => {
        const session = await createSession('198.51.100.101');
        const first = await createRoom(session, 'payload-bound-key', '198.51.100.101');

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: {
                origin,
                cookie: session.cookie,
                'x-csrf-token': session.csrfToken,
                'idempotency-key': 'payload-bound-key',
            },
            payload: { hostNickname: 'Outro host', regionCode: 'BR' },
            remoteAddress: '198.51.100.101',
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        const counts = await database.pool.query<{ rooms: string }>('SELECT COUNT(*)::text AS rooms FROM rooms');
        expect(counts.rows[0]?.rooms).toBe('1');
        expect(first.room.participants[0]?.nickname).toBe('Host Seguro');
    });

    it('fails closed when a legacy idempotency record has no request fingerprint', async () => {
        const session = await createSession('198.51.100.104');
        const first = await createRoom(session, 'legacy-idempotency-key', '198.51.100.104');
        await database.pool.query(
            `UPDATE idempotency_keys
                SET response_body = jsonb_build_object('roomId', response_body->>'roomId')
              WHERE operation = 'CREATE_ROOM'`
        );

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: {
                origin,
                cookie: session.cookie,
                'x-csrf-token': session.csrfToken,
                'idempotency-key': 'legacy-idempotency-key',
            },
            payload: { hostNickname: 'Host Seguro', regionCode: 'BR' },
            remoteAddress: '198.51.100.104',
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        const counts = await database.pool.query<{ rooms: string }>('SELECT COUNT(*)::text AS rooms FROM rooms');
        expect(counts.rows[0]?.rooms).toBe('1');
        expect(first.room.participants[0]?.nickname).toBe('Host Seguro');
    });

    it('allows an idempotency key to be reused after its retention window expires', async () => {
        const session = await createSession('198.51.100.102');
        const first = await createRoom(session, 'expired-idempotency-key', '198.51.100.102');
        await database.pool.query(
            `UPDATE idempotency_keys SET expires_at = NOW() - INTERVAL '1 minute'
              WHERE operation = 'CREATE_ROOM'`
        );

        const response = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: {
                origin,
                cookie: session.cookie,
                'x-csrf-token': session.csrfToken,
                'idempotency-key': 'expired-idempotency-key',
            },
            payload: { hostNickname: 'Novo host', regionCode: 'BR' },
            remoteAddress: '198.51.100.102',
        });

        expect(response.statusCode).toBe(201);
        expect(response.json().room.id).not.toBe(first.room.id);
    });

    it('joins idempotently, increments the room version once and never exposes the invite token', async () => {
        const host = await createSession();
        const created = await createRoom(host);
        const member = await createSession();
        const inviteToken = new URL(created.invite.shareUrl).searchParams.get('invite');
        expect(inviteToken).toBeTruthy();

        const firstJoin = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Convidado', inviteToken },
        });
        expect(firstJoin.statusCode).toBe(200);
        expect(firstJoin.json().room.version).toBe(2);

        const retry = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Ignorado no retry' },
        });
        expect(retry.statusCode).toBe(200);
        expect(retry.json().room.version).toBe(2);
        expect(retry.json().room.participants).toHaveLength(2);
        expect(JSON.stringify(retry.json())).not.toContain(inviteToken);
    });

    it('prevents BOLA even when another session knows a valid room code', async () => {
        const host = await createSession();
        const created = await createRoom(host);
        const outsider = await createSession();

        const response = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}`,
            headers: { cookie: outsider.cookie },
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });
        expect(JSON.stringify(response.json())).not.toContain(created.room.id);
    });

    it('rejects cross-room mutations even when both room codes are valid', async () => {
        const sessionA = await createSession('198.51.100.111');
        const sessionB = await createSession('198.51.100.112');
        const roomA = await createRoom(sessionA, 'bola-room-a', '198.51.100.111');
        const roomB = await createRoom(sessionB, 'bola-room-b', '198.51.100.112');
        const roomBState = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${roomB.room.code}`,
            headers: { cookie: sessionB.cookie },
        });
        const foreignConstraints = roomBState.json().constraints;

        const attempts = await Promise.all([
            app.inject({
                method: 'GET',
                url: `/api/v1/rooms/${roomB.room.code}/matches`,
                headers: { cookie: sessionA.cookie },
            }),
            app.inject({
                method: 'PATCH',
                url: `/api/v1/rooms/${roomB.room.code}/constraints`,
                headers: { origin, cookie: sessionA.cookie, 'x-csrf-token': sessionA.csrfToken },
                payload: { expectedRoomVersion: 1, constraints: foreignConstraints },
            }),
            app.inject({
                method: 'POST',
                url: `/api/v1/rooms/${roomB.room.code}/start`,
                headers: { origin, cookie: sessionA.cookie, 'x-csrf-token': sessionA.csrfToken },
                payload: { expectedRoomVersion: 1 },
            }),
        ]);

        expect(attempts.map((response) => response.statusCode)).toEqual([404, 404, 404]);
        expect(roomA.room.id).not.toBe(roomB.room.id);
        for (const response of attempts) {
            expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });
            expect(JSON.stringify(response.json())).not.toContain(roomB.room.id);
        }
    });

    it('rejects a missing or invalid CSRF token and an untrusted origin', async () => {
        const session = await createSession();

        const missingCsrf = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: { origin, cookie: session.cookie },
            payload: { hostNickname: 'Host' },
        });
        expect(missingCsrf.statusCode).toBe(403);
        expect(missingCsrf.json()).toMatchObject({ code: 'CSRF_TOKEN_INVALID' });

        const invalidOrigin = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: {
                origin: 'https://evil.example',
                cookie: session.cookie,
                'x-csrf-token': session.csrfToken,
            },
            payload: { hostNickname: 'Host' },
        });
        expect(invalidOrigin.statusCode).toBe(403);
        expect(invalidOrigin.json()).toMatchObject({ code: 'ORIGIN_NOT_ALLOWED' });
    });

    it('rejects invalid invites without revealing whether the room exists', async () => {
        const host = await createSession();
        const created = await createRoom(host);
        const member = await createSession();

        const response = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Convidado', inviteToken: 'x'.repeat(43) },
        });
        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });
    });

    it('rejects expired rooms and malformed room codes', async () => {
        const session = await createSession();
        const created = await createRoom(session, 'expired-room-test-key', '198.51.100.20');
        await database.pool.query(
            `UPDATE rooms
                SET created_at = NOW() - INTERVAL '8 days',
                    expires_at = NOW() - INTERVAL '1 day'
              WHERE id = $1`,
            [created.room.id]
        );

        const expired = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}`,
            headers: { cookie: session.cookie },
        });
        const malformed = await app.inject({
            method: 'GET',
            url: '/api/v1/rooms/BAD%21',
            headers: { cookie: session.cookie },
        });

        expect(expired.statusCode).toBe(410);
        expect(expired.json()).toMatchObject({ code: 'ROOM_EXPIRED' });
        expect(malformed.statusCode).toBe(400);
        expect(malformed.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    });

    it('rejects untrusted WebSocket origins and sessions without membership', async () => {
        let untrustedSocket;
        let untrustedClose: Promise<number> | undefined;
        try {
            untrustedSocket = await app.injectWS(
                '/api/v1/realtime/rooms/ABCD1234',
                { headers: { origin: 'https://evil.example.invalid' } },
                {
                    onInit(socket) {
                        untrustedClose = new Promise((resolve) => socket.once('close', resolve));
                    },
                }
            );
        } catch (error) {
            expect(String(error)).toMatch(/403|Unexpected server response/);
        }
        if (untrustedSocket) {
            expect(await untrustedClose).toBe(1008);
            untrustedSocket.terminate();
        }

        const session = await createSession();
        let resolveClose!: (code: number) => void;
        const closeCode = new Promise<number>((resolve) => {
            resolveClose = resolve;
        });
        const socket = await app.injectWS(
            '/api/v1/realtime/rooms/ABCD1234',
            { headers: { origin, cookie: session.cookie } },
            { onInit: (initialized) => initialized.once('close', resolveClose) }
        );

        expect(await closeCode).toBe(1008);
        socket.terminate();
    });

    it('enforces request size and create/join rate limits', async () => {
        const oversized = await app.inject({
            method: 'POST',
            url: '/api/v1/rooms',
            headers: { origin },
            payload: { hostNickname: 'x'.repeat(70_000) },
            remoteAddress: '198.51.100.30',
        });
        expect(oversized.statusCode).toBe(413);

        const createStatuses: number[] = [];
        for (let index = 0; index < 11; index += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/rooms',
                headers: { origin },
                payload: { hostNickname: 'Sem sessao' },
                remoteAddress: '198.51.100.31',
            });
            createStatuses.push(response.statusCode);
        }
        const joinStatuses: number[] = [];
        for (let index = 0; index < 31; index += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/rooms/ABCD1234/join',
                headers: { origin },
                payload: { nickname: 'Sem sessao' },
                remoteAddress: '198.51.100.32',
            });
            joinStatuses.push(response.statusCode);
        }

        expect(createStatuses.filter((status) => status === 429)).toHaveLength(1);
        expect(joinStatuses.filter((status) => status === 429)).toHaveLength(1);
    });

    it('does not deliver a room event when its transaction rolls back', async () => {
        const eventBus = new PostgresRoomEventBus(database.pool);
        const rolledBackRoomId = randomUUID();
        const committedRoomId = randomUUID();
        const receivedRoomIds: string[] = [];
        let resolveCommitted!: () => void;
        const committedReceived = new Promise<void>((resolve) => {
            resolveCommitted = resolve;
        });
        const unsubscribe = await eventBus.subscribe((event) => {
            receivedRoomIds.push(event.roomId);
            if (event.roomId === committedRoomId) resolveCommitted();
        });
        const client = await database.pool.connect();
        try {
            await client.query('BEGIN');
            await notifyRoomEvent(client, {
                roomId: rolledBackRoomId,
                roomCode: 'ROLLBACK',
                version: 1,
                eventType: 'ROOM_STARTED',
            });
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }

        await eventBus.publish({
            roomId: committedRoomId,
            roomCode: 'COMMIT01',
            version: 1,
            eventType: 'ROOM_STARTED',
        });
        await committedReceived;

        expect(receivedRoomIds).toEqual([committedRoomId]);
        unsubscribe();
        await eventBus.close();
    });

    it('serves active regional plans with correct PlayStation Plus semantics', async () => {
        const platforms = await app.inject({ method: 'GET', url: '/api/v1/reference/platforms' });
        const plans = await app.inject({ method: 'GET', url: '/api/v1/reference/subscription-plans?region=BR' });

        expect(platforms.statusCode).toBe(200);
        expect(platforms.json().platforms).toHaveLength(11);
        expect(plans.statusCode).toBe(200);
        expect(plans.json().plans).toHaveLength(7);
        const byCode = new Map<string, { capabilities: Record<string, boolean> }>(
            plans.json().plans.map((plan: { code: string; capabilities: Record<string, boolean> }) => [plan.code, plan])
        );
        expect(byCode.get('PLAYSTATION_PLUS_ESSENTIAL')?.capabilities).toMatchObject({
            onlineMultiplayer: true,
            gameCatalogDownload: false,
            monthlyClaimedGames: true,
        });
        expect(byCode.get('PLAYSTATION_PLUS_EXTRA')?.capabilities.gameCatalogDownload).toBe(true);
        expect(byCode.get('PLAYSTATION_PLUS_DELUXE')?.capabilities.gameCatalogDownload).toBe(true);
    });

    it('updates only the current profile and enforces readiness, host role and room versions', async () => {
        const host = await createSession();
        const created = await createRoom(host);
        const member = await createSession();
        const inviteToken = new URL(created.invite.shareUrl).searchParams.get('invite');
        const joined = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Participante', inviteToken },
        });
        expect(joined.json().room.version).toBe(2);

        const memberProfile = await app.inject({
            method: 'PATCH',
            url: `/api/v1/rooms/${created.room.code}/participants/me/profile`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: {
                expectedRoomVersion: 2,
                platforms: ['PC_STEAM'],
                subscriptions: ['PC_GAME_PASS'],
                ownedGames: [{ gameId: '1', platformCode: 'PC_STEAM' }],
                pcTier: 'MID',
                preferences: {
                    communication: 8,
                    skill: null,
                    chaos: 4,
                    strategy: null,
                    story: 2,
                    difficultyTarget: 'MODERATE',
                },
            },
        });
        expect(memberProfile.statusCode).toBe(200);
        expect(memberProfile.json().version).toBe(3);
        expect(memberProfile.json().participants.find(
            (participant: { nickname: string }) => participant.nickname === 'Participante'
        )).toMatchObject({
            platforms: ['PC_STEAM'],
            subscriptions: ['PC_GAME_PASS'],
            ownedGames: [{ gameId: '1', platformCode: 'PC_STEAM' }],
            status: 'CONFIGURING',
        });

        const hostView = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}`,
            headers: { cookie: host.cookie },
        });
        const memberInHostView = hostView.json().participants.find(
            (participant: { nickname: string }) => participant.nickname === 'Participante'
        );
        expect(memberInHostView).toMatchObject({
            subscriptions: [],
            ownedGames: [],
            preferences: {
                communication: null,
                skill: null,
                chaos: null,
                strategy: null,
                story: null,
                difficultyTarget: null,
            },
            pcTier: null,
        });
        expect(memberInHostView.preferences.communication).not.toBe(8);

        const staleConstraints = await app.inject({
            method: 'PATCH',
            url: `/api/v1/rooms/${created.room.code}/constraints`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: {
                expectedRoomVersion: 2,
                constraints: memberProfile.json().constraints,
            },
        });
        expect(staleConstraints.statusCode).toBe(409);
        expect(staleConstraints.json()).toMatchObject({ code: 'ROOM_VERSION_CONFLICT', currentVersion: 3 });

        const memberReady = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/participants/me/ready`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { ready: true, expectedRoomVersion: 3 },
        });
        expect(memberReady.statusCode).toBe(200);
        expect(memberReady.json().version).toBe(4);

        const memberConstraints = await app.inject({
            method: 'PATCH',
            url: `/api/v1/rooms/${created.room.code}/constraints`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: {
                expectedRoomVersion: 4,
                constraints: memberReady.json().constraints,
            },
        });
        expect(memberConstraints.statusCode).toBe(403);
        expect(memberConstraints.json()).toMatchObject({ code: 'HOST_ROLE_REQUIRED' });

        const hostReadyWithoutSetup = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/participants/me/ready`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { ready: true, expectedRoomVersion: 4 },
        });
        expect(hostReadyWithoutSetup.statusCode).toBe(422);
        expect(hostReadyWithoutSetup.json()).toMatchObject({ code: 'PARTICIPANT_SETUP_INCOMPLETE' });
    });

    it('keeps collaborative history ownership aligned with the last valid update', async () => {
        const host = await createSession();
        const created = await createRoom(host);
        const member = await createSession();
        const inviteToken = new URL(created.invite.shareUrl).searchParams.get('invite');
        await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Participante', inviteToken },
        });

        const hostAdded = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/history`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { gameId: '1', disposition: 'PLAYED', expectedRoomVersion: 2 },
        });
        expect(hostAdded.statusCode).toBe(200);
        expect(hostAdded.json().version).toBe(3);

        const memberUpdated = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/history`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { gameId: '1', disposition: 'DO_NOT_SHOW', expectedRoomVersion: 3 },
        });
        expect(memberUpdated.statusCode).toBe(200);
        expect(memberUpdated.json().version).toBe(4);
        expect(memberUpdated.json().history).toEqual([
            expect.objectContaining({ gameId: '1', disposition: 'DO_NOT_SHOW' }),
        ]);

        const removed = await app.inject({
            method: 'DELETE',
            url: `/api/v1/rooms/${created.room.code}/history/1`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { expectedRoomVersion: 4 },
        });
        expect(removed.statusCode).toBe(200);
        expect(removed.json()).toMatchObject({ version: 5, history: [] });
    });

    it('materializes candidates once and freezes the lobby under a concurrent-safe start', async () => {
        const host = await createSession();
        const created = await createRoom(host, 'start-room-idempotency');
        const member = await createSession();
        const inviteToken = new URL(created.invite.shareUrl).searchParams.get('invite');
        await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { nickname: 'Participante', inviteToken },
        });

        let version = 2;
        for (const session of [host, member]) {
            const profile = await app.inject({
                method: 'PATCH',
                url: `/api/v1/rooms/${created.room.code}/participants/me/profile`,
                headers: { origin, cookie: session.cookie, 'x-csrf-token': session.csrfToken },
                payload: {
                    expectedRoomVersion: version,
                    platforms: ['PC_STEAM'],
                    subscriptions: [],
                    ownedGames: [],
                    pcTier: 'HIGH',
                    preferences: {
                        communication: null,
                        skill: null,
                        chaos: null,
                        strategy: null,
                        story: null,
                        difficultyTarget: null,
                    },
                },
            });
            expect(profile.statusCode).toBe(200);
            version = profile.json().version;
        }
        for (const session of [host, member]) {
            const ready = await app.inject({
                method: 'PUT',
                url: `/api/v1/rooms/${created.room.code}/participants/me/ready`,
                headers: { origin, cookie: session.cookie, 'x-csrf-token': session.csrfToken },
                payload: { ready: true, expectedRoomVersion: version },
            });
            expect(ready.statusCode).toBe(200);
            version = ready.json().version;
        }
        expect(version).toBe(6);
        await seedDecisionFixture();

        const memberStart = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/start`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { expectedRoomVersion: version },
        });
        expect(memberStart.statusCode).toBe(403);

        const concurrentStarts = await Promise.all([0, 1].map(() => app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/start`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { expectedRoomVersion: version },
        })));
        expect(concurrentStarts.map((response) => response.statusCode).sort()).toEqual([200, 409]);
        const started = concurrentStarts.find((response) => response.statusCode === 200)!;
        expect(started.statusCode).toBe(200);
        expect(started.json()).toMatchObject({
            roomVersion: 7,
            status: 'MATCHING',
            prefilterSummary: { totalConsidered: 243, eligible: 1 },
        });

        const duplicate = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/start`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { expectedRoomVersion: 7 },
        });
        expect(duplicate.statusCode).toBe(409);
        expect(duplicate.json()).toMatchObject({ code: 'ROOM_ALREADY_STARTED' });

        const counts = await database.pool.query<{ candidates: string; participants: string }>(
            `SELECT
                (SELECT COUNT(*) FROM room_candidates WHERE room_id = $1)::text AS candidates,
                (SELECT COUNT(*) FROM room_round_participants WHERE room_id = $1)::text AS participants`,
            [created.room.id]
        );
        expect(counts.rows[0]).toEqual({ candidates: '1', participants: '2' });

        const hostNext = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/cards/next`,
            headers: { cookie: host.cookie },
        });
        expect(hostNext.statusCode).toBe(200);
        expect(hostNext.json()).toMatchObject({
            card: { id: '1' },
            progress: { voted: 0, remaining: 1, matches: 0, target: 5 },
        });

        const invalidCandidate = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/2`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { value: 'YES' },
        });
        expect(invalidCandidate.statusCode).toBe(404);
        expect(invalidCandidate.json()).toMatchObject({ code: 'CANDIDATE_NOT_FOUND' });

        const firstVote = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { value: 'MAYBE' },
        });
        expect(firstVote.statusCode).toBe(200);
        expect(firstVote.json()).toMatchObject({ roomVersion: 8, finalized: false, match: null });

        const changedVote = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { value: 'YES' },
        });
        expect(changedVote.statusCode).toBe(200);
        expect(changedVote.json()).toMatchObject({ roomVersion: 9, finalized: false, match: null });

        const duplicatePartialVote = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { value: 'YES' },
        });
        expect(duplicatePartialVote.statusCode).toBe(200);
        expect(duplicatePartialVote.json()).toMatchObject({ roomVersion: 9, finalized: false, match: null });

        const memberDuringPartial = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/cards/next`,
            headers: { cookie: member.cookie },
        });
        expect(memberDuringPartial.json()).toMatchObject({
            card: { id: '1' },
            progress: { voted: 0, remaining: 1, matches: 0 },
        });
        expect(JSON.stringify(memberDuringPartial.json())).not.toContain('YES');
        const matchesDuringPartial = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/matches`,
            headers: { cookie: member.cookie },
        });
        expect(matchesDuringPartial.json()).toEqual({ matches: [] });

        const concurrentFinalVotes = await Promise.all([0, 1].map(async () => app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { value: 'YES' },
        })));
        expect(concurrentFinalVotes.map((response) => response.statusCode)).toEqual([200, 200]);
        for (const finalVote of concurrentFinalVotes) {
            expect(finalVote.json()).toMatchObject({
            roomVersion: 10,
            finalized: true,
            match: { gameId: '1', kind: 'PERFECT' },
            progress: { voted: 1, remaining: 0, matches: 1 },
            });
        }
        const finalizedMatches = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/matches`,
            headers: { cookie: host.cookie },
        });
        expect(finalizedMatches.statusCode).toBe(200);
        expect(finalizedMatches.json().matches).toEqual([
            expect.objectContaining({ gameId: '1', kind: 'PERFECT', yesCount: 2, maybeCount: 0 }),
        ]);

        const duplicateFinalVote = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { value: 'YES' },
        });
        expect(duplicateFinalVote.statusCode).toBe(200);
        expect(duplicateFinalVote.json()).toMatchObject({
            roomVersion: 10,
            finalized: true,
            match: { gameId: '1', kind: 'PERFECT' },
        });

        const lockedVote = await app.inject({
            method: 'PUT',
            url: `/api/v1/rooms/${created.room.code}/votes/1`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { value: 'NO' },
        });
        expect(lockedVote.statusCode).toBe(409);
        expect(lockedVote.json()).toMatchObject({ code: 'VOTE_LOCKED' });

        const hostFinished = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/cards/next`,
            headers: { cookie: host.cookie },
        });
        expect(hostFinished.json()).toMatchObject({ card: null, progress: { remaining: 0, matches: 1 } });

        const memberShortlist = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/shortlist`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { expectedRoomVersion: 10 },
        });
        expect(memberShortlist.statusCode).toBe(403);
        expect(memberShortlist.json()).toMatchObject({ code: 'HOST_ROLE_REQUIRED' });

        const shortlist = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/shortlist`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { expectedRoomVersion: 10 },
        });
        expect(shortlist.statusCode).toBe(200);
        expect(shortlist.json()).toMatchObject({ status: 'SHORTLIST', version: 11, decision: null });

        const details = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/games/1/details`,
            headers: { cookie: member.cookie },
        });
        expect(details.statusCode).toBe(200);
        expect(details.json()).toMatchObject({
            match: { gameId: '1', kind: 'PERFECT' },
            participantAccess: [
                expect.objectContaining({ platformCode: 'PC_STEAM', accessKind: 'PURCHASE_REQUIRED' }),
                expect.objectContaining({ platformCode: 'PC_STEAM', accessKind: 'PURCHASE_REQUIRED' }),
            ],
        });

        const nonFinalistDetails = await app.inject({
            method: 'GET',
            url: `/api/v1/rooms/${created.room.code}/games/2/details`,
            headers: { cookie: member.cookie },
        });
        expect(nonFinalistDetails.statusCode).toBe(404);
        expect(nonFinalistDetails.json()).toMatchObject({ code: 'FINALIST_NOT_FOUND' });

        const memberDecision = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/decision`,
            headers: { origin, cookie: member.cookie, 'x-csrf-token': member.csrfToken },
            payload: { gameId: '1', expectedRoomVersion: 11 },
        });
        expect(memberDecision.statusCode).toBe(403);
        expect(memberDecision.json()).toMatchObject({ code: 'HOST_ROLE_REQUIRED' });

        const invalidDecision = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/decision`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { gameId: '2', expectedRoomVersion: 11 },
        });
        expect(invalidDecision.statusCode).toBe(422);
        expect(invalidDecision.json()).toMatchObject({ code: 'DECISION_MUST_BE_MATCH' });

        const concurrentDecisions = await Promise.all([0, 1].map(() => app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/decision`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { gameId: '1', expectedRoomVersion: 11 },
        })));
        expect(concurrentDecisions.map((response) => response.statusCode)).toEqual([200, 200]);
        for (const completed of concurrentDecisions) {
            expect(completed.json()).toMatchObject({
                status: 'COMPLETED',
                version: 12,
                decision: { gameId: '1', selectedByParticipantId: created.room.currentParticipantId },
            });
        }

        const completedRetry = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/decision`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { gameId: '1', expectedRoomVersion: 11 },
        });
        expect(completedRetry.statusCode).toBe(200);
        expect(completedRetry.json()).toMatchObject({ status: 'COMPLETED', version: 12 });

        const conflictingDecision = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/decision`,
            headers: { origin, cookie: host.cookie, 'x-csrf-token': host.csrfToken },
            payload: { gameId: '2', expectedRoomVersion: 12 },
        });
        expect(conflictingDecision.statusCode).toBe(409);
        expect(conflictingDecision.json()).toMatchObject({ code: 'ROOM_ALREADY_COMPLETED' });

        const gameplay = await app.inject({
            method: 'GET',
            url: '/api/v1/games/1/media/gameplay',
        });
        expect(gameplay.statusCode).toBe(200);
        expect(gameplay.json()).toEqual({ video: null, source: 'YOUTUBE', cached: false });

        const lateSession = await createSession();
        const invalidLateJoin = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: lateSession.cookie, 'x-csrf-token': lateSession.csrfToken },
            payload: { nickname: 'Atrasado', inviteToken: 'invalid-invite-token-012345678901234567890123' },
        });
        expect(invalidLateJoin.statusCode).toBe(404);
        expect(invalidLateJoin.json()).toMatchObject({ code: 'ROOM_NOT_FOUND' });

        const lateJoin = await app.inject({
            method: 'POST',
            url: `/api/v1/rooms/${created.room.code}/join`,
            headers: { origin, cookie: lateSession.cookie, 'x-csrf-token': lateSession.csrfToken },
            payload: { nickname: 'Atrasado', inviteToken },
        });
        expect(lateJoin.statusCode).toBe(409);
        expect(lateJoin.json()).toMatchObject({ code: 'ROOM_ALREADY_STARTED' });

        await database.pool.query(
            `UPDATE rooms
                SET created_at = NOW() - INTERVAL '8 days',
                    expires_at = NOW() - INTERVAL '1 day'
              WHERE id = $1`,
            [created.room.id]
        );
        await database.pool.query(
            `UPDATE guest_sessions
                SET created_at = NOW() - INTERVAL '8 days',
                    expires_at = NOW() - INTERVAL '1 day'`
        );
        await database.pool.query(
            `UPDATE idempotency_keys
                SET expires_at = NOW() - INTERVAL '1 day'`
        );
        const purgeResult = await purgeExpiredData(database.pool);
        expect(purgeResult).toEqual({ rooms: 1, guestSessions: 3, adminSessions: 0, idempotencyKeys: 1 });

        const retainedRows = await database.pool.query<{ table_name: string; count: string }>(
            `SELECT table_name, count
               FROM (
                   SELECT 'rooms' AS table_name, COUNT(*)::text AS count FROM rooms WHERE id = $1
                   UNION ALL SELECT 'participants', COUNT(*)::text FROM room_participants WHERE room_id = $1
                   UNION ALL SELECT 'round_participants', COUNT(*)::text FROM room_round_participants WHERE room_id = $1
                   UNION ALL SELECT 'candidates', COUNT(*)::text FROM room_candidates WHERE room_id = $1
                   UNION ALL SELECT 'votes', COUNT(*)::text FROM room_votes WHERE room_id = $1
                   UNION ALL SELECT 'matches', COUNT(*)::text FROM room_matches WHERE room_id = $1
                   UNION ALL SELECT 'decisions', COUNT(*)::text FROM room_decisions WHERE room_id = $1
               ) AS retained`,
            [created.room.id]
        );
        expect(retainedRows.rows).toEqual([
            { table_name: 'rooms', count: '0' },
            { table_name: 'participants', count: '0' },
            { table_name: 'round_participants', count: '0' },
            { table_name: 'candidates', count: '0' },
            { table_name: 'votes', count: '0' },
            { table_name: 'matches', count: '0' },
            { table_name: 'decisions', count: '0' },
        ]);
    });

    async function seedDecisionFixture(): Promise<void> {
        await database.pool.query(
            `INSERT INTO game_decision_profiles (
                game_id, min_online_players, max_online_players, min_session_minutes,
                max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
                communication, skill, chaos, strategy, story, difficulty_code,
                data_status, source_type, source_url, last_verified_at, updated_at
            ) VALUES (
                '1', 1, 4, 30, 60, 1000, NULL, FALSE,
                5, 5, 5, 5, 5, 'MODERATE', 'COMPLETE', 'ADMIN_IMPORT',
                'https://fixtures.test.invalid/profile', NOW(), NOW()
            );
            INSERT INTO game_platform_offerings (
                id, game_id, platform_code, region_code, online_supported, free_to_play,
                requires_paid_online_subscription, online_requirement_verification_status,
                source_type, source_url, verification_status, last_verified_at, valid_from, valid_until
            ) VALUES (
                '40000000-0000-4000-8000-000000000001', '1', 'PC_STEAM', 'BR', TRUE, FALSE,
                FALSE, 'VERIFIED', 'ADMIN_IMPORT', 'https://fixtures.test.invalid/offering',
                'VERIFIED', NOW(), NOW() - INTERVAL '1 day', NULL
            );
            INSERT INTO game_network_pools (
                id, game_id, pool_code, region_code, source_type, source_url,
                verification_status, last_verified_at, valid_from, valid_until
            ) VALUES (
                '50000000-0000-4000-8000-000000000001', '1', 'FIXTURE_POOL', 'BR',
                'ADMIN_IMPORT', 'https://fixtures.test.invalid/pool', 'VERIFIED', NOW(),
                NOW() - INTERVAL '1 day', NULL
            );
            INSERT INTO game_network_pool_platforms (network_pool_id, platform_code)
            VALUES ('50000000-0000-4000-8000-000000000001', 'PC_STEAM');
            INSERT INTO game_prices (
                id, game_id, platform_code, region_code, store_code, amount_minor,
                currency, regular_amount_minor, quality, source_url, observed_at, valid_until
            ) VALUES (
                '60000000-0000-4000-8000-000000000001', '1', 'PC_STEAM', 'BR',
                'FIXTURE_STORE', 1000, 'BRL', 2000, 'VERIFIED_LOCAL',
                'https://fixtures.test.invalid/price', NOW(), NOW() + INTERVAL '1 day'
            )`
        );
    }
});
