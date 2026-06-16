import type { BrowserCategoryFilter } from '@/data/browserGames';
import { browserGames } from '@/data/browserGames';
import { BROWSER_GAMES_ITEMS_PER_PAGE, MAX_CATALOG_SEARCH_LENGTH } from '@/constants/catalog';

export interface BrowserGameFilters {
    category: BrowserCategoryFilter;
    search: string;
    currentPage: number;
}

export const defaultBrowserGameFilters: BrowserGameFilters = {
    category: 'all',
    search: '',
    currentPage: 1,
};

export function countFilteredBrowserGames(filters: Pick<BrowserGameFilters, 'category' | 'search'>): number {
    let result = browserGames;

    if (filters.category !== 'all') {
        result = result.filter((game) => game.category === filters.category);
    }

    const term = filters.search.trim().toLowerCase();
    if (term) {
        result = result.filter(
            (game) =>
                game.title.toLowerCase().includes(term) ||
                game.description.toLowerCase().includes(term)
        );
    }

    return result.length;
}

export function normalizeBrowserGameFilters(filters: BrowserGameFilters): BrowserGameFilters {
    const totalItems = countFilteredBrowserGames(filters);
    const totalPages = Math.max(1, Math.ceil(totalItems / BROWSER_GAMES_ITEMS_PER_PAGE));

    return {
        ...filters,
        search: filters.search.trim().slice(0, MAX_CATALOG_SEARCH_LENGTH),
        currentPage: Math.min(filters.currentPage, totalPages),
    };
}
