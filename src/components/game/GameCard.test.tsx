import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { GameCard } from '@/components/game/GameCard';
import { useGameStore } from '@/store/gameStore';
import type { Game } from '@/types/game';

const sampleGame: Game = {
    id: 42,
    title: 'Sample Squad',
    type: 'party',
    players: [2, 4],
    diff: 'Fácil' as Game['diff'],
    rating: 8.4,
    year: 2024,
    catalogPrice: 'R$ 49,90',
    price: 'R$ 49,90',
    session: '30min',
    desc: 'Descricao do jogo.',
    mechanic: 'Cooperacao direta.',
    verdict: 'Boa escolha.',
    tags: ['party', 'casual'],
    stats: [4, 5, 6, 7, 8],
    imgQ: 'sample game',
};

const initialStoreState = {
    selectedGameId: null,
    isModalOpen: false,
    modalOriginRect: null,
};

describe('GameCard', () => {
    beforeEach(() => {
        useGameStore.setState(initialStoreState);
    });

    it('opens the modal with the clicked card origin rect', async () => {
        const user = userEvent.setup();
        render(<GameCard game={sampleGame} />);

        const card = screen.getByRole('article');
        card.getBoundingClientRect = () => ({
            top: 12,
            left: 24,
            width: 320,
            height: 280,
            right: 344,
            bottom: 292,
            x: 24,
            y: 12,
            toJSON: () => undefined,
        });

        await user.click(screen.getByRole('button', { name: /abrir detalhes de sample squad/i }));

        expect(useGameStore.getState().isModalOpen).toBe(true);
        expect(useGameStore.getState().selectedGameId).toBe(42);
        expect(useGameStore.getState().modalOriginRect).toEqual({
            top: 12,
            left: 24,
            width: 320,
            height: 280,
        });
    });
});
