import { expect, test } from '@playwright/test';

const adminEmail = 'admin-e2e@example.test';
const adminPassword = 'e2e-admin-password-123';

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'pt');
    });
});

test('authenticates and navigates the protected administrative console', async ({ page }) => {
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: /entrar na administra/i })).toBeVisible();
    await page.getByLabel('E-mail').fill(adminEmail);
    await page.getByRole('textbox', { name: /senha/i }).fill(adminPassword);
    await page.getByRole('button', { name: /acessar painel/i }).click();

    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /navegação administrativa/i })).toBeVisible();
    await expect(page.getByText('E2E Admin')).toBeVisible();

    await page.getByRole('navigation', { name: /navegação administrativa/i }).getByRole('button', { name: 'Salas', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/rooms$/);
    await expect(page.getByRole('heading', { name: 'Salas' })).toBeVisible();
});

test('keeps the administrative navigation usable on a phone viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin');
    await page.getByLabel('E-mail').fill(adminEmail);
    await page.getByRole('textbox', { name: /senha/i }).fill(adminPassword);
    await page.getByRole('button', { name: /acessar painel/i }).click();

    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await page.getByRole('button', { name: /abrir menu/i }).click();
    await expect(page.getByRole('navigation', { name: /navegação administrativa/i })).toBeVisible();
    await page.getByRole('navigation', { name: /navegação administrativa/i }).getByRole('button', { name: 'Salas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Salas' })).toBeVisible();
});
