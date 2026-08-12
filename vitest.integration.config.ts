import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, './shared'),
            '@server': path.resolve(__dirname, './server/src'),
        },
    },
    test: {
        environment: 'node',
        globals: true,
        fileParallelism: false,
        include: ['server/integration/**/*.integration.test.ts'],
        testTimeout: 20_000,
        hookTimeout: 20_000,
    },
});
