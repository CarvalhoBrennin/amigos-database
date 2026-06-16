import { defineConfig } from '@playwright/test';

const port = 4173;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const usePreview = Boolean(process.env.CI || process.env.PLAYWRIGHT_USE_PREVIEW);

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
    webServer: usePreview
        ? {
            command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
        }
        : {
            command: `npm run dev -- --host 127.0.0.1 --port ${port}`,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
});
