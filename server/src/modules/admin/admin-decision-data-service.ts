import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
    GameDecisionProfile,
    GameNetworkPool,
    GamePlatformOffering,
    GamePrice,
    GameSubscriptionAvailability,
} from '../../../../shared/index.js';
import type { Clock } from '../../lib/clock.js';
import { AppError } from '../../lib/errors.js';
import type { CatalogGateway } from '../catalog/catalog-gateway.js';
import type { AdminAuditService } from './admin-audit-service.js';

interface PageOptions {
    page: number;
    pageSize: number;
}

interface AuditContext {
    actorId: string;
    requestId: string;
}

type DecisionResource = 'offering' | 'network-pool' | 'subscription-availability' | 'price';

export class AdminDecisionDataService {
    constructor(
        private readonly pool: Pool,
        private readonly clock: Clock,
        private readonly catalog: CatalogGateway,
        private readonly audit: AdminAuditService
    ) {}

    async listCatalog(options: PageOptions & { search?: string; status?: string }) {
        const [games, aggregates] = await Promise.all([
            this.catalog.listGames(),
            this.pool.query<{
                game_id: string;
                data_status: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | null;
                offerings_count: number;
                pools_count: number;
                subscriptions_count: number;
                prices_count: number;
            }>(
                `SELECT catalog_ids.game_id, profile.data_status,
                        COALESCE(offers.count, 0)::int AS offerings_count,
                        COALESCE(pools.count, 0)::int AS pools_count,
                        COALESCE(subscriptions.count, 0)::int AS subscriptions_count,
                        COALESCE(prices.count, 0)::int AS prices_count
                   FROM (
                        SELECT game_id FROM game_decision_profiles
                        UNION SELECT game_id FROM game_platform_offerings
                        UNION SELECT game_id FROM game_network_pools
                        UNION SELECT game_id FROM game_subscription_availability
                        UNION SELECT game_id FROM game_prices
                   ) catalog_ids
                   LEFT JOIN game_decision_profiles profile ON profile.game_id = catalog_ids.game_id
                   LEFT JOIN (SELECT game_id, COUNT(*)::int AS count FROM game_platform_offerings GROUP BY game_id) offers ON offers.game_id = catalog_ids.game_id
                   LEFT JOIN (SELECT game_id, COUNT(*)::int AS count FROM game_network_pools GROUP BY game_id) pools ON pools.game_id = catalog_ids.game_id
                   LEFT JOIN (SELECT game_id, COUNT(*)::int AS count FROM game_subscription_availability GROUP BY game_id) subscriptions ON subscriptions.game_id = catalog_ids.game_id
                   LEFT JOIN (SELECT game_id, COUNT(*)::int AS count FROM game_prices GROUP BY game_id) prices ON prices.game_id = catalog_ids.game_id`
            ),
        ]);
        const byGame = new Map(aggregates.rows.map((row) => [row.game_id, row]));
        const search = normalizeSearch(options.search ?? '');
        const mapped = games
            .map((game) => {
                const aggregate = byGame.get(game.id);
                return {
                    id: game.id,
                    title: game.title,
                    imageUrl: game.imageUrl,
                    type: game.type,
                    year: game.year,
                    decisionDataStatus: aggregate?.data_status ?? 'MISSING' as const,
                    offeringsCount: aggregate?.offerings_count ?? 0,
                    networkPoolsCount: aggregate?.pools_count ?? 0,
                    subscriptionRecordsCount: aggregate?.subscriptions_count ?? 0,
                    priceRecordsCount: aggregate?.prices_count ?? 0,
                };
            })
            .filter((game) => !search || normalizeSearch(`${game.id} ${game.title}`).includes(search))
            .filter((game) => !options.status || game.decisionDataStatus === options.status)
            .sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'));
        const start = (options.page - 1) * options.pageSize;
        return {
            games: mapped.slice(start, start + options.pageSize),
            meta: pageMeta(options, mapped.length),
        };
    }

    async getGame(gameId: string) {
        const game = await this.requireGame(gameId);
        const [profileResult, offerings, pools, availability, prices] = await Promise.all([
            this.pool.query<{
                min_online_players: number | null;
                max_online_players: number | null;
                min_session_minutes: number | null;
                max_session_minutes: number | null;
                install_size_mb: number | null;
                min_pc_tier: GameDecisionProfile['minPcTier'];
                free_to_play: boolean;
                communication: number | null;
                skill: number | null;
                chaos: number | null;
                strategy: number | null;
                story: number | null;
                difficulty_code: GameDecisionProfile['difficultyCode'];
                data_status: GameDecisionProfile['dataStatus'];
                source_type: GameDecisionProfile['sourceType'];
                source_url: string | null;
                last_verified_at: Date | null;
            }>(
                `SELECT min_online_players, max_online_players, min_session_minutes,
                        max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
                        communication, skill, chaos, strategy, story, difficulty_code,
                        data_status, source_type, source_url, last_verified_at
                   FROM game_decision_profiles WHERE game_id = $1`,
                [gameId]
            ),
            this.pool.query<{
                id: string;
                platform_code: string;
                region_code: string | null;
                online_supported: boolean;
                free_to_play: boolean;
                requires_paid_online_subscription: boolean | null;
                online_requirement_verification_status: GamePlatformOffering['onlineRequirementVerificationStatus'];
                source_type: GamePlatformOffering['sourceType'];
                source_url: string | null;
                verification_status: GamePlatformOffering['verificationStatus'];
                last_verified_at: Date | null;
                valid_from: Date | null;
                valid_until: Date | null;
            }>(
                `SELECT id, platform_code, region_code, online_supported, free_to_play,
                        requires_paid_online_subscription, online_requirement_verification_status,
                        source_type, source_url, verification_status, last_verified_at,
                        valid_from, valid_until
                   FROM game_platform_offerings
                  WHERE game_id = $1
                  ORDER BY platform_code, valid_from DESC NULLS LAST`,
                [gameId]
            ),
            this.pool.query<{
                id: string;
                pool_code: string;
                region_code: string | null;
                source_type: GameNetworkPool['sourceType'];
                source_url: string | null;
                verification_status: GameNetworkPool['verificationStatus'];
                last_verified_at: Date | null;
                valid_from: Date | null;
                valid_until: Date | null;
                platforms: string[];
            }>(
                `SELECT pool.id, pool.pool_code, pool.region_code, pool.source_type,
                        pool.source_url, pool.verification_status, pool.last_verified_at,
                        pool.valid_from, pool.valid_until,
                        COALESCE(array_agg(platform.platform_code ORDER BY platform.platform_code)
                            FILTER (WHERE platform.platform_code IS NOT NULL), '{}') AS platforms
                   FROM game_network_pools pool
                   LEFT JOIN game_network_pool_platforms platform ON platform.network_pool_id = pool.id
                  WHERE pool.game_id = $1
                  GROUP BY pool.id
                  ORDER BY pool.pool_code, pool.valid_from DESC NULLS LAST`,
                [gameId]
            ),
            this.pool.query<{
                id: string;
                plan_code: string;
                platform_code: string;
                region_code: string;
                access_type: GameSubscriptionAvailability['accessType'];
                valid_from: Date | null;
                valid_until: Date | null;
                verification_status: GameSubscriptionAvailability['verificationStatus'];
                source_type: GameSubscriptionAvailability['sourceType'];
                source_url: string | null;
                last_verified_at: Date | null;
            }>(
                `SELECT availability.id, plan.code AS plan_code, availability.platform_code,
                        availability.region_code, availability.access_type,
                        availability.valid_from, availability.valid_until,
                        availability.verification_status, availability.source_type,
                        availability.source_url, availability.last_verified_at
                   FROM game_subscription_availability availability
                   JOIN subscription_plans plan ON plan.id = availability.subscription_plan_id
                  WHERE availability.game_id = $1
                  ORDER BY plan.code, availability.platform_code, availability.valid_from DESC NULLS LAST`,
                [gameId]
            ),
            this.pool.query<{
                id: string;
                platform_code: string;
                region_code: string;
                store_code: string;
                amount_minor: string | number;
                currency: string;
                regular_amount_minor: string | number | null;
                quality: GamePrice['quality'];
                source_url: string;
                observed_at: Date;
                valid_until: Date | null;
            }>(
                `SELECT id, platform_code, region_code, store_code, amount_minor,
                        currency, regular_amount_minor, quality, source_url,
                        observed_at, valid_until
                   FROM game_prices WHERE game_id = $1
                  ORDER BY observed_at DESC, id`,
                [gameId]
            ),
        ]);
        const profile = profileResult.rows[0];
        return {
            game: { id: game.id, title: game.title, imageUrl: game.imageUrl },
            profile: profile ? {
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
            } : null,
            offerings: offerings.rows.map((row) => ({
                id: row.id,
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
            networkPools: pools.rows.map((row) => ({
                id: row.id,
                poolCode: row.pool_code,
                regionCode: row.region_code,
                platforms: row.platforms,
                sourceType: row.source_type,
                sourceUrl: row.source_url,
                verificationStatus: row.verification_status,
                lastVerifiedAt: toIso(row.last_verified_at),
                validFrom: toIso(row.valid_from),
                validUntil: toIso(row.valid_until),
            })),
            subscriptionAvailability: availability.rows.map((row) => ({
                id: row.id,
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
            prices: prices.rows.map((row) => ({
                id: row.id,
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
        };
    }

    async upsertProfile(gameId: string, profile: GameDecisionProfile, context: AuditContext) {
        await this.requireGame(gameId);
        const now = this.clock.now();
        await withTransaction(this.pool, async (client) => {
            await client.query(
                `INSERT INTO game_decision_profiles (
                    game_id, min_online_players, max_online_players, min_session_minutes,
                    max_session_minutes, install_size_mb, min_pc_tier, free_to_play,
                    communication, skill, chaos, strategy, story, difficulty_code,
                    data_status, source_type, source_url, last_verified_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
                ON CONFLICT (game_id) DO UPDATE SET
                    min_online_players=EXCLUDED.min_online_players,
                    max_online_players=EXCLUDED.max_online_players,
                    min_session_minutes=EXCLUDED.min_session_minutes,
                    max_session_minutes=EXCLUDED.max_session_minutes,
                    install_size_mb=EXCLUDED.install_size_mb,
                    min_pc_tier=EXCLUDED.min_pc_tier,
                    free_to_play=EXCLUDED.free_to_play,
                    communication=EXCLUDED.communication,
                    skill=EXCLUDED.skill,
                    chaos=EXCLUDED.chaos,
                    strategy=EXCLUDED.strategy,
                    story=EXCLUDED.story,
                    difficulty_code=EXCLUDED.difficulty_code,
                    data_status=EXCLUDED.data_status,
                    source_type=EXCLUDED.source_type,
                    source_url=EXCLUDED.source_url,
                    last_verified_at=EXCLUDED.last_verified_at,
                    updated_at=EXCLUDED.updated_at`,
                [
                    gameId,
                    profile.minOnlinePlayers,
                    profile.maxOnlinePlayers,
                    profile.minSessionMinutes,
                    profile.maxSessionMinutes,
                    profile.installSizeMb,
                    profile.minPcTier,
                    profile.freeToPlay,
                    profile.communication,
                    profile.skill,
                    profile.chaos,
                    profile.strategy,
                    profile.story,
                    profile.difficultyCode,
                    profile.dataStatus,
                    profile.sourceType,
                    profile.sourceUrl,
                    dateOrNull(profile.lastVerifiedAt),
                    now,
                ]
            );
            await this.audit.record({
                adminUserId: context.actorId,
                action: 'DECISION_PROFILE_UPSERTED',
                entityType: 'GAME_DECISION_PROFILE',
                entityId: gameId,
                requestId: context.requestId,
                metadata: { dataStatus: profile.dataStatus },
            }, client);
        });
        return this.getGame(gameId);
    }

    async deleteProfile(gameId: string, context: AuditContext) {
        await this.requireGame(gameId);
        await withTransaction(this.pool, async (client) => {
            const result = await client.query(
                'DELETE FROM game_decision_profiles WHERE game_id = $1 RETURNING game_id',
                [gameId]
            );
            if (result.rowCount === 0) {
                throw new AppError({ status: 404, code: 'ADMIN_DECISION_PROFILE_NOT_FOUND', title: 'Perfil de decisão não encontrado' });
            }
            await this.audit.record({
                adminUserId: context.actorId,
                action: 'DECISION_PROFILE_DELETED',
                entityType: 'GAME_DECISION_PROFILE',
                entityId: gameId,
                requestId: context.requestId,
            }, client);
        });
        return this.getGame(gameId);
    }

    async saveOffering(gameId: string, data: GamePlatformOffering, context: AuditContext, id?: string) {
        await this.requireGame(gameId);
        const resourceId = id ?? randomUUID();
        try {
            await withTransaction(this.pool, async (client) => {
                const result = await client.query(
                    `INSERT INTO game_platform_offerings (
                        id, game_id, platform_code, region_code, online_supported, free_to_play,
                        requires_paid_online_subscription, online_requirement_verification_status,
                        source_type, source_url, verification_status, last_verified_at, valid_from, valid_until
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                    ON CONFLICT (id) DO UPDATE SET
                        platform_code=EXCLUDED.platform_code, region_code=EXCLUDED.region_code,
                        online_supported=EXCLUDED.online_supported, free_to_play=EXCLUDED.free_to_play,
                        requires_paid_online_subscription=EXCLUDED.requires_paid_online_subscription,
                        online_requirement_verification_status=EXCLUDED.online_requirement_verification_status,
                        source_type=EXCLUDED.source_type, source_url=EXCLUDED.source_url,
                        verification_status=EXCLUDED.verification_status,
                        last_verified_at=EXCLUDED.last_verified_at, valid_from=EXCLUDED.valid_from,
                        valid_until=EXCLUDED.valid_until
                    WHERE game_platform_offerings.game_id = EXCLUDED.game_id
                    RETURNING id`,
                    [
                        resourceId,
                        gameId,
                        data.platformCode,
                        data.regionCode,
                        data.onlineSupported,
                        data.freeToPlay,
                        data.requiresPaidOnlineSubscription,
                        data.onlineRequirementVerificationStatus,
                        data.sourceType,
                        data.sourceUrl,
                        data.verificationStatus,
                        dateOrNull(data.lastVerifiedAt),
                        dateOrNull(data.validFrom),
                        dateOrNull(data.validUntil),
                    ]
                );
                this.assertResourceSaved(result.rowCount, id);
                await this.recordResourceAudit(context, id ? 'UPDATED' : 'CREATED', 'GAME_PLATFORM_OFFERING', resourceId, gameId, client);
            });
        } catch (error) {
            throwDecisionConflict(error);
        }
        return this.getGame(gameId);
    }

    async saveNetworkPool(gameId: string, data: GameNetworkPool, context: AuditContext, id?: string) {
        await this.requireGame(gameId);
        const resourceId = id ?? randomUUID();
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const saved = await client.query(
                `INSERT INTO game_network_pools (
                    id, game_id, pool_code, region_code, source_type, source_url,
                    verification_status, last_verified_at, valid_from, valid_until
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (id) DO UPDATE SET
                    pool_code=EXCLUDED.pool_code, region_code=EXCLUDED.region_code,
                    source_type=EXCLUDED.source_type, source_url=EXCLUDED.source_url,
                    verification_status=EXCLUDED.verification_status,
                    last_verified_at=EXCLUDED.last_verified_at, valid_from=EXCLUDED.valid_from,
                    valid_until=EXCLUDED.valid_until
                WHERE game_network_pools.game_id = EXCLUDED.game_id
                RETURNING id`,
                [
                    resourceId,
                    gameId,
                    data.poolCode,
                    data.regionCode,
                    data.sourceType,
                    data.sourceUrl,
                    data.verificationStatus,
                    dateOrNull(data.lastVerifiedAt),
                    dateOrNull(data.validFrom),
                    dateOrNull(data.validUntil),
                ]
            );
            this.assertResourceSaved(saved.rowCount, id);
            await client.query('DELETE FROM game_network_pool_platforms WHERE network_pool_id = $1', [resourceId]);
            for (const platformCode of data.platforms) {
                await client.query(
                    'INSERT INTO game_network_pool_platforms (network_pool_id, platform_code) VALUES ($1,$2)',
                    [resourceId, platformCode]
                );
            }
            await this.recordResourceAudit(
                context,
                id ? 'UPDATED' : 'CREATED',
                'GAME_NETWORK_POOL',
                resourceId,
                gameId,
                client
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throwDecisionConflict(error);
        } finally {
            client.release();
        }
        return this.getGame(gameId);
    }

    async saveSubscriptionAvailability(
        gameId: string,
        data: GameSubscriptionAvailability,
        context: AuditContext,
        id?: string
    ) {
        await this.requireGame(gameId);
        const resourceId = id ?? randomUUID();
        try {
            await withTransaction(this.pool, async (client) => {
                const plan = await client.query<{ id: string }>(
                    'SELECT id FROM subscription_plans WHERE code = $1',
                    [data.planCode]
                );
                const planId = plan.rows[0]?.id;
                if (!planId) throw new AppError({ status: 400, code: 'ADMIN_PLAN_NOT_FOUND', title: 'Plano de assinatura não encontrado' });
                const saved = await client.query(
                    `INSERT INTO game_subscription_availability (
                        id, game_id, subscription_plan_id, platform_code, region_code,
                        access_type, valid_from, valid_until, verification_status,
                        source_type, source_url, last_verified_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (id) DO UPDATE SET
                        subscription_plan_id=EXCLUDED.subscription_plan_id,
                        platform_code=EXCLUDED.platform_code, region_code=EXCLUDED.region_code,
                        access_type=EXCLUDED.access_type, valid_from=EXCLUDED.valid_from,
                        valid_until=EXCLUDED.valid_until, verification_status=EXCLUDED.verification_status,
                        source_type=EXCLUDED.source_type, source_url=EXCLUDED.source_url,
                        last_verified_at=EXCLUDED.last_verified_at
                    WHERE game_subscription_availability.game_id = EXCLUDED.game_id
                    RETURNING id`,
                    [
                        resourceId,
                        gameId,
                        planId,
                        data.platformCode,
                        data.regionCode,
                        data.accessType,
                        dateOrNull(data.validFrom),
                        dateOrNull(data.validUntil),
                        data.verificationStatus,
                        data.sourceType,
                        data.sourceUrl,
                        dateOrNull(data.lastVerifiedAt),
                    ]
                );
                this.assertResourceSaved(saved.rowCount, id);
                await this.recordResourceAudit(context, id ? 'UPDATED' : 'CREATED', 'GAME_SUBSCRIPTION_AVAILABILITY', resourceId, gameId, client);
            });
        } catch (error) {
            throwDecisionConflict(error);
        }
        return this.getGame(gameId);
    }

    async savePrice(gameId: string, data: GamePrice, context: AuditContext, id?: string) {
        await this.requireGame(gameId);
        const resourceId = id ?? randomUUID();
        try {
            await withTransaction(this.pool, async (client) => {
                const saved = await client.query(
                    `INSERT INTO game_prices (
                        id, game_id, platform_code, region_code, store_code, amount_minor,
                        currency, regular_amount_minor, quality, source_url, observed_at, valid_until
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (id) DO UPDATE SET
                        platform_code=EXCLUDED.platform_code, region_code=EXCLUDED.region_code,
                        store_code=EXCLUDED.store_code, amount_minor=EXCLUDED.amount_minor,
                        currency=EXCLUDED.currency, regular_amount_minor=EXCLUDED.regular_amount_minor,
                        quality=EXCLUDED.quality, source_url=EXCLUDED.source_url,
                        observed_at=EXCLUDED.observed_at, valid_until=EXCLUDED.valid_until
                    WHERE game_prices.game_id = EXCLUDED.game_id
                    RETURNING id`,
                    [
                        resourceId,
                        gameId,
                        data.platformCode,
                        data.regionCode,
                        data.storeCode,
                        data.amountMinor,
                        data.currency,
                        data.regularAmountMinor,
                        data.quality,
                        data.sourceUrl,
                        dateOrNull(data.observedAt),
                        dateOrNull(data.validUntil),
                    ]
                );
                this.assertResourceSaved(saved.rowCount, id);
                await this.recordResourceAudit(context, id ? 'UPDATED' : 'CREATED', 'GAME_PRICE', resourceId, gameId, client);
            });
        } catch (error) {
            throwDecisionConflict(error);
        }
        return this.getGame(gameId);
    }

    async deleteResource(gameId: string, resource: DecisionResource, id: string, context: AuditContext) {
        await this.requireGame(gameId);
        const table = {
            offering: 'game_platform_offerings',
            'network-pool': 'game_network_pools',
            'subscription-availability': 'game_subscription_availability',
            price: 'game_prices',
        }[resource];
        await withTransaction(this.pool, async (client) => {
            const result = await client.query(
                `DELETE FROM ${table} WHERE id = $1 AND game_id = $2 RETURNING id`,
                [id, gameId]
            );
            if (result.rowCount === 0) throw new AppError({ status: 404, code: 'ADMIN_DECISION_RESOURCE_NOT_FOUND', title: 'Registro de decisão não encontrado' });
            await this.recordResourceAudit(context, 'DELETED', resource.toUpperCase().replaceAll('-', '_'), id, gameId, client);
        });
        return this.getGame(gameId);
    }

    private async requireGame(gameId: string) {
        const game = await this.catalog.getGameById(gameId, 'pt');
        if (!game) throw new AppError({ status: 404, code: 'ADMIN_CATALOG_GAME_NOT_FOUND', title: 'Jogo não encontrado no catálogo' });
        return game;
    }

    private assertResourceSaved(rowCount: number | null, id: string | undefined): void {
        if (id && rowCount === 0) {
            throw new AppError({ status: 404, code: 'ADMIN_DECISION_RESOURCE_NOT_FOUND', title: 'Registro de decisão não encontrado' });
        }
    }

    private async recordResourceAudit(
        context: AuditContext,
        operation: 'CREATED' | 'UPDATED' | 'DELETED',
        entityType: string,
        entityId: string,
        gameId: string,
        client?: PoolClient
    ): Promise<void> {
        await this.audit.record({
            adminUserId: context.actorId,
            action: `${entityType}_${operation}`,
            entityType,
            entityId,
            requestId: context.requestId,
            metadata: { gameId },
        }, client);
    }
}

function normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function dateOrNull(value: string | null): Date | null {
    return value ? new Date(value) : null;
}

function toIso(value: Date | null): string | null {
    return value?.toISOString() ?? null;
}

function pageMeta(options: PageOptions, total: number) {
    return {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / options.pageSize),
    };
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

function throwDecisionConflict(error: unknown): never {
    if (isDatabaseError(error, '23505')) {
        throw new AppError({
            status: 409,
            code: 'ADMIN_DECISION_RECORD_CONFLICT',
            title: 'Já existe um registro de decisão com a mesma identidade',
        });
    }
    if (isDatabaseError(error, '23503')) {
        throw new AppError({
            status: 409,
            code: 'ADMIN_DECISION_REFERENCE_INVALID',
            title: 'A plataforma ou assinatura informada não existe mais',
        });
    }
    throw error;
}

function isDatabaseError(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
