import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserGamesPage } from '@/pages/BrowserGamesPage';

let openMock: ReturnType<typeof vi.fn>;
let scrollToMock: ReturnType<typeof vi.fn>;

vi.mock('@/components/layout/PageContainer', () => ({
    PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/SEO', () => ({
    SEO: () => null,
}));

vi.mock('@/components/ui/Breadcrumbs', () => ({
    Breadcrumbs: () => null,
}));

function renderPage() {
    return render(
        <MemoryRouter>
            <BrowserGamesPage />
        </MemoryRouter>
    );
}

describe('BrowserGamesPage', () => {
    beforeEach(() => {
        scrollToMock = vi.fn();
        vi.stubGlobal('scrollTo', scrollToMock);
        openMock = vi.fn();
        vi.stubGlobal('open', openMock);
    });

    it('filters results and shows empty state when no game matches', async () => {
        const user = userEvent.setup();
        renderPage();

        const searchInput = screen.getByRole('textbox');
        await user.type(searchInput, 'zzzz-not-found');

        await waitFor(() => {
            expect(screen.getByText(/nenhum jogo encontrado/i)).toBeInTheDocument();
        });

        const clearFiltersButton = screen.getByRole('button', { name: /limpar filtros/i });
        await user.click(clearFiltersButton);

        await waitFor(() => {
            expect(screen.queryByText(/nenhum jogo encontrado/i)).not.toBeInTheDocument();
        });
    });

    it('opens external game link and supports pagination', async () => {
        const user = userEvent.setup();
        renderPage();

        const playButtons = screen.getAllByRole('button', { name: /jogar agora|play now/i });
        await user.click(playButtons[0]);

        expect(openMock).toHaveBeenCalledTimes(1);
        expect(openMock.mock.calls[0]?.[0]).toContain('https://');

        const pageTwoButton = screen.getByRole('button', { name: '2' });
        await user.click(pageTwoButton);

        expect(scrollToMock).toHaveBeenCalled();
    });
});
