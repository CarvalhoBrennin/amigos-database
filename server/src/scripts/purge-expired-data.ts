import { Pool } from 'pg';
import { z } from 'zod';
import { StructuredLogMetrics } from '../lib/metrics.js';
import { StructuredLogProductAnalytics } from '../modules/analytics/structured-log-product-analytics.js';
import { purgeExpiredData } from '../modules/retention/purge-expired-data.js';

const databaseUrlSchema = z.string().refine(
    (value) => value.startsWith('postgresql://') || value.startsWith('postgres://'),
    'DATABASE_URL must use the PostgreSQL protocol'
);
const databaseUrl = databaseUrlSchema.parse(
    process.env.DATABASE_URL ?? 'postgresql://amigos:amigos_local_only@localhost:5432/amigos'
);
const pool = new Pool({ connectionString: databaseUrl });
const writeLog = (payload: object) => process.stdout.write(`${JSON.stringify(payload)}\n`);

try {
    const result = await purgeExpiredData(
        pool,
        new Date(),
        new StructuredLogMetrics((metric) => writeLog({ type: 'metric', metric })),
        new StructuredLogProductAnalytics((event) => writeLog({ type: 'product_event', event }))
    );
    writeLog({ type: 'retention_completed', ...result });
} finally {
    await pool.end();
}
