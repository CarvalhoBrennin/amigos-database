import { describe, expect, it } from 'vitest';
import {
    countFilteredBrowserGames,
    normalizeBrowserGameFilters,
} from '@/utils/browserGameFilters';
import { BROWSER_GAMES_ITEMS_PER_PAGE } from '@/constants/catalog';

describe('browserGameFilters', () => {
    it('counts filtered browser games by category and search', () => {
        const total = countFilteredBrowserGames({ category: 'all', search: '' });
        expect(total).toBeGreaterThan(0);

        const drawingTotal = countFilteredBrowserGames({ category: 'drawing', search: '' });
        expect(drawingTotal).toBeLessThan(total);
    });

    it('clamps current page when filters reduce total pages', () => {
        const normalized = normalizeBrowserGameFilters({
            category: 'drawing',
            search: 'zzzz-no-match',
            currentPage: 99,
        });

        expect(normalized.currentPage).toBe(1);
    });

    it('keeps valid page within total pages', () => {
        const totalItems = countFilteredBrowserGames({ category: 'all', search: '' });
        const totalPages = Math.max(1, Math.ceil(totalItems / BROWSER_GAMES_ITEMS_PER_PAGE));

        const normalized = normalizeBrowserGameFilters({
            category: 'all',
            search: '',
            currentPage: totalPages,
        });

        expect(normalized.currentPage).toBe(totalPages);
    });
});
