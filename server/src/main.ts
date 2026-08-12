import { loadEnvFile } from 'node:process';
import { buildApp } from './app.js';
import { InvalidEnvironmentError, parseServerEnv } from './config/env.js';

try {
    loadEnvFile('.env');
} catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error;
    }
}

try {
    const config = parseServerEnv();
    const app = await buildApp({ config });
    await app.listen({ host: config.host, port: config.port });
    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
        if (shuttingDown) return;
        shuttingDown = true;
        app.log.info({ signal }, 'Graceful shutdown started');
        try {
            await app.close();
        } catch (error) {
            app.log.error({ err: error }, 'Graceful shutdown failed');
            process.exitCode = 1;
        }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
} catch (error) {
    if (error instanceof InvalidEnvironmentError) {
        process.stderr.write(`${error.message}: ${JSON.stringify(error.issues)}\n`);
    } else {
        process.stderr.write(`${error instanceof Error ? error.message : 'Unknown startup error'}\n`);
    }
    process.exitCode = 1;
}
