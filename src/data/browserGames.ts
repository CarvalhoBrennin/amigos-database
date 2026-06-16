import browserGamesData from '@/content/browserGames.data.json';
import { getBrowserGameArtUrl, getBrowserGameFavicon } from '@/utils/browserGameArt';
import { formatPricingToReal } from '@/utils/price';

export type GameCategory =
  | 'drawing'
  | 'word'
  | 'social_deduction'
  | 'quiz'
  | 'strategy'
  | 'party';

export type BrowserCategoryFilter = GameCategory | 'all';
export type PricingModel = 'Free' | 'Freemium' | 'Paid';

export interface BrowserGame {
  id: number;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number | 'Unlimited';
  url: string;
  imageUrl: string;
  coverImageUrl?: string;
  faviconUrl: string;
  category: GameCategory;
  isFree: boolean;
  pricing: PricingModel;
  price: string;
  isFeatured: boolean;
  featuredRank: number | null;
  safetyNote?: string;
}

interface BrowserGameRecord {
  id: number;
  title: string;
  description: string;
  minPlayers: number;
  maxPlayers: number | 'Unlimited';
  url: string;
  category: GameCategory;
  pricing: PricingModel;
  safetyNote?: string;
}

const featuredBrowserGameTitles = [
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
] as const;

const featuredBrowserGameRank = new Map<string, number>(
  featuredBrowserGameTitles.map((title, index) => [title, index + 1])
);

const browserGameCoverImages = new Map<string, string>([
  ['Gartic.io', '/browser-games/covers/gartic-io.jpg'],
  ['Gartic Phone', '/browser-games/covers/gartic-phone.jpg'],
  ['StopotS', '/browser-games/covers/stopots.jpg'],
  ['Kahoot!', '/browser-games/covers/kahoot.jpg'],
  ['Wayground / Quizizz', '/browser-games/covers/quizizz.jpg'],
  ['Agar.io', '/browser-games/covers/agar-io.jpg'],
  ['Slither.io', '/browser-games/covers/slither-io.jpg'],
  ['Chess.com', '/browser-games/covers/chess-com.jpg'],
  ['Pokémon Showdown', '/browser-games/covers/pokemon-showdown.jpg'],
  ['Board Game Arena', '/browser-games/covers/board-game-arena.jpg'],
  ['GeoGuessr', '/browser-games/covers/geoguessr.jpg'],
]);

function normalizeBrowserGame(record: BrowserGameRecord): BrowserGame {
  const pricing = record.pricing;
  const isFree = pricing === 'Free';
  const featuredRank = featuredBrowserGameRank.get(record.title) ?? null;

  return {
    ...record,
    isFree,
    isFeatured: featuredRank !== null,
    featuredRank,
    price: formatPricingToReal(pricing),
    imageUrl: getBrowserGameArtUrl(record.category, record.title),
    coverImageUrl: browserGameCoverImages.get(record.title),
    faviconUrl: getBrowserGameFavicon(record.url),
  };
}

export const browserGames: BrowserGame[] = (browserGamesData as BrowserGameRecord[])
  .map(normalizeBrowserGame)
  .sort((a, b) => {
    if (a.featuredRank && b.featuredRank) {
      return a.featuredRank - b.featuredRank;
    }

    if (a.featuredRank) {
      return -1;
    }

    if (b.featuredRank) {
      return 1;
    }

    return a.id - b.id;
  });

export const browserCategories: readonly BrowserCategoryFilter[] = [
  'all',
  'drawing',
  'word',
  'social_deduction',
  'quiz',
  'strategy',
  'party',
] as const;
