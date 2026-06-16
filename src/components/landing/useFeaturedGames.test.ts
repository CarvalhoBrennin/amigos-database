import { describe, expect, it } from 'vitest';
import { selectFeaturedGames } from '@/components/landing/useFeaturedGames';
import type { Game } from '@/types/game';

function createGame(overrides: Partial<Game> & Pick<Game, 'id' | 'title' | 'rating'>): Game {
    return {
        type: 'coop_campaign',
        players: [1, 4],
        diff: 'Moderada',
        year: 2024,
        catalogPrice: 'R$ 0',
        price: 'R$ 0',
        session: '2h',
        tags: ['co-op'],
        stats: [5, 5, 5, 5, 5],
        imgQ: 'test',
        desc: '',
        mechanic: '',
        verdict: '',
        ...overrides,
    };
}

describe('selectFeaturedGames', () => {
    it('returns top games sorted by rating with stable tie-breakers', () => {
        const games = [
            createGame({ id: 1, title: 'Bravo', rating: 9 }),
            createGame({ id: 2, title: 'Alpha', rating: 10 }),
            createGame({ id: 3, title: 'Charlie', rating: 10 }),
            createGame({ id: 4, title: 'Delta', rating: 8 }),
        ];

        expect(selectFeaturedGames(games, 3).map((game) => game.id)).toEqual([2, 3, 1]);
    });

    it('respects the limit', () => {
        const games = [
            createGame({ id: 1, title: 'One', rating: 10 }),
            createGame({ id: 2, title: 'Two', rating: 9 }),
        ];

        expect(selectFeaturedGames(games, 1)).toHaveLength(1);
        expect(selectFeaturedGames(games, 1)[0]?.id).toBe(1);
    });
});
