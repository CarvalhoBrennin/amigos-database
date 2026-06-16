import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';

const initialState = {
    filter: 'all' as const,
    search: '',
    sort: 'rating' as const,
    playerMin: 1,
    currentPage: 1,
    selectedGameId: null,
    isModalOpen: false,
    modalOriginRect: null,
    luckyGameId: null,
    isLuckyModalOpen: false,
};

describe('gameStore', () => {
    beforeEach(() => {
        useGameStore.setState(initialState);
    });

    it('resets pagination when filters change', () => {
        useGameStore.setState({ currentPage: 3 });

        useGameStore.getState().setFilter('party');
        expect(useGameStore.getState().currentPage).toBe(1);
        expect(useGameStore.getState().filter).toBe('party');

        useGameStore.setState({ currentPage: 2 });
        useGameStore.getState().setSearch('deep rock');
        expect(useGameStore.getState().currentPage).toBe(1);
        expect(useGameStore.getState().search).toBe('deep rock');
    });

    it('opens and closes modal state', () => {
        const originRect = { top: 10, left: 20, width: 300, height: 200 };

        useGameStore.getState().openModal(42, originRect);
        expect(useGameStore.getState().isModalOpen).toBe(true);
        expect(useGameStore.getState().selectedGameId).toBe(42);
        expect(useGameStore.getState().modalOriginRect).toEqual(originRect);

        useGameStore.getState().closeModal();
        expect(useGameStore.getState().isModalOpen).toBe(false);
        expect(useGameStore.getState().selectedGameId).toBe(42);
        expect(useGameStore.getState().modalOriginRect).toEqual(originRect);

        useGameStore.getState().finishCloseModal();
        expect(useGameStore.getState().selectedGameId).toBeNull();
        expect(useGameStore.getState().modalOriginRect).toBeNull();
    });

    it('opens lucky modal and rerolls game id', () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99);

        useGameStore.getState().openLuckyModal();
        const firstLuckyId = useGameStore.getState().luckyGameId;

        expect(useGameStore.getState().isLuckyModalOpen).toBe(true);
        expect(firstLuckyId).not.toBeNull();

        useGameStore.getState().rerollLuckyGame();
        const rerolledId = useGameStore.getState().luckyGameId;

        expect(rerolledId).not.toBeNull();
        expect(rerolledId).not.toBe(firstLuckyId);

        useGameStore.getState().closeLuckyModal();
        expect(useGameStore.getState().isLuckyModalOpen).toBe(false);
        expect(useGameStore.getState().luckyGameId).toBeNull();

        randomSpy.mockRestore();
    });

    it('restores default filters', () => {
        useGameStore.setState({
            filter: 'party',
            search: 'left 4 dead',
            sort: 'title',
            playerMin: 4,
            currentPage: 5,
        });

        useGameStore.getState().resetFilters();

        expect(useGameStore.getState().filter).toBe('all');
        expect(useGameStore.getState().search).toBe('');
        expect(useGameStore.getState().sort).toBe('rating');
        expect(useGameStore.getState().playerMin).toBe(1);
        expect(useGameStore.getState().currentPage).toBe(1);
    });
});
