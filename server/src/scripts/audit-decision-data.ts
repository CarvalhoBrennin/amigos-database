import { Pool } from 'pg';
import { StaticJsonCatalogGateway } from '../modules/catalog/static-json-catalog-gateway.js';

const databaseUrl = process.env.DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';
const pool = new Pool({ connectionString: databaseUrl });

try {
    const catalog = await StaticJsonCatalogGateway.create();
    const catalogIds = await catalog.listGameIds();
    const [profiles, offerings, pools, subscriptions, prices] = await Promise.all([
        pool.query<{
            game_id: string;
            data_status: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
            min_online_players: number | null;
            max_online_players: number | null;
            min_session_minutes: number | null;
            max_session_minutes: number | null;
        }>(
            `SELECT game_id, data_status, min_online_players, max_online_players,
                    min_session_minutes, max_session_minutes
               FROM game_decision_profiles`
        ),
        pool.query<{ game_id: string }>('SELECT DISTINCT game_id FROM game_platform_offerings'),
        pool.query<{ game_id: string }>('SELECT DISTINCT game_id FROM game_network_pools'),
        pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM game_subscription_availability
              WHERE verification_status <> 'VERIFIED'
                 OR (valid_until IS NOT NULL AND valid_until < NOW())`
        ),
        pool.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
               FROM game_prices
              WHERE (valid_until IS NOT NULL AND valid_until < NOW())
                 OR (valid_until IS NULL AND observed_at < NOW() - INTERVAL '30 days')`
        ),
    ]);

    const catalogSet = new Set(catalogIds);
    const profileByGame = new Map(profiles.rows
        .filter((profile) => catalogSet.has(profile.game_id))
        .map((profile) => [profile.game_id, profile]));
    const offeringGames = new Set(offerings.rows.map((row) => row.game_id));
    const poolGames = new Set(pools.rows.map((row) => row.game_id));
    const complete = [...profileByGame.values()].filter((profile) => profile.data_status === 'COMPLETE').length;
    const partial = [...profileByGame.values()].filter((profile) => profile.data_status === 'PARTIAL').length;
    const unknown = catalogIds.length - complete - partial;
    const missingOfferings = catalogIds.filter((gameId) => !offeringGames.has(gameId));
    const missingPools = catalogIds.filter((gameId) => !poolGames.has(gameId));
    const missingPlayers = catalogIds.filter((gameId) => {
        const profile = profileByGame.get(gameId);
        return !profile || profile.min_online_players === null || profile.max_online_players === null;
    });
    const missingSessions = catalogIds.filter((gameId) => {
        const profile = profileByGame.get(gameId);
        return !profile || profile.min_session_minutes === null || profile.max_session_minutes === null;
    });

    const lines = [
        `Catalog games: ${catalogIds.length}`,
        `COMPLETE for strict decision rooms: ${complete}`,
        `PARTIAL: ${partial}`,
        `UNKNOWN: ${unknown}`,
        '',
        `Missing platform offerings: ${missingOfferings.length}`,
        `Missing network pools: ${missingPools.length}`,
        `Missing online player count: ${missingPlayers.length}`,
        `Missing session normalization: ${missingSessions.length}`,
        `Subscription records stale: ${subscriptions.rows[0]?.count ?? '0'}`,
        `Price records stale: ${prices.rows[0]?.count ?? '0'}`,
        '',
        `Games missing platform offerings: ${formatIds(missingOfferings)}`,
        `Games missing network pools: ${formatIds(missingPools)}`,
        `Games missing player count: ${formatIds(missingPlayers)}`,
        `Games missing session normalization: ${formatIds(missingSessions)}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
} finally {
    await pool.end();
}

function formatIds(ids: string[]): string {
    return ids.length === 0 ? 'none' : ids.join(', ');
}
