import { gameTypeFilters } from '@/data/games';
import type { GameTypeFilter, SortOption } from '@/types/game';

export const CATALOG_ITEMS_PER_PAGE = 20;
export const BROWSER_GAMES_ITEMS_PER_PAGE = 20;
export const MAX_CATALOG_SEARCH_LENGTH = 120;

export const VALID_SORT_OPTIONS = new Set<SortOption>(['rating', 'title', 'year', 'players']);
export const VALID_GAME_TYPE_FILTERS = new Set<GameTypeFilter>(gameTypeFilters);
