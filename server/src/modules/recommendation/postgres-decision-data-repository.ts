import type { Pool } from 'pg';
import {
    candidateDecisionDataSchema,
    subscriptionCapabilitiesSchema,
    type CandidateDecisionData,
    type SubscriptionCapabilities,
} from '../../../../shared/index.js';
import type { DecisionDataRepository } from './decision-data-repository.js';

interface ProfileRow {
    game_id: string;
    min_online_players: number | null;
    max_online_players: number | null;
    min_session_minutes: number | null;
    max_session_minutes: number | null;
    install_size_mb: number | null;
    min_pc_tier: string | null;
    free_to_play: boolean;
    communication: number | null;
    skill: number | null;
    chaos: number | null;
    strategy: number | null;
    story: number | null;
    difficulty_code: string | null;
    data_status: string;
    source_type: string | null;
    source_url: string | null;
    last_verified_at: Date | null;
}

interface OfferingRow {
    game_id: string;
    platform_code: string;
    region_code: string | null;
    online_supported: boolean;
    free_to_play: boolean;
    requires_paid_online_subscription: boolean | null;
    online_requirement_verification_status: string;
    source_type: string;
    source_url: string | null;
    verification_status: string;
    last_verified_at: Date | null;
    valid_from: Date | null;
    valid_until: Date | null;
}

interface PoolRow {
    id: string;
    game_id: string;
    pool_code: string;
    region_code: string | null;
    source_type: string;
    source_url: string | null;
    verification_status: string;
    last_verified_at: Date | null;
    valid_from: Date | null;
    valid_until: Date | null;
    platform_code: string;
}

interface AvailabilityRow {
    game_id: string;
    plan_code: string;
    platform_code: string;
    region_code: string;
    access_type: string;
    valid_from: Date | null;
    valid_until: Date | null;
    verification_status: string;
    source_type: string;
    source_url: string | null;
    last_verified_at: Date | null;
}

interface PriceRow {
    game_id: string;
    platform_code: string;
    region_code: string;
    store_code: string;
    amount_minor: string | number;
    currency: string;
    regular_amount_minor: string | number | null;
    quality: string;
    source_url: string;
    observed_at: Date;
    valid_until: Date | null;
}

export class PostgresDecisionDataRepository implements DecisionDataRepository {
    constructor(private readonly pool: Pool) {}

    async listCandidateData(gameIds: string[], regionCode: string): Promise<CandidateDecisionData[]> {
        const uniqueGameIds = [...new Set(gameIds)];
        if (uniqueGameIds.length === 0) {
            return [];
        }
        const [profiles, offerings, pools, availability, prices] = await Promise.all([
            this.pool.query<ProfileRow>(
                `SELECT game_id, min_online_players, max_online_players, min_session_minutes,
                        max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
                        communication, skill, chaos, strategy, story, difficulty_code,
                        data_status, source_type, source_url, last_verified_at
                   FROM game_decision_profiles
                  WHERE game_id = ANY($1::varchar[])
                  ORDER BY game_id`,
                [uniqueGameIds]
            ),
            this.pool.query<OfferingRow>(
                `SELECT game_id, platform_code, region_code, online_supported, free_to_play,
                        requires_paid_online_subscription, online_requirement_verification_status,
                        source_type, source_url, verification_status, last_verified_at,
                        valid_from, valid_until
                   FROM game_platform_offerings
                  WHERE game_id = ANY($1::varchar[])
                    AND (region_code IS NULL OR region_code = $2)
                  ORDER BY game_id, platform_code, region_code NULLS FIRST, valid_from DESC NULLS LAST`,
                [uniqueGameIds, regionCode]
            ),
            this.pool.query<PoolRow>(
                `SELECT gnp.id, gnp.game_id, gnp.pool_code, gnp.region_code, gnp.source_type,
                        gnp.source_url, gnp.verification_status, gnp.last_verified_at,
                        gnp.valid_from, gnp.valid_until, gnpp.platform_code
                   FROM game_network_pools gnp
                   JOIN game_network_pool_platforms gnpp ON gnpp.network_pool_id = gnp.id
                  WHERE gnp.game_id = ANY($1::varchar[])
                    AND (gnp.region_code IS NULL OR gnp.region_code = $2)
                  ORDER BY gnp.game_id, gnp.pool_code, gnpp.platform_code`,
                [uniqueGameIds, regionCode]
            ),
            this.pool.query<AvailabilityRow>(
                `SELECT gsa.game_id, sp.code AS plan_code, gsa.platform_code, gsa.region_code,
                        gsa.access_type, gsa.valid_from, gsa.valid_until,
                        gsa.verification_status, gsa.source_type, gsa.source_url,
                        gsa.last_verified_at
                   FROM game_subscription_availability gsa
                   JOIN subscription_plans sp ON sp.id = gsa.subscription_plan_id
                  WHERE gsa.game_id = ANY($1::varchar[])
                    AND gsa.region_code = $2
                  ORDER BY gsa.game_id, sp.code, gsa.platform_code, gsa.access_type, gsa.valid_from DESC NULLS LAST`,
                [uniqueGameIds, regionCode]
            ),
            this.pool.query<PriceRow>(
                `SELECT game_id, platform_code, region_code, store_code, amount_minor,
                        currency, regular_amount_minor, quality, source_url,
                        observed_at, valid_until
                   FROM game_prices
                  WHERE game_id = ANY($1::varchar[])
                    AND region_code = $2
                  ORDER BY game_id, platform_code, store_code, observed_at DESC`,
                [uniqueGameIds, regionCode]
            ),
        ]);

        const offeringsByGame = groupBy(offerings.rows, (row) => row.game_id);
        const availabilityByGame = groupBy(availability.rows, (row) => row.game_id);
        const pricesByGame = groupBy(prices.rows, (row) => row.game_id);
        const poolsByGame = this.mapPools(pools.rows);

        return profiles.rows.map((profile) => candidateDecisionDataSchema.parse({
            gameId: profile.game_id,
            profile: {
                minOnlinePlayers: profile.min_online_players,
                maxOnlinePlayers: profile.max_online_players,
                minSessionMinutes: profile.min_session_minutes,
                maxSessionMinutes: profile.max_session_minutes,
                installSizeMb: profile.install_size_mb,
                minPcTier: profile.min_pc_tier,
                freeToPlay: profile.free_to_play,
                communication: profile.communication,
                skill: profile.skill,
                chaos: profile.chaos,
                strategy: profile.strategy,
                story: profile.story,
                difficultyCode: profile.difficulty_code,
                dataStatus: profile.data_status,
                sourceType: profile.source_type,
                sourceUrl: profile.source_url,
                lastVerifiedAt: toIso(profile.last_verified_at),
            },
            offerings: (offeringsByGame.get(profile.game_id) ?? []).map((row) => ({
                platformCode: row.platform_code,
                regionCode: row.region_code,
                onlineSupported: row.online_supported,
                freeToPlay: row.free_to_play,
                requiresPaidOnlineSubscription: row.requires_paid_online_subscription,
                onlineRequirementVerificationStatus: row.online_requirement_verification_status,
                sourceType: row.source_type,
                sourceUrl: row.source_url,
                verificationStatus: row.verification_status,
                lastVerifiedAt: toIso(row.last_verified_at),
                validFrom: toIso(row.valid_from),
                validUntil: toIso(row.valid_until),
            })),
            networkPools: poolsByGame.get(profile.game_id) ?? [],
            subscriptionAvailability: (availabilityByGame.get(profile.game_id) ?? []).map((row) => ({
                planCode: row.plan_code,
                platformCode: row.platform_code,
                regionCode: row.region_code,
                accessType: row.access_type,
                validFrom: toIso(row.valid_from),
                validUntil: toIso(row.valid_until),
                verificationStatus: row.verification_status,
                sourceType: row.source_type,
                sourceUrl: row.source_url,
                lastVerifiedAt: toIso(row.last_verified_at),
            })),
            prices: (pricesByGame.get(profile.game_id) ?? []).map((row) => ({
                platformCode: row.platform_code,
                regionCode: row.region_code,
                storeCode: row.store_code,
                amountMinor: Number(row.amount_minor),
                currency: row.currency,
                regularAmountMinor: row.regular_amount_minor === null ? null : Number(row.regular_amount_minor),
                quality: row.quality,
                sourceUrl: row.source_url,
                observedAt: row.observed_at.toISOString(),
                validUntil: toIso(row.valid_until),
            })),
        }));
    }

    async getPlanCapabilities(
        planCodes: string[],
        regionCode: string,
        now: Date
    ): Promise<Map<string, SubscriptionCapabilities>> {
        if (planCodes.length === 0) {
            return new Map();
        }
        const result = await this.pool.query<{ code: string; capabilities: unknown }>(
            `SELECT DISTINCT ON (sp.code) sp.code, spr.capabilities
               FROM subscription_plans sp
               JOIN subscription_services ss ON ss.id = sp.service_id
               JOIN subscription_plan_regions spr ON spr.subscription_plan_id = sp.id
              WHERE sp.code = ANY($1::varchar[])
                AND spr.region_code = $2
                AND sp.active = TRUE AND ss.active = TRUE AND spr.active = TRUE
                AND (spr.valid_from IS NULL OR spr.valid_from <= $3)
                AND (spr.valid_until IS NULL OR spr.valid_until >= $3)
              ORDER BY sp.code, spr.valid_from DESC NULLS LAST`,
            [[...new Set(planCodes)], regionCode, now]
        );
        return new Map(result.rows.map((row) => [
            row.code,
            subscriptionCapabilitiesSchema.parse(row.capabilities),
        ]));
    }

    private mapPools(rows: PoolRow[]): Map<string, CandidateDecisionData['networkPools']> {
        const poolsById = new Map<string, CandidateDecisionData['networkPools'][number]>();
        const gameByPool = new Map<string, string>();
        for (const row of rows) {
            gameByPool.set(row.id, row.game_id);
            const existing = poolsById.get(row.id);
            if (existing) {
                existing.platforms.push(row.platform_code as never);
                continue;
            }
            poolsById.set(row.id, {
                poolCode: row.pool_code,
                regionCode: row.region_code as never,
                platforms: [row.platform_code as never],
                sourceType: row.source_type as never,
                sourceUrl: row.source_url,
                verificationStatus: row.verification_status as never,
                lastVerifiedAt: toIso(row.last_verified_at),
                validFrom: toIso(row.valid_from),
                validUntil: toIso(row.valid_until),
            });
        }
        const result = new Map<string, CandidateDecisionData['networkPools']>();
        for (const [poolId, pool] of poolsById) {
            const gameId = gameByPool.get(poolId);
            if (gameId) {
                const current = result.get(gameId) ?? [];
                current.push(pool);
                result.set(gameId, current);
            }
        }
        return result;
    }
}

function groupBy<Row>(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
    const result = new Map<string, Row[]>();
    for (const row of rows) {
        const groupKey = key(row);
        const current = result.get(groupKey) ?? [];
        current.push(row);
        result.set(groupKey, current);
    }
    return result;
}

function toIso(value: Date | null): string | null {
    return value?.toISOString() ?? null;
}
