import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateRoomPage } from '@/pages/CreateRoomPage';

const { createRoomMock } = vi.hoisted(() => ({ createRoomMock: vi.fn() }));

vi.mock('@/services/roomApi', () => ({
    createRoom: createRoomMock,
    createIdempotencyKey: () => 'test-idempotency-key',
}));

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <CreateRoomPage />
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('CreateRoomPage', () => {
    beforeEach(() => {
        createRoomMock.mockReset();
    });

    it('reuses the same idempotency key when retrying an interrupted creation', async () => {
        createRoomMock
            .mockRejectedValueOnce(new Error('network timeout'))
            .mockResolvedValueOnce({
                room: { code: 'ABC123' },
                invite: { shareUrl: 'https://amigos.example/r/ABC123?invite=token' },
            });
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByRole('textbox'), 'Ana');
        const submit = screen.getByRole('button', { name: /criar sala|create room/i });
        await user.click(submit);
        await waitFor(() => expect(createRoomMock).toHaveBeenCalledTimes(1));
        expect(screen.getByRole('alert')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /criar sala|create room/i }));
        await waitFor(() => expect(createRoomMock).toHaveBeenCalledTimes(2));

        const firstKey = createRoomMock.mock.calls[0]?.[1];
        expect(firstKey).toEqual(expect.any(String));
        expect(createRoomMock.mock.calls[1]?.[1]).toBe(firstKey);
    });
});
