import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types/game';
import { GamePage } from '@/pages/GamePage';
import type { CheapSharkDeal } from '@/services/cheapshark';

const useGameByIdMock = vi.fn();
const useGameDealMock = vi.fn();

vi.mock('@/hooks/useGames', () => ({
    useGameById: (id: number | null) => useGameByIdMock(id),
}));

vi.mock('@/hooks/useGameDeal', () => ({
    useGameDeal: (imgUrl?: string) => useGameDealMock(imgUrl),
}));

vi.mock('@/components/layout/PageContainer', () => ({
    PageContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/game/RadarChart', () => ({
    RadarChart: () => <div>Radar Chart</div>,
}));

vi.mock('@/components/game/YouTubePlayer', () => ({
    YouTubePlayer: () => <div>YouTube Player</div>,
}));

vi.mock('@/hooks/useGameplayVideo', () => ({
    useGameplayVideo: () => ({ videoId: null, startSeconds: 0, isLoading: false, hasKey: false }),
}));

const sampleGame: Game = {
    id: 1,
    title: 'Deep Rock Galactic',
    type: 'coop_campaign',
    players: [1, 4],
    diff: 'Moderada',
    rating: 9.1,
    year: 2020,
    catalogPrice: 'R$ 164,95',
    price: 'R$ 164,95',
    session: '60min',
    desc: 'A cooperative mining FPS.',
    mechanic: 'Team coordination and objective-based runs.',
    verdict: 'Great with friends.',
    tags: ['co-op', 'action'],
    stats: [8, 7, 6, 8, 4],
    imgQ: 'space dwarves',
    imgUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/548430/header.jpg',
};

const sampleDeal: CheapSharkDeal = {
    internalName: 'DEEP_ROCK_GALACTIC',
    title: 'Deep Rock Galactic',
    dealID: '1',
    storeID: '1',
    gameID: '1',
    salePrice: '9.99',
    normalPrice: '29.99',
    isOnSale: '1',
    savings: '66.7',
    metacriticScore: '85',
    steamRatingText: 'Very Positive',
    steamRatingPercent: '94',
    steamRatingCount: '100000',
    steamAppID: '548430',
    releaseDate: 0,
    dealRating: '9',
    thumb: '',
};

function renderPage() {
    return render(
        <HelmetProvider>
            <MemoryRouter initialEntries={['/game/1']}>
                <Routes>
                    <Route path="/game/:id" element={<GamePage />} />
                </Routes>
            </MemoryRouter>
        </HelmetProvider>
    );
}

describe('GamePage', () => {
    beforeEach(() => {
        useGameByIdMock.mockReset();
        useGameDealMock.mockReset();
    });

    it('shows not-found state when game does not exist', () => {
        useGameByIdMock.mockReturnValue(null);
        useGameDealMock.mockReturnValue({
            deal: null,
            allDeals: [],
            isLoading: false,
            error: null,
            status: 'idle',
            errorCode: null,
            refetch: vi.fn(),
        });

        renderPage();

        expect(screen.getByText(/jogo nao encontrado|jogo não encontrado/i)).toBeInTheDocument();
    });

    it('shows not-found state for malformed route ids', () => {
        useGameByIdMock.mockImplementation((id: number | string | null) => {
            if (id === '123abc') {
                return null;
            }

            return sampleGame;
        });
        useGameDealMock.mockReturnValue({
            deal: null,
            allDeals: [],
            isLoading: false,
            error: null,
            status: 'idle',
            errorCode: null,
            refetch: vi.fn(),
        });

        render(
            <HelmetProvider>
                <MemoryRouter initialEntries={['/game/123abc']}>
                    <Routes>
                        <Route path="/game/:id" element={<GamePage />} />
                    </Routes>
                </MemoryRouter>
            </HelmetProvider>
        );

        expect(screen.getByText(/jogo nao encontrado|jogo não encontrado/i)).toBeInTheDocument();
    });

    it('shows deal error state and allows retry', async () => {
        const refetchMock = vi.fn();

        useGameByIdMock.mockReturnValue(sampleGame);
        useGameDealMock.mockReturnValue({
            deal: null,
            allDeals: [],
            isLoading: false,
            error: new Error('network'),
            status: 'error',
            errorCode: 'network',
            refetch: refetchMock,
        });

        const user = userEvent.setup();
        renderPage();

        const retryButton = screen.getByRole('button', { name: /tentar novamente|retry/i });
        await user.click(retryButton);

        expect(refetchMock).toHaveBeenCalledTimes(1);
        expect(
            screen.getByRole('heading', {
                name: /nao foi possivel carregar os precos agora|unable to load prices/i,
            })
        ).toBeInTheDocument();
    });

    it('renders deal card when deal is available', () => {
        useGameByIdMock.mockReturnValue(sampleGame);
        useGameDealMock.mockReturnValue({
            deal: sampleDeal,
            allDeals: [sampleDeal],
            isLoading: false,
            error: null,
            status: 'success',
            errorCode: null,
            refetch: vi.fn(),
        });

        renderPage();

        expect(screen.getByText('Deep Rock Galactic')).toBeInTheDocument();
        expect(screen.getAllByText(/54,95/)).not.toHaveLength(0);
        expect(
            screen.getByRole('heading', {
                name: 'Preços e Avaliações',
            })
        ).toBeInTheDocument();
        expect(screen.getByText(/9\.99/)).toBeInTheDocument();
    });
});
