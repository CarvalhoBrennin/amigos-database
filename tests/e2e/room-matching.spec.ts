import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.setTimeout(90_000);

async function join(context: BrowserContext, shareUrl: string, nickname: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(shareUrl);
    await page.getByLabel('Seu apelido').fill(nickname);
    await page.getByRole('button', { name: 'Entrar na sala' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Meu setup' })).toBeVisible();
    return page;
}

async function configure(page: Page): Promise<void> {
    await page.getByRole('group', { name: /Famílias de plataforma/ }).getByRole('button', { name: /PC/ }).click();
    const platform = page.getByLabel('PC (Steam)');
    await platform.press('Space');
    await expect(platform).toBeChecked();

    await page.getByRole('button', { name: 'Revisar', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Tudo certo para decidir?' })).toBeVisible();

    const profileResponse = page.waitForResponse((response) => (
        response.url().endsWith('/participants/me/profile') && response.request().method() === 'PATCH'
    ));
    await page.getByRole('button', { name: 'Salvar meu setup' }).focus();
    await page.keyboard.press('Enter');
    expect((await profileResponse).status()).toBe(200);

    await expect(page.getByRole('button', { name: 'Estou pronto' })).toBeVisible();
    const readyResponse = page.waitForResponse((response) => (
        response.url().endsWith('/participants/me/ready') && response.request().method() === 'PUT'
    ));
    await page.getByRole('button', { name: 'Estou pronto' }).focus();
    await page.keyboard.press('Enter');
    expect((await readyResponse).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Voltar a configurar' })).toBeVisible();
}

test('four participants reach a private PERFECT match and reconnect without duplicating a vote', async ({ browser }) => {
    const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
    try {
        const host = await contexts[0]!.newPage();
        await host.goto('/room/new');
        await host.getByLabel('Como devemos chamar você?').fill('Host Match');
        const creation = host.waitForResponse((response) => response.url().endsWith('/api/v1/rooms'));
        await host.getByRole('button', { name: 'Criar sala' }).focus();
        await host.keyboard.press('Enter');
        const created = await (await creation).json() as { invite: { shareUrl: string } };
        const members = await Promise.all([
            join(contexts[1]!, created.invite.shareUrl, 'Pessoa A'),
            join(contexts[2]!, created.invite.shareUrl, 'Pessoa B'),
            join(contexts[3]!, created.invite.shareUrl, 'Pessoa C'),
        ]);
        const pages = [host, ...members];

        await expect(host.getByText('Pessoa C')).toBeVisible();
        for (const page of pages) {
            await configure(page);
        }
        await expect(
            host.getByRole('region', { name: 'Quem está na sala' }).getByText('4/4 prontos')
        ).toBeVisible();

        await host.getByRole('navigation', { name: 'Sequência de configuração' })
            .getByRole('button', { name: 'Regras da noite' })
            .click();
        await host.getByLabel('Meta de matches').fill('1');
        const constraintsResponse = host.waitForResponse((response) => (
            response.url().endsWith('/constraints') && response.request().method() === 'PATCH'
        ));
        await host.getByRole('button', { name: 'Salvar regras' }).focus();
        await host.keyboard.press('Enter');
        expect((await constraintsResponse).status()).toBe(200);
        await expect(host.getByRole('button', { name: 'Iniciar votação' })).toBeEnabled();
        await host.getByRole('button', { name: 'Iniciar votação' }).focus();
        await host.keyboard.press('Enter');

        for (const page of pages) {
            await expect(page.getByRole('heading', { name: /.+/ }).filter({ hasText: /It Takes Two/i })).toBeVisible();
        }

        await host.keyboard.press('y');
        await expect(members[0]!.getByText('Nenhum match finalizado ainda.')).toBeVisible();
        await expect(members[0]!.getByText(/1 de 1 matches/)).not.toBeVisible();

        await members[0]!.keyboard.press('ArrowRight');
        await expect(members[0]!.getByText('Você avaliou todas as cartas')).toBeVisible();
        await members[0]!.reload();
        await expect(members[0]!.getByText('Você avaliou todas as cartas')).toBeVisible();

        await members[1]!.getByRole('button', { name: 'Sim', exact: true }).click();
        await members[2]!.keyboard.press('y');
        await expect(members[2]!.getByRole('heading', { name: 'Match perfeito!' })).toBeVisible();
        for (const page of pages) {
            await expect(page.getByRole('heading', { name: 'Match perfeito!' })).toBeVisible();
        }
        const continueButton = members[2]!.getByRole('button', { name: 'Continuar' });
        await expect(continueButton).toBeFocused();
        await members[2]!.keyboard.press('Tab');
        await expect(continueButton).toBeFocused();
        await members[2]!.keyboard.press('Escape');
        await expect(continueButton).not.toBeVisible();

        for (const page of pages) {
            await page.keyboard.press('Escape');
            await expect(page.getByText('Match perfeito', { exact: true })).toBeVisible();
        }
        await expect(members[0]!.getByText('1 de 1 matches')).toBeVisible();

        await host.getByRole('button', { name: 'Ver finalistas' }).focus();
        await host.keyboard.press('Enter');
        for (const page of pages) {
            await expect(page.getByRole('heading', { name: 'Finalistas da sala' })).toBeVisible();
            await expect(page.getByText('Host Match', { exact: true })).toBeVisible();
            await expect(page.getByText(/Precisa comprar/).first()).toBeVisible();
        }

        await expect(host.getByText('Gameplay indisponível no momento. A escolha continua disponível.')).toBeVisible();
        await host.getByRole('button', { name: 'Escolher It Takes Two' }).focus();
        await host.keyboard.press('Enter');
        for (const page of pages) {
            await expect(page.getByRole('heading', { name: 'Jogo escolhido!' })).toBeVisible();
            await expect(page.getByRole('heading', { name: 'It Takes Two' }).last()).toBeVisible();
        }
    } finally {
        await Promise.all(contexts.map((context) => context.close()));
    }
});
