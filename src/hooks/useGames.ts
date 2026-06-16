import { useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getGamesForLanguage } from '@/data/games';
import { CATALOG_ITEMS_PER_PAGE } from '@/constants/catalog';
import { usePaginatedCollection } from '@/hooks/usePaginatedCollection';
import { useGameStore } from '@/store/gameStore';
import { applyFilters } from '@/utils/helpers';
import { parseRouteGameId } from '@/utils/gameId';

export function useGames() {
    const { i18n } = useTranslation();
    const filter = useGameStore((state) => state.filter);
    const search = useGameStore((state) => state.search);
    const sort = useGameStore((state) => state.sort);
    const playerMin = useGameStore((state) => state.playerMin);
    const currentPage = useGameStore((state) => state.currentPage);

    const deferredFilter = useDeferredValue(filter);
    const deferredSearch = useDeferredValue(search);
    const deferredSort = useDeferredValue(sort);
    const deferredPlayerMin = useDeferredValue(playerMin);
    const deferredCurrentPage = useDeferredValue(currentPage);

    const isFilteringPending =
        filter !== deferredFilter ||
        search.trim() !== deferredSearch.trim() ||
        sort !== deferredSort ||
        playerMin !== deferredPlayerMin ||
        currentPage !== deferredCurrentPage;

    const localizedGames = useMemo(
        () => getGamesForLanguage(i18n.resolvedLanguage || i18n.language),
        [i18n.language, i18n.resolvedLanguage]
    );

    const filteredGames = useMemo(() => {
        return applyFilters(localizedGames, deferredFilter, deferredSearch, deferredSort, deferredPlayerMin);
    }, [deferredFilter, deferredSearch, deferredSort, deferredPlayerMin, localizedGames]);

    const paginatedGames = usePaginatedCollection(filteredGames, deferredCurrentPage, CATALOG_ITEMS_PER_PAGE);

    const gridRevisionKey = `${deferredFilter}|${deferredSearch}|${deferredSort}|${deferredPlayerMin}|${deferredCurrentPage}`;

    return {
        games: paginatedGames.items,
        totalCount: localizedGames.length,
        filteredCount: filteredGames.length,
        totalPages: paginatedGames.totalPages,
        currentPage: paginatedGames.currentPage,
        startRange: paginatedGames.startRange,
        endRange: paginatedGames.endRange,
        isFilteringPending,
        gridRevisionKey,
    };
}

export function useGameById(id: number | string | null) {
    const { i18n } = useTranslation();

    return useMemo(() => {
        const numId = parseRouteGameId(id);
        if (numId === null) {
            return null;
        }

        return getGamesForLanguage(i18n.resolvedLanguage || i18n.language).find((game) => game.id === numId) || null;
    }, [i18n.language, i18n.resolvedLanguage, id]);
}
