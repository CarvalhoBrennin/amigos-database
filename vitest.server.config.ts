import { defineConfig } from 'vitest/config';
import path from 'node:path';

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
        include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
        exclude: ['server/integration/**'],
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage/server',
            reporter: ['text', 'lcov'],
            include: [
                'server/src/modules/**/domain/**/*.ts',
                'server/src/config/env.ts',
            ],
            thresholds: {
                statements: 80,
                lines: 80,
                functions: 80,
                branches: 80,
            },
        },
    },
});
