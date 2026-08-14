import { Pool } from 'pg';
import { decisionDataImportSchema } from '../../../shared/index.js';
import { StaticJsonCatalogGateway } from '../modules/catalog/static-json-catalog-gateway.js';
import {
    upsertDecisionProfile,
    upsertNetworkPool,
    upsertPlatformOffering,
} from './decision-data-upsert.js';
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
    const data = decisionDataImportSchema.parse(await readJsonFile(options.filePath));
    const catalog = await StaticJsonCatalogGateway.create();
    const catalogIds = new Set(await catalog.listGameIds());
    const unknownGameIds = data.games.map((game) => game.gameId).filter((gameId) => !catalogIds.has(gameId));
    if (unknownGameIds.length > 0) {
        throw new Error(`Unknown catalog game IDs: ${unknownGameIds.join(', ')}`);
    }
    const now = new Date();
    for (const game of data.games) {
        assertNotUnreasonablyFuture(game.profile.lastVerifiedAt, now, `${game.gameId}.profile.lastVerifiedAt`);
        for (const offering of game.offerings) {
            assertNotUnreasonablyFuture(offering.lastVerifiedAt, now, `${game.gameId}.offering.lastVerifiedAt`);
        }
        for (const networkPool of game.networkPools) {
            assertNotUnreasonablyFuture(networkPool.lastVerifiedAt, now, `${game.gameId}.networkPool.lastVerifiedAt`);
        }
    }
    await assertPlatformReferences(data.games.flatMap((game) => [
        ...game.offerings.map((offering) => offering.platformCode),
        ...game.networkPools.flatMap((networkPool) => networkPool.platforms),
    ]));

    if (!options.apply) {
        printReport({ mode: 'dry-run', inserted: 0, updated: 0, skipped: data.games.length, errors: 0 });
    } else {
        const report = await runInTransaction(pool, async (client) => {
            const result: ImportReport = { mode: 'apply', inserted: 0, updated: 0, skipped: 0, errors: 0 };
            for (const game of data.games) {
                await upsertDecisionProfile(client, game.gameId, game.profile, result);
                for (const offering of game.offerings) {
                    await upsertPlatformOffering(client, game.gameId, offering, result);
                }
                for (const networkPool of game.networkPools) {
                    await upsertNetworkPool(client, game.gameId, networkPool, result);
                }
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

async function assertPlatformReferences(platformCodes: string[]): Promise<void> {
    const uniqueCodes = [...new Set(platformCodes)];
    if (uniqueCodes.length === 0) return;
    const result = await pool.query<{ code: string }>(
        'SELECT code FROM platform_references WHERE code = ANY($1::varchar[])',
        [uniqueCodes]
    );
    if (result.rowCount !== uniqueCodes.length) {
        throw new Error('The import references an unknown platform code.');
    }
}
