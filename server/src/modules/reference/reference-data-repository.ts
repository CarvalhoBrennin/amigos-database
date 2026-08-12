import type { Pool } from 'pg';
import {
    platformReferenceSchema,
    subscriptionCapabilitiesSchema,
    subscriptionPlanReferenceSchema,
    type PlatformReference,
    type SubscriptionPlanReference,
} from '../../../../shared/index.js';
import type { Clock } from '../../lib/clock.js';

interface PlatformRow {
    code: string;
    family: string;
    display_name: string;
    active: boolean;
    sort_order: number;
}

interface SubscriptionPlanRow {
    id: string;
    service_code: string;
    service_display_name: string;
    code: string;
    display_name: string;
    region_code: string;
    active: boolean;
    capabilities: unknown;
    sort_order: number;
    source_url: string | null;
    last_verified_at: Date | null;
}

export class ReferenceDataRepository {
    constructor(private readonly pool: Pool, private readonly clock: Clock) {}

    async listPlatforms(): Promise<PlatformReference[]> {
        const result = await this.pool.query<PlatformRow>(
            `SELECT code, family, display_name, active, sort_order
               FROM platform_references
              WHERE active = TRUE
              ORDER BY sort_order, code`
        );
        return result.rows.map((row) => platformReferenceSchema.parse({
            code: row.code,
            family: row.family,
            displayName: row.display_name,
            active: row.active,
            sortOrder: row.sort_order,
        }));
    }

    async listSubscriptionPlans(regionCode: string): Promise<SubscriptionPlanReference[]> {
        const result = await this.pool.query<SubscriptionPlanRow>(
            `SELECT sp.id,
                    ss.code AS service_code,
                    ss.display_name AS service_display_name,
                    sp.code,
                    sp.display_name,
                    spr.region_code,
                    spr.active,
                    spr.capabilities,
                    sp.sort_order,
                    spr.source_url,
                    spr.last_verified_at
               FROM subscription_plans sp
               JOIN subscription_services ss ON ss.id = sp.service_id
               JOIN subscription_plan_regions spr ON spr.subscription_plan_id = sp.id
              WHERE spr.region_code = $1
                AND sp.active = TRUE
                AND ss.active = TRUE
                AND spr.active = TRUE
                AND (spr.valid_from IS NULL OR spr.valid_from <= $2)
                AND (spr.valid_until IS NULL OR spr.valid_until >= $2)
              ORDER BY sp.sort_order, sp.code`,
            [regionCode, this.clock.now()]
        );
        return result.rows.map((row) => subscriptionPlanReferenceSchema.parse({
            id: row.id,
            serviceCode: row.service_code,
            serviceDisplayName: row.service_display_name,
            code: row.code,
            displayName: row.display_name,
            regionCode: row.region_code,
            active: row.active,
            capabilities: subscriptionCapabilitiesSchema.parse(row.capabilities),
            sortOrder: row.sort_order,
            sourceUrl: row.source_url,
            verifiedAt: row.last_verified_at?.toISOString() ?? null,
        }));
    }
}
