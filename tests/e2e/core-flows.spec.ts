import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'pt');
    });
});

test('catalog supports filters and modal keyboard close', async ({ page }) => {
    await page.goto('/catalog');

    const detailsButtons = page.getByRole('button', { name: /ver detalhes|view details/i });
    await expect(detailsButtons.first()).toBeVisible();
    await detailsButtons.first().click();

    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    const searchInput = page.getByRole('textbox', { name: /buscar jogos|search games/i });
    await searchInput.fill('zzzz-sem-resultado');
    await expect(page.getByText(/nenhum jogo encontrado|no games found/i)).toBeVisible();
});

test('shows not found for malformed game ids', async ({ page }) => {
    await page.goto('/game/123abc');

    await expect(page.getByText(/jogo nao encontrado|jogo não encontrado|game not found/i)).toBeVisible();
});

test('catalog hydrates search filters from the URL', async ({ page }) => {
    await page.goto('/catalog?q=deep&type=survival');

    const searchInput = page.getByRole('textbox', { name: /buscar jogos|search games/i });
    await expect(searchInput).toHaveValue('deep');
    await expect(page).toHaveURL(/type=survival/);
});

test('language switch keeps route and updates localized content', async ({ page }) => {
    await page.goto('/browser-games');

    const languageToggle = page.getByRole('button', { name: /selecionar idioma|select language/i });
    await languageToggle.click();

    await page.getByRole('option', { name: 'English' }).click();

    await expect(page).toHaveURL(/\/browser-games/);
    await expect(page.getByRole('textbox', { name: 'Search games...' })).toBeVisible();
});

test('shows API error and retries CheapShark request', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/1.0/deals*', async (route) => {
        requestCount += 1;
        await route.abort('failed');
    });

    await page.goto('/game/1');

    await expect(page.getByText(/nao foi possivel carregar os precos agora|unable to load prices/i)).toBeVisible();

    await page.getByRole('button', { name: /tentar novamente|retry/i }).click();
    await expect
        .poll(() => requestCount, { message: 'Retry should trigger a second API request' })
        .toBeGreaterThan(1);
});

test('applies SEO title and canonical url per route', async ({ page }) => {
    await page.goto('/browser-games');

    await expect(page).toHaveTitle(/AMIGOS Database/i);

    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonicalHref).toContain('/browser-games');
});

test('redirects /inicio to the shared landing experience', async ({ page }) => {
    await page.goto('/inicio');

    await expect(page).toHaveURL(/\/$/);
    await expect(
        page.getByRole('heading', {
            name: /AMIGOS/i,
        })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /estou com sorte|i'm feeling lucky/i })).toBeVisible();
    await expect(page).toHaveTitle(/AMIGOS Database/i);

    const canonicalHref = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonicalHref).toContain('/');
});
