import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function configureParticipant(page: Page): Promise<void> {
    // One question at a time: pick a platform, move forward, come back, review, save.
    await page.getByRole('group', { name: /Famílias de plataforma/ }).getByRole('button', { name: /PC/ }).click();
    await page.getByLabel('PC (Steam)').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Você tem alguma assinatura ativa?' })).toBeVisible();
    await page.getByRole('button', { name: 'Voltar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Qual é a sua plataforma?' })).toBeVisible();

    await page.getByRole('button', { name: 'Revisar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tudo certo para decidir?' })).toBeVisible();

    const responsePromise = page.waitForResponse((response) => (
        response.url().includes('/participants/me/profile') && response.request().method() === 'PATCH'
    ));
    await page.getByRole('button', { name: 'Salvar meu setup' }).click();
    expect((await responsePromise).status()).toBe(200);

    await page.getByRole('button', { name: 'Estou pronto' }).click();
    await expect(page.getByRole('button', { name: 'Voltar a configurar' })).toBeVisible();
}

async function joinFromInvite(context: BrowserContext, shareUrl: string, nickname: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(shareUrl);
    await page.getByLabel('Seu apelido').fill(nickname);
    await page.getByRole('button', { name: 'Entrar na sala' }).click();
    await expect(page).toHaveURL(/\/r\/[A-Z0-9]+$/);
    await expect(page.getByRole('heading', { name: 'Meu setup' })).toBeVisible();
    return page;
}

async function expectDocumentToFitViewport(page: Page): Promise<void> {
    const dimensions = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
}

test('renders a script-like nickname as text without executing it', async ({ page }) => {
    const nickname = '<script>window.e2eXss=1</script>';
    await page.addInitScript(() => {
        (window as Window & { e2eXss?: boolean }).e2eXss = false;
    });
    await page.goto('/room/new');
    await page.getByLabel('Como devemos chamar você?').fill(nickname);
    await page.getByRole('button', { name: 'Criar sala' }).click();

    await expect(page.getByText(nickname, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { e2eXss?: boolean }).e2eXss)).toBe(false);
    await expect(page.locator('script', { hasText: 'window.e2eXss' })).toHaveCount(0);
});

test('the setup sequence only asks about the PC tier once a PC platform is selected', async ({ page }) => {
    await page.goto('/room/new');
    await page.getByLabel('Como devemos chamar você?').fill('Host Steps');
    await page.getByRole('button', { name: 'Criar sala' }).click();
    await expect(page.getByRole('heading', { name: 'Meu setup' })).toBeVisible();

    const rail = page.getByRole('navigation', { name: 'Sequência de configuração' });
    await expect(rail.getByRole('button', { name: 'Nível do PC' })).toHaveCount(0);

    await page.getByRole('group', { name: /Famílias de plataforma/ }).getByRole('button', { name: /Nintendo/ }).click();
    await page.getByLabel('Nintendo Switch').check();
    await expect(rail.getByRole('button', { name: 'Nível do PC' })).toHaveCount(0);

    await page.getByRole('group', { name: /Famílias de plataforma/ }).getByRole('button', { name: /PC/ }).click();
    await page.getByLabel('PC (Steam)').check();
    await expect(rail.getByRole('button', { name: 'Nível do PC' })).toBeVisible();

    await page.getByLabel('PC (Steam)').uncheck();
    await expect(rail.getByRole('button', { name: 'Nível do PC' })).toHaveCount(0);
});

test('platform cascade and primary controls fit desktop and mobile viewports', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto('/room/new');
    await expectDocumentToFitViewport(page);
    await page.getByLabel('Como devemos chamar você?').fill('Host Responsivo');
    await page.getByRole('button', { name: 'Criar sala' }).click();

    const families = page.getByRole('group', { name: /Famílias de plataforma/ });
    await expect(families).toBeVisible();
    await expect(page.getByLabel('Xbox One')).toHaveCount(0);
    await families.getByRole('button', { name: /Xbox/ }).click();
    await expect(page.getByLabel('Xbox One')).toBeVisible();
    await expect(page.getByLabel('Xbox Series X|S')).toBeVisible();
    await expect(page.getByLabel('PC (Steam)')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeInViewport();
    await expectDocumentToFitViewport(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(families).toBeVisible();
    await expect(page.getByLabel('Xbox Series X|S')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeInViewport();
    await expectDocumentToFitViewport(page);

    await families.getByRole('button', { name: /PlayStation/ }).click();
    await expect(page.getByLabel('PlayStation 4')).toBeVisible();
    await expect(page.getByLabel('PlayStation 5')).toBeVisible();
    await expect(page.getByLabel('Xbox One')).toHaveCount(0);
    await expectDocumentToFitViewport(page);
});

test('three isolated browser contexts configure a lobby and recover it after refresh', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const memberOneContext = await browser.newContext();
    const memberTwoContext = await browser.newContext();

    try {
        const hostPage = await hostContext.newPage();
        await hostPage.goto('/room/new');
        await hostPage.getByLabel('Como devemos chamar você?').fill('Host E2E');
        const createResponsePromise = hostPage.waitForResponse((response) => (
            response.url().endsWith('/api/v1/rooms') && response.request().method() === 'POST'
        ));
        await hostPage.getByRole('button', { name: 'Criar sala' }).click();
        const createResponse = await createResponsePromise;
        expect(createResponse.status()).toBe(201);
        const created = await createResponse.json() as { invite: { shareUrl: string } };
        await expect(hostPage.getByRole('heading', { name: 'Meu setup' })).toBeVisible();

        const memberOnePage = await joinFromInvite(memberOneContext, created.invite.shareUrl, 'Pessoa Um');
        const memberTwoPage = await joinFromInvite(memberTwoContext, created.invite.shareUrl, 'Pessoa Dois');

        await expect(hostPage.getByText('Pessoa Um')).toBeVisible();
        await expect(hostPage.getByText('Pessoa Dois')).toBeVisible();

        await configureParticipant(hostPage);
        await configureParticipant(memberOnePage);
        await configureParticipant(memberTwoPage);

        await expect(
            hostPage.getByRole('region', { name: 'Quem está na sala' }).getByText('3/3 prontos')
        ).toBeVisible();
        await memberTwoPage.reload();
        await expect(memberTwoPage.getByText('Host E2E')).toBeVisible();
        await expect(memberTwoPage.getByText('Pessoa Um')).toBeVisible();
        await expect(memberTwoPage.getByText('Pessoa Dois')).toBeVisible();
        await expect(memberTwoPage.getByRole('button', { name: 'Voltar a configurar' })).toBeVisible();
    } finally {
        await Promise.all([hostContext.close(), memberOneContext.close(), memberTwoContext.close()]);
    }
});
