import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { subscriptionAvailabilityImportSchema } from '../../../shared/index.js';
import { StaticJsonCatalogGateway } from '../modules/catalog/static-json-catalog-gateway.js';
import {
    assertNotUnreasonablyFuture,
    formatImportError,
    parseImportOptions,
    printReport,
    readJsonFile,
    runInTransaction,
    type ImportReport,
} from './import-utils.js';

const databaseUrl = process.env.DATABASE_URL
    ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos';
const pool = new Pool({ connectionString: databaseUrl });

try {
    const options = parseImportOptions(process.argv.slice(2));
    const data = subscriptionAvailabilityImportSchema.parse(await readJsonFile(options.filePath));
    const catalog = await StaticJsonCatalogGateway.create();
    const catalogIds = new Set(await catalog.listGameIds());
    const unknownGames = data.records.filter((record) => !catalogIds.has(record.gameId)).map((record) => record.gameId);
    if (unknownGames.length > 0) {
        throw new Error(`Unknown catalog game IDs: ${[...new Set(unknownGames)].join(', ')}`);
    }
    const now = new Date();
    for (const record of data.records) {
        assertNotUnreasonablyFuture(record.lastVerifiedAt, now, `${record.gameId}.lastVerifiedAt`);
    }
    const references = await loadReferences(
        data.records.map((record) => record.planCode),
        data.records.map((record) => record.platformCode),
        data.records.map((record) => record.regionCode),
        now
    );

    if (!options.apply) {
        printReport({ mode: 'dry-run', inserted: 0, updated: 0, skipped: data.records.length, errors: 0 });
    } else {
        const report = await runInTransaction(pool, async (client) => {
            const result: ImportReport = { mode: 'apply', inserted: 0, updated: 0, skipped: 0, errors: 0 };
            for (const record of data.records) {
                const planId = references.planIds.get(`${record.planCode}:${record.regionCode}`);
                if (!planId) {
                    throw new Error(`Plan ${record.planCode} is not active in ${record.regionCode}.`);
                }
                const query = await client.query<{ inserted: boolean }>(
                    `INSERT INTO game_subscription_availability (
                        id, game_id, subscription_plan_id, platform_code, region_code,
                        access_type, valid_from, valid_until, verification_status,
                        source_type, source_url, last_verified_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (
                        game_id, subscription_plan_id, platform_code, region_code, access_type, valid_from
                    ) DO UPDATE SET
                        valid_until = EXCLUDED.valid_until,
                        verification_status = EXCLUDED.verification_status,
                        source_type = EXCLUDED.source_type,
                        source_url = EXCLUDED.source_url,
                        last_verified_at = EXCLUDED.last_verified_at
                    RETURNING (xmax = 0) AS inserted`,
                    [
                        randomUUID(), record.gameId, planId, record.platformCode, record.regionCode,
                        record.accessType, toDate(record.validFrom), toDate(record.validUntil),
                        record.verificationStatus === 'VERIFIED' ? 'VERIFIED' : 'UNKNOWN',
                        mapSourceType(record.sourceType), record.sourceUrl, new Date(record.lastVerifiedAt),
                    ]
                );
                if (query.rows[0]?.inserted) result.inserted += 1;
                else result.updated += 1;
            }
            return result;
        });
        printReport(report);
    }
} catch (error) {
    process.stderr.write(`${formatImportError(error)}\n`);
    process.exitCode = 1;
} finally {
    await pool.end();
}

async function loadReferences(
    planCodes: string[],
    platformCodes: string[],
    regionCodes: string[],
    now: Date
): Promise<{ planIds: Map<string, string> }> {
    const uniquePlatforms = [...new Set(platformCodes)];
    const platforms = await pool.query<{ code: string }>(
        'SELECT code FROM platform_references WHERE code = ANY($1::varchar[])',
        [uniquePlatforms]
    );
    if (platforms.rowCount !== uniquePlatforms.length) {
        throw new Error('The import references an unknown platform code.');
    }
    const plans = await pool.query<{ id: string; code: string; region_code: string }>(
        `SELECT sp.id, sp.code, spr.region_code
           FROM subscription_plans sp
           JOIN subscription_services ss ON ss.id = sp.service_id
           JOIN subscription_plan_regions spr ON spr.subscription_plan_id = sp.id
          WHERE sp.code = ANY($1::varchar[])
            AND spr.region_code = ANY($2::char(2)[])
            AND sp.active = TRUE AND ss.active = TRUE AND spr.active = TRUE
            AND (spr.valid_from IS NULL OR spr.valid_from <= $3)
            AND (spr.valid_until IS NULL OR spr.valid_until >= $3)`,
        [[...new Set(planCodes)], [...new Set(regionCodes)], now]
    );
    const planIds = new Map(plans.rows.map((row) => [`${row.code}:${row.region_code}`, row.id]));
    for (const planCode of new Set(planCodes)) {
        if (![...planIds.keys()].some((key) => key.startsWith(`${planCode}:`))) {
            throw new Error(`Unknown or inactive subscription plan: ${planCode}.`);
        }
    }
    return { planIds };
}

function mapSourceType(value: 'OFFICIAL' | 'LICENSED_PROVIDER' | 'MANUAL_REVIEW'): string {
    if (value === 'OFFICIAL') return 'OFFICIAL_MANUAL';
    if (value === 'MANUAL_REVIEW') return 'ADMIN_IMPORT';
    return 'LICENSED_PROVIDER';
}

function toDate(value: string | null): Date | null {
    return value ? new Date(value) : null;
}
