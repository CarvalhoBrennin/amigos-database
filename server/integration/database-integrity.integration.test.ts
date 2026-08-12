import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabaseConnection, type DatabaseConnection } from '../src/infrastructure/db/client.js';
import { createTestConfig } from '../tests/test-config.js';

const databaseUrl = process.env.TEST_DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';

describe('database integrity constraints', () => {
    let database: DatabaseConnection;

    beforeAll(() => {
        database = createDatabaseConnection(createTestConfig({ databaseUrl }));
    });

    afterAll(async () => {
        await database.close();
    });

    it('rejects invalid decision data and unverifiable reference rows in direct SQL', async () => {
        const client = await database.pool.connect();
        try {
            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_decision_profiles
                    (game_id, data_status, updated_at, min_online_players, max_online_players)
                 VALUES ($1, 'PARTIAL', NOW(), -1, NULL)`,
                [`audit-invalid-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_decision_profiles
                    (game_id, data_status, updated_at, source_url, last_verified_at)
                 VALUES ($1, 'COMPLETE', NOW(), NULL, NULL)`,
                [`audit-missing-provenance-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_decision_profiles
                    (game_id, data_status, updated_at, install_size_mb)
                 VALUES ($1, 'PARTIAL', NOW(), -1)`,
                [`audit-negative-install-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_decision_profiles
                    (game_id, data_status, source_type, source_url, updated_at)
                 VALUES ($1, 'PARTIAL', 'AUDIT', 'https://data.example.invalid/profile', NOW())`,
                [`audit-invalid-source-type-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_platform_offerings
                    (id, game_id, platform_code, online_supported,
                     online_requirement_verification_status, source_type, verification_status)
                 VALUES ($1, $2, 'PC_STEAM', TRUE, 'UNKNOWN', 'AUDIT', 'VERIFIED')`,
                [randomUUID(), `audit-offering-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_network_pools
                    (id, game_id, pool_code, region_code, source_type, verification_status,
                     source_url, last_verified_at)
                 VALUES ($1, $2, 'AUDIT_POOL', 'br', 'AUDIT', 'STALE', NULL, NULL)`,
                [randomUUID(), `audit-region-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');

            await client.query('BEGIN');
            await expect(client.query(
                `INSERT INTO game_network_pools
                    (id, game_id, pool_code, source_type, verification_status)
                 VALUES ($1, $2, 'audit-pool', 'AUDIT', 'VERIFIED')`,
                [randomUUID(), `audit-pool-${randomUUID()}`]
            )).rejects.toMatchObject({ code: '23514' });
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    });

    it('rejects cross-room participant references at the database boundary', async () => {
        const client = await database.pool.connect();
        const roomA = randomUUID();
        const roomB = randomUUID();
        const sessionA = randomUUID();
        const sessionB = randomUUID();
        const participantA = randomUUID();
        const participantB = randomUUID();
        const roomCodeA = `AUD${roomA.slice(0, 9).toUpperCase()}`;
        const roomCodeB = `AUD${roomB.slice(0, 9).toUpperCase()}`;

        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO guest_sessions (id, token_hash, created_at, last_seen_at, expires_at)
                 VALUES ($1, $2, NOW(), NOW(), NOW() + INTERVAL '1 day'),
                        ($3, $4, NOW(), NOW(), NOW() + INTERVAL '1 day')`,
                [sessionA, `audit-session-a-${sessionA}`, sessionB, `audit-session-b-${sessionB}`]
            );
            await client.query(
                `INSERT INTO rooms
                    (id, code, host_guest_session_id, status, version, region_code,
                     constraints, constraints_schema_version, invite_token_hash,
                     created_at, updated_at, expires_at)
                 VALUES ($1, $2, $3, 'LOBBY', 1, 'BR', '{}'::jsonb, 1, $4, NOW(), NOW(), NOW() + INTERVAL '1 day'),
                        ($5, $6, $7, 'LOBBY', 1, 'BR', '{}'::jsonb, 1, $8, NOW(), NOW(), NOW() + INTERVAL '1 day')`,
                [roomA, roomCodeA, sessionA, `invite-a-${roomA}`, roomB, roomCodeB, sessionB, `invite-b-${roomB}`]
            );
            await client.query(
                `INSERT INTO room_participants
                    (id, room_id, guest_session_id, nickname, nickname_normalized,
                     role, status, preferences, preferences_schema_version, joined_at, updated_at)
                 VALUES ($1, $2, $3, 'Host A', 'host a', 'HOST', 'CONFIGURING', '{}'::jsonb, 1, NOW(), NOW()),
                        ($4, $5, $6, 'Host B', 'host b', 'HOST', 'CONFIGURING', '{}'::jsonb, 1, NOW(), NOW())`,
                [participantA, roomA, sessionA, participantB, roomB, sessionB]
            );

            const expectForeignKeyViolation = async (statement: string, params: unknown[]) => {
                await client.query('SAVEPOINT invalid_cross_room_reference');
                await expect(client.query(statement, params)).rejects.toMatchObject({ code: '23503' });
                await client.query('ROLLBACK TO SAVEPOINT invalid_cross_room_reference');
                await client.query('RELEASE SAVEPOINT invalid_cross_room_reference');
            };

            await expectForeignKeyViolation(
                `INSERT INTO room_game_history
                    (room_id, game_id, disposition, created_by_participant_id, created_at)
                 VALUES ($1, 'audit-cross-room-history', 'PLAYED', $2, NOW())`,
                [roomA, participantB]
            );
            await expectForeignKeyViolation(
                `INSERT INTO room_round_participants (room_id, participant_id) VALUES ($1, $2)`,
                [roomA, participantB]
            );
            await expectForeignKeyViolation(
                `INSERT INTO room_votes
                    (room_id, game_id, participant_id, value, created_at, updated_at)
                 VALUES ($1, 'audit-cross-room-vote', $2, 'YES', NOW(), NOW())`,
                [roomA, participantB]
            );
            await expectForeignKeyViolation(
                `INSERT INTO room_decisions (room_id, game_id, selected_by_participant_id, created_at)
                 VALUES ($1, 'audit-cross-room-decision', $2, NOW())`,
                [roomA, participantB]
            );

            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
    });
});
