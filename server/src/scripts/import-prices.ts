import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { priceImportSchema } from '../../../shared/index.js';
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
const currencyByRegion: Record<string, string> = { BR: 'BRL' };

try {
    const options = parseImportOptions(process.argv.slice(2));
    const data = priceImportSchema.parse(await readJsonFile(options.filePath));
    const catalog = await StaticJsonCatalogGateway.create();
    const catalogIds = new Set(await catalog.listGameIds());
    const unknownGames = data.records.filter((record) => !catalogIds.has(record.gameId)).map((record) => record.gameId);
    if (unknownGames.length > 0) {
        throw new Error(`Unknown catalog game IDs: ${[...new Set(unknownGames)].join(', ')}`);
    }
    const now = new Date();
    for (const record of data.records) {
        assertNotUnreasonablyFuture(record.observedAt, now, `${record.gameId}.observedAt`);
        const expectedCurrency = currencyByRegion[record.regionCode];
        if (!expectedCurrency || expectedCurrency !== record.currency) {
            throw new Error(`Currency ${record.currency} is not configured for region ${record.regionCode}.`);
        }
    }
    const uniquePlatforms = [...new Set(data.records.map((record) => record.platformCode))];
    const platforms = await pool.query<{ code: string }>(
        'SELECT code FROM platform_references WHERE code = ANY($1::varchar[])',
        [uniquePlatforms]
    );
    if (platforms.rowCount !== uniquePlatforms.length) {
        throw new Error('The import references an unknown platform code.');
    }

    if (!options.apply) {
        printReport({ mode: 'dry-run', inserted: 0, updated: 0, skipped: data.records.length, errors: 0 });
    } else {
        const report = await runInTransaction(pool, async (client) => {
            const result: ImportReport = { mode: 'apply', inserted: 0, updated: 0, skipped: 0, errors: 0 };
            for (const record of data.records) {
                const query = await client.query<{ inserted: boolean }>(
                    `INSERT INTO game_prices (
                        id, game_id, platform_code, region_code, store_code, amount_minor,
                        currency, regular_amount_minor, quality, source_url, observed_at, valid_until
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                    ON CONFLICT (game_id, platform_code, region_code, store_code, observed_at)
                    DO UPDATE SET amount_minor=EXCLUDED.amount_minor,
                        currency=EXCLUDED.currency,
                        regular_amount_minor=EXCLUDED.regular_amount_minor,
                        quality=EXCLUDED.quality,
                        source_url=EXCLUDED.source_url,
                        valid_until=EXCLUDED.valid_until
                    RETURNING (xmax = 0) AS inserted`,
                    [
                        randomUUID(), record.gameId, record.platformCode, record.regionCode,
                        record.storeCode, record.amountMinor, record.currency,
                        record.regularAmountMinor, record.quality, record.sourceUrl,
                        new Date(record.observedAt), record.validUntil ? new Date(record.validUntil) : null,
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
