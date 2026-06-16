import { describe, expect, it } from 'vitest';
import { browserGames } from '@/data/browserGames';

describe('browserGames', () => {
  it('prioritizes curated featured browser games', () => {
    expect(browserGames.slice(0, 11).map((game) => game.title)).toEqual([
      'Gartic.io',
      'Gartic Phone',
      'StopotS',
      'Kahoot!',
      'Wayground / Quizizz',
      'Agar.io',
      'Slither.io',
      'Chess.com',
      'Pokémon Showdown',
      'Board Game Arena',
      'GeoGuessr',
    ]);

    expect(browserGames.slice(0, 11).every((game) => game.isFeatured)).toBe(true);
    expect(browserGames.slice(0, 11).every((game) => game.coverImageUrl?.startsWith('/browser-games/covers/'))).toBe(true);
  });
});
