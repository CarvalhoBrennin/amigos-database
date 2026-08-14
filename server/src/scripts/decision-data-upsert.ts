import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { GameDecisionProfile, GameNetworkPool, GamePlatformOffering } from '../../../shared/index.js';

export interface UpsertCounters {
    inserted: number;
    updated: number;
}

export async function upsertDecisionProfile(
    client: PoolClient,
    gameId: string,
    profile: GameDecisionProfile,
    counters: UpsertCounters
): Promise<void> {
    const query = await client.query<{ inserted: boolean }>(
        `INSERT INTO game_decision_profiles (
            game_id, min_online_players, max_online_players, min_session_minutes,
            max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
            communication, skill, chaos, strategy, story, difficulty_code,
            data_status, source_type, source_url, last_verified_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (game_id) DO UPDATE SET
            min_online_players = EXCLUDED.min_online_players,
            max_online_players = EXCLUDED.max_online_players,
            min_session_minutes = EXCLUDED.min_session_minutes,
            max_session_minutes = EXCLUDED.max_session_minutes,
            install_size_mb = EXCLUDED.install_size_mb,
            min_pc_tier = EXCLUDED.min_pc_tier,
            free_to_play = EXCLUDED.free_to_play,
            communication = EXCLUDED.communication,
            skill = EXCLUDED.skill,
            chaos = EXCLUDED.chaos,
            strategy = EXCLUDED.strategy,
            story = EXCLUDED.story,
            difficulty_code = EXCLUDED.difficulty_code,
            data_status = EXCLUDED.data_status,
            source_type = EXCLUDED.source_type,
            source_url = EXCLUDED.source_url,
            last_verified_at = EXCLUDED.last_verified_at,
            updated_at = EXCLUDED.updated_at
        RETURNING (xmax = 0) AS inserted`,
        [
            gameId, profile.minOnlinePlayers, profile.maxOnlinePlayers,
            profile.minSessionMinutes, profile.maxSessionMinutes, profile.installSizeMb,
            profile.minPcTier, profile.freeToPlay, profile.communication, profile.skill,
            profile.chaos, profile.strategy, profile.story, profile.difficultyCode,
            profile.dataStatus, profile.sourceType, profile.sourceUrl,
            toDate(profile.lastVerifiedAt), new Date(),
        ]
    );
    countUpsert(query.rows[0]?.inserted ?? false, counters);
}

export async function upsertPlatformOffering(
    client: PoolClient,
    gameId: string,
    offering: GamePlatformOffering,
    counters: UpsertCounters
): Promise<void> {
    const query = await client.query<{ inserted: boolean }>(
        `INSERT INTO game_platform_offerings (
            id, game_id, platform_code, region_code, online_supported, free_to_play,
            requires_paid_online_subscription, online_requirement_verification_status,
            source_type, source_url, verification_status, last_verified_at,
            valid_from, valid_until
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (game_id, platform_code, region_code, valid_from) DO UPDATE SET
            online_supported = EXCLUDED.online_supported,
            free_to_play = EXCLUDED.free_to_play,
            requires_paid_online_subscription = EXCLUDED.requires_paid_online_subscription,
            online_requirement_verification_status = EXCLUDED.online_requirement_verification_status,
            source_type = EXCLUDED.source_type,
            source_url = EXCLUDED.source_url,
            verification_status = EXCLUDED.verification_status,
            last_verified_at = EXCLUDED.last_verified_at,
            valid_until = EXCLUDED.valid_until
        RETURNING (xmax = 0) AS inserted`,
        [
            randomUUID(), gameId, offering.platformCode, offering.regionCode,
            offering.onlineSupported, offering.freeToPlay,
            offering.requiresPaidOnlineSubscription,
            offering.onlineRequirementVerificationStatus, offering.sourceType,
            offering.sourceUrl, offering.verificationStatus,
            toDate(offering.lastVerifiedAt), toDate(offering.validFrom), toDate(offering.validUntil),
        ]
    );
    countUpsert(query.rows[0]?.inserted ?? false, counters);
}

export async function upsertNetworkPool(
    client: PoolClient,
    gameId: string,
    networkPool: GameNetworkPool,
    counters: UpsertCounters
): Promise<void> {
    const existing = await client.query<{ id: string }>(
        `SELECT id FROM game_network_pools
          WHERE game_id = $1 AND pool_code = $2
            AND region_code IS NOT DISTINCT FROM $3
            AND valid_from IS NOT DISTINCT FROM $4`,
        [gameId, networkPool.poolCode, networkPool.regionCode, toDate(networkPool.validFrom)]
    );
    const poolId = existing.rows[0]?.id ?? randomUUID();
    if (existing.rowCount) {
        await client.query(
            `UPDATE game_network_pools SET source_type=$2, source_url=$3,
                    verification_status=$4, last_verified_at=$5, valid_until=$6
              WHERE id=$1`,
            [poolId, networkPool.sourceType, networkPool.sourceUrl, networkPool.verificationStatus,
                toDate(networkPool.lastVerifiedAt), toDate(networkPool.validUntil)]
        );
        counters.updated += 1;
    } else {
        await client.query(
            `INSERT INTO game_network_pools (
                id, game_id, pool_code, region_code, source_type, source_url,
                verification_status, last_verified_at, valid_from, valid_until
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [poolId, gameId, networkPool.poolCode, networkPool.regionCode, networkPool.sourceType,
                networkPool.sourceUrl, networkPool.verificationStatus,
                toDate(networkPool.lastVerifiedAt), toDate(networkPool.validFrom), toDate(networkPool.validUntil)]
        );
        counters.inserted += 1;
    }
    await client.query('DELETE FROM game_network_pool_platforms WHERE network_pool_id = $1', [poolId]);
    await client.query(
        `INSERT INTO game_network_pool_platforms (network_pool_id, platform_code)
         SELECT $1, code FROM UNNEST($2::varchar[]) AS code`,
        [poolId, networkPool.platforms]
    );
}

function countUpsert(inserted: boolean, counters: UpsertCounters): void {
    if (inserted) counters.inserted += 1;
    else counters.updated += 1;
}

function toDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
}
