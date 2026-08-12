import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: false,
                ws: true,
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@shared': path.resolve(__dirname, './shared'),
        },
    },
    build: {
        target: 'es2020',
        cssCodeSplit: true,
        sourcemap: process.env.GENERATE_SOURCEMAP === 'true',
        chunkSizeWarningLimit: 700,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    motion: ['framer-motion'],
                    i18n: ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
                    charts: ['recharts'],
                },
            },
        },
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        globals: true,
        css: false,
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        exclude: ['tests/e2e/**'],
        coverage: {
            provider: 'v8',
            reportsDirectory: 'coverage/web',
            reporter: ['text', 'lcov', 'html'],
            include: [
                'src/hooks/useGameDeal.ts',
                'src/store/gameStore.ts',
                'src/pages/GamePage.tsx',
                'src/pages/BrowserGamesPage.tsx',
                'src/components/ui/Modal.tsx',
                'src/components/game/GameFilters.tsx',
                'src/utils/url.ts',
                'src/utils/browserGameFilters.ts',
                'src/services/cheapshark.ts',
            ],
            exclude: [
                'node_modules/**',
                'dist/**',
                'src/locales/**',
                'src/data/**',
                '**/*.d.ts',
            ],
            thresholds: {
                statements: 80,
                lines: 80,
                functions: 75,
                branches: 70,
            },
        },
    },
});
