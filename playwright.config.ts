import { defineConfig } from '@playwright/test';

const port = 4173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const usePreview = Boolean(process.env.CI || process.env.PLAYWRIGHT_USE_PREVIEW);
const apiURL = 'http://127.0.0.1:3001';

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 45_000,
    expect: {
        timeout: 8_000,
    },
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        baseURL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: { width: 1366, height: 900 },
    },
    webServer: [
        usePreview ? {
            command: `npm run build:web && npm run preview -- --host 127.0.0.1 --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            env: { ...process.env, VITE_API_BASE_URL: apiURL },
        } : {
            command: `npm run dev:web -- --host 127.0.0.1 --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { ...process.env, VITE_API_BASE_URL: apiURL },
        },
        {
            command: 'npm run dev:e2e:api',
            url: `${apiURL}/api/v1/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { ...process.env, PLAYWRIGHT_WEB_ORIGIN: baseURL },
        },
    ],
});
