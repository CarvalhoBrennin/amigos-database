import { create } from 'zustand';
import type { GameTypeFilter, SortOption } from '@/types/game';
import { getGamesForLanguage } from '@/data/games';
import {
    MAX_CATALOG_SEARCH_LENGTH,
    VALID_GAME_TYPE_FILTERS,
    VALID_SORT_OPTIONS,
} from '@/constants/catalog';

export interface ModalOriginRect {
    top: number;
    left: number;
    width: number;
    height: number;
}

export const defaultCatalogFilters = {
    filter: 'all' as GameTypeFilter,
    search: '',
    sort: 'rating' as SortOption,
    playerMin: 1,
    currentPage: 1,
};

interface GameStore {
    filter: GameTypeFilter;
    search: string;
    sort: SortOption;
    playerMin: number;
    currentPage: number;

    selectedGameId: number | null;
    isModalOpen: boolean;
    modalOriginRect: ModalOriginRect | null;

    luckyGameId: number | null;
    isLuckyModalOpen: boolean;

    setFilter: (filter: GameTypeFilter) => void;
    setSearch: (search: string) => void;
    setSort: (sort: SortOption) => void;
    setPlayerMin: (min: number) => void;
    setCurrentPage: (page: number) => void;
    hydrateFilters: (filters: Partial<typeof defaultCatalogFilters>) => void;
    openModal: (gameId: number, originRect?: ModalOriginRect | null) => void;
    closeModal: () => void;
    finishCloseModal: () => void;
    resetFilters: () => void;
    openLuckyModal: (language?: string | null) => void;
    closeLuckyModal: () => void;
    rerollLuckyGame: (language?: string | null) => void;
}

function sanitizeCatalogFilters(
    filters: Partial<typeof defaultCatalogFilters>
): Partial<typeof defaultCatalogFilters> {
    const sanitized: Partial<typeof defaultCatalogFilters> = {};

    if (filters.filter && VALID_GAME_TYPE_FILTERS.has(filters.filter)) {
        sanitized.filter = filters.filter;
    }

    if (typeof filters.search === 'string') {
        sanitized.search = filters.search.trim().slice(0, MAX_CATALOG_SEARCH_LENGTH);
    }

    if (filters.sort && VALID_SORT_OPTIONS.has(filters.sort)) {
        sanitized.sort = filters.sort;
    }

    if (typeof filters.playerMin === 'number' && Number.isFinite(filters.playerMin) && filters.playerMin > 0) {
        sanitized.playerMin = Math.floor(filters.playerMin);
    }

    if (typeof filters.currentPage === 'number' && Number.isFinite(filters.currentPage) && filters.currentPage > 0) {
        sanitized.currentPage = Math.floor(filters.currentPage);
    }

    return sanitized;
}

const getRandomGameId = (language?: string | null): number | null => {
    const localizedGames = getGamesForLanguage(language);
    if (!localizedGames.length) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * localizedGames.length);
    return localizedGames[randomIndex].id;
};

export const useGameStore = create<GameStore>((set) => ({
    ...defaultCatalogFilters,
    selectedGameId: null,
    isModalOpen: false,
    modalOriginRect: null,
    luckyGameId: null,
    isLuckyModalOpen: false,

    setFilter: (filter) => set({ filter, currentPage: 1 }),
    setSearch: (search) => set({
        search: search.trim().slice(0, MAX_CATALOG_SEARCH_LENGTH),
        currentPage: 1,
    }),
    setSort: (sort) => set({ sort, currentPage: 1 }),
    setPlayerMin: (playerMin) => set({ playerMin, currentPage: 1 }),
    setCurrentPage: (page) => set({ currentPage: page }),
    hydrateFilters: (filters) => set((state) => ({
        ...state,
        ...sanitizeCatalogFilters(filters),
    })),

    openModal: (gameId, originRect = null) => set({
        selectedGameId: gameId,
        isModalOpen: true,
        modalOriginRect: originRect,
    }),

    closeModal: () => set({
        isModalOpen: false,
    }),

    finishCloseModal: () => set({
        selectedGameId: null,
        modalOriginRect: null,
    }),

    resetFilters: () => set(defaultCatalogFilters),

    openLuckyModal: (language) => {
        const luckyGameId = getRandomGameId(language);
        if (luckyGameId === null) {
            return;
        }

        set({
            luckyGameId,
            isLuckyModalOpen: true,
        });
    },

    closeLuckyModal: () => set({
        luckyGameId: null,
        isLuckyModalOpen: false,
    }),

    rerollLuckyGame: (language) => {
        const luckyGameId = getRandomGameId(language);
        if (luckyGameId === null) {
            return;
        }

        set({ luckyGameId });
    },
}));
