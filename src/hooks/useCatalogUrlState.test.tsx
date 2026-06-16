import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useCatalogUrlState } from '@/hooks/useCatalogUrlState';
import { defaultCatalogFilters, useGameStore } from '@/store/gameStore';

function resetStore() {
    useGameStore.setState({
        ...defaultCatalogFilters,
        selectedGameId: null,
        isModalOpen: false,
        luckyGameId: null,
        isLuckyModalOpen: false,
    });
}

function CatalogUrlStateHarness() {
    useCatalogUrlState();

    const location = useLocation();
    const { filter, search, sort, playerMin, currentPage, setFilter, setSearch } = useGameStore();

    return (
        <div>
            <output data-testid="location-search">{location.search}</output>
            <output data-testid="store-state">
                {JSON.stringify({ filter, search, sort, playerMin, currentPage })}
            </output>
            <button
                type="button"
                onClick={() => {
                    setSearch('deep');
                    setFilter('survival');
                }}
            >
                update filters
            </button>
        </div>
    );
}

function renderHarness(initialEntry: string) {
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/catalog" element={<CatalogUrlStateHarness />} />
            </Routes>
        </MemoryRouter>
    );
}

function readStoreState() {
    return JSON.parse(screen.getByTestId('store-state').textContent || '{}') as {
        filter: string;
        search: string;
        sort: string;
        playerMin: number;
        currentPage: number;
    };
}

describe('useCatalogUrlState', () => {
    beforeEach(() => {
        resetStore();
    });

    it('hydrates store filters from the URL and normalizes out-of-range pages', async () => {
        renderHarness('/catalog?type=party&q=missing-game&sort=title&players=4&page=999');

        await waitFor(() => {
            expect(screen.getByTestId('location-search').textContent).toBe(
                '?q=missing-game&type=party&sort=title&players=4'
            );
        });

        await waitFor(() => {
            expect(readStoreState()).toEqual({
                filter: 'party',
                search: 'missing-game',
                sort: 'title',
                playerMin: 4,
                currentPage: 1,
            });
        });
    });

    it('writes URL params when the store changes after hydration', async () => {
        const user = userEvent.setup();

        renderHarness('/catalog');

        await user.click(screen.getByRole('button', { name: 'update filters' }));

        await waitFor(() => {
            expect(screen.getByTestId('location-search').textContent).toBe(
                '?q=deep&type=survival'
            );
        });

        expect(readStoreState()).toEqual({
            filter: 'survival',
            search: 'deep',
            sort: 'rating',
            playerMin: 1,
            currentPage: 1,
        });
    });
});