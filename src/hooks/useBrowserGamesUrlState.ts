import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BrowserCategoryFilter } from '@/data/browserGames';
import { browserCategories } from '@/data/browserGames';
import { BROWSER_GAMES_ITEMS_PER_PAGE, MAX_CATALOG_SEARCH_LENGTH } from '@/constants/catalog';
import { useUrlSyncedState } from '@/hooks/useUrlSyncedState';
import {
    defaultBrowserGameFilters,
    normalizeBrowserGameFilters,
    type BrowserGameFilters,
} from '@/utils/browserGameFilters';

const validCategories = new Set<BrowserCategoryFilter>(browserCategories);

function normalizePositiveInt(value: string | null, fallbackValue: number): number {
    const parsedValue = Number.parseInt(value || '', 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function parseBrowserGameFilters(searchParams: URLSearchParams): BrowserGameFilters {
    const category = searchParams.get('category') as BrowserCategoryFilter | null;
    const rawSearch = searchParams.get('q') || '';

    return normalizeBrowserGameFilters({
        category: category && validCategories.has(category) ? category : 'all',
        search: rawSearch.slice(0, MAX_CATALOG_SEARCH_LENGTH),
        currentPage: normalizePositiveInt(searchParams.get('page'), 1),
    });
}

function serializeBrowserGameFilters(filters: BrowserGameFilters) {
    const params = new URLSearchParams();

    if (filters.search) {
        params.set('q', filters.search);
    }

    if (filters.category !== 'all') {
        params.set('category', filters.category);
    }

    if (filters.currentPage !== defaultBrowserGameFilters.currentPage) {
        params.set('page', String(filters.currentPage));
    }

    return params.toString();
}

export function useBrowserGamesUrlState() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedCategory, setSelectedCategory] = useState<BrowserCategoryFilter>(defaultBrowserGameFilters.category);
    const [searchTerm, setSearchTerm] = useState(defaultBrowserGameFilters.search);
    const [currentPage, setCurrentPage] = useState(defaultBrowserGameFilters.currentPage);

    const parsedFilters = useMemo(
        () => parseBrowserGameFilters(searchParams),
        [searchParams]
    );

    const currentFilters = useMemo(
        () => ({
            category: selectedCategory,
            search: searchTerm,
            currentPage,
        }),
        [currentPage, searchTerm, selectedCategory]
    );

    const applyState = useCallback((filters: BrowserGameFilters) => {
        setSelectedCategory(filters.category);
        setSearchTerm(filters.search);
        setCurrentPage(filters.currentPage);
    }, []);

    useUrlSyncedState({
        parsedFromUrl: parsedFilters,
        currentState: currentFilters,
        searchParamsString: searchParams.toString(),
        setSearchParams,
        serialize: serializeBrowserGameFilters,
        applyState,
        normalize: normalizeBrowserGameFilters,
    });

    return {
        selectedCategory,
        setSelectedCategory,
        searchTerm,
        setSearchTerm,
        currentPage,
        setCurrentPage,
        itemsPerPage: BROWSER_GAMES_ITEMS_PER_PAGE,
    };
}
