import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { getGamesForLanguage } from '@/data/games';
import { defaultCatalogFilters, useGameStore } from '@/store/gameStore';
import type { GameTypeFilter, SortOption } from '@/types/game';
import {
    CATALOG_ITEMS_PER_PAGE,
    MAX_CATALOG_SEARCH_LENGTH,
    VALID_GAME_TYPE_FILTERS,
    VALID_SORT_OPTIONS,
} from '@/constants/catalog';
import { applyFilters } from '@/utils/helpers';
import { useUrlSyncedState } from '@/hooks/useUrlSyncedState';

function normalizePositiveInt(value: string | null, fallbackValue: number): number {
    const parsedValue = Number.parseInt(value || '', 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

function parseCatalogFilters(searchParams: URLSearchParams) {
    const filter = searchParams.get('type') as GameTypeFilter | null;
    const sort = searchParams.get('sort') as SortOption | null;
    const rawSearch = (searchParams.get('q') || defaultCatalogFilters.search).trim();

    return {
        filter: filter && VALID_GAME_TYPE_FILTERS.has(filter) ? filter : defaultCatalogFilters.filter,
        search: rawSearch.slice(0, MAX_CATALOG_SEARCH_LENGTH),
        sort: sort && VALID_SORT_OPTIONS.has(sort) ? sort : defaultCatalogFilters.sort,
        playerMin: normalizePositiveInt(searchParams.get('players'), defaultCatalogFilters.playerMin),
        currentPage: normalizePositiveInt(searchParams.get('page'), defaultCatalogFilters.currentPage),
    };
}

function normalizeCatalogFilters(
    filters: typeof defaultCatalogFilters,
    localizedGames: ReturnType<typeof getGamesForLanguage>
) {
    const filteredGames = applyFilters(
        localizedGames,
        filters.filter,
        filters.search,
        filters.sort,
        filters.playerMin
    );
    const totalPages = Math.max(1, Math.ceil(filteredGames.length / CATALOG_ITEMS_PER_PAGE));

    return {
        ...filters,
        currentPage: Math.min(filters.currentPage, totalPages),
    };
}

function serializeCatalogFilters(filters: typeof defaultCatalogFilters): string {
    const params = new URLSearchParams();

    if (filters.search) {
        params.set('q', filters.search);
    }

    if (filters.filter !== defaultCatalogFilters.filter) {
        params.set('type', filters.filter);
    }

    if (filters.sort !== defaultCatalogFilters.sort) {
        params.set('sort', filters.sort);
    }

    if (filters.playerMin !== defaultCatalogFilters.playerMin) {
        params.set('players', String(filters.playerMin));
    }

    if (filters.currentPage !== defaultCatalogFilters.currentPage) {
        params.set('page', String(filters.currentPage));
    }

    return params.toString();
}

export function useCatalogUrlState() {
    const { i18n } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const filter = useGameStore((state) => state.filter);
    const search = useGameStore((state) => state.search);
    const sort = useGameStore((state) => state.sort);
    const playerMin = useGameStore((state) => state.playerMin);
    const currentPage = useGameStore((state) => state.currentPage);
    const hydrateFilters = useGameStore((state) => state.hydrateFilters);
    const localizedGames = useMemo(
        () => getGamesForLanguage(i18n.resolvedLanguage || i18n.language),
        [i18n.language, i18n.resolvedLanguage]
    );
    const parsedFilters = useMemo(
        () => normalizeCatalogFilters(parseCatalogFilters(searchParams), localizedGames),
        [localizedGames, searchParams]
    );

    const currentFilters = useMemo(
        () => ({ filter, search, sort, playerMin, currentPage }),
        [currentPage, filter, playerMin, search, sort]
    );

    const normalizeFilters = useCallback(
        (filters: typeof defaultCatalogFilters) => normalizeCatalogFilters(filters, localizedGames),
        [localizedGames]
    );

    const applyState = useCallback(
        (filters: typeof defaultCatalogFilters) => {
            hydrateFilters(filters);
        },
        [hydrateFilters]
    );

    useUrlSyncedState({
        parsedFromUrl: parsedFilters,
        currentState: currentFilters,
        searchParamsString: searchParams.toString(),
        setSearchParams,
        serialize: serializeCatalogFilters,
        applyState,
        normalize: normalizeFilters,
    });
}
