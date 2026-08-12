import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'pt');
    });
});

test('landing shows hero, featured rail and catalog link', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /explorar catálogo/i })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: /os mais bem avaliados/i })).toBeVisible();

    const featuredRail = page.getByRole('region', { name: /os mais bem avaliados/i });
    await expect(featuredRail).toBeVisible();
    await expect(featuredRail.locator('a').first()).toBeVisible();

    await page.getByRole('link', { name: /explorar catálogo/i }).click();
    await expect(page).toHaveURL(/\/catalog$/);
});

test('landing header navigates to browser games on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/');

    await page.getByRole('navigation', { name: /navegação principal/i }).first().getByRole('link', { name: /jogos web/i }).click();
    await expect(page).toHaveURL(/\/browser-games$/);
});

test('landing mobile menu navigates to browser games', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await page.getByRole('button', { name: /abrir menu/i }).click();
    await page.locator('#landing-mobile-navigation').getByRole('link', { name: /jogos web/i }).click();
    await expect(page).toHaveURL(/\/browser-games$/);
});

test('landing footer links to catalog', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('contentinfo').getByRole('link', { name: /catálogo/i }).click();
    await expect(page).toHaveURL(/\/catalog$/);
});

test('landing honors the system reduced-motion preference', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-animations', 'disabled');
});
