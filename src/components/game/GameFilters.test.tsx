import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { GameFilters } from '@/components/game/GameFilters';
import { useGameStore } from '@/store/gameStore';

const resetStore = () => {
    useGameStore.setState({
        filter: 'all',
        search: '',
        sort: 'rating',
        playerMin: 1,
        currentPage: 1,
        selectedGameId: null,
        isModalOpen: false,
        luckyGameId: null,
        isLuckyModalOpen: false,
    });
};

describe('GameFilters', () => {
    beforeEach(() => {
        resetStore();
    });

    it('updates search and type filter using keyboard', async () => {
        const user = userEvent.setup();
        render(<GameFilters />);

        const searchInput = screen.getByRole('textbox');
        await user.type(searchInput, 'alpha');

        await waitFor(() => {
            expect(useGameStore.getState().search).toBe('alpha');
        });

        const partyFilterButton = screen.getByRole('button', { name: 'Party' });
        partyFilterButton.focus();
        await user.keyboard('{Enter}');

        expect(useGameStore.getState().filter).toBe('party');
    });

    it('has no critical accessibility violations', async () => {
        const { container } = render(<GameFilters />);
        const results = await axe(container);
        expect(results.violations).toHaveLength(0);
    });
});
