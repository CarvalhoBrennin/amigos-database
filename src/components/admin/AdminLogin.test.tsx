import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

const { loginAdminMock } = vi.hoisted(() => ({ loginAdminMock: vi.fn() }));

vi.mock('@/services/adminApi', () => ({
    loginAdmin: loginAdminMock,
}));

function renderLogin(onAuthenticated = vi.fn()) {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    return {
        onAuthenticated,
        ...render(
            <QueryClientProvider client={queryClient}>
                <AdminLogin onAuthenticated={onAuthenticated} />
            </QueryClientProvider>
        ),
    };
}

describe('AdminLogin', () => {
    beforeEach(() => {
        loginAdminMock.mockReset();
    });

    it('submits credentials and transitions only after authentication succeeds', async () => {
        loginAdminMock.mockResolvedValue({ csrfToken: 'csrf-token', user: { id: 'admin-id' } });
        const onAuthenticated = vi.fn();
        const user = userEvent.setup();
        renderLogin(onAuthenticated);

        await user.type(screen.getByLabelText('E-mail'), 'root@example.test');
        await user.type(screen.getByLabelText('Senha'), 'senha-segura-do-admin');
        await user.click(screen.getByRole('button', { name: 'Acessar painel' }));

        await waitFor(() => expect(loginAdminMock).toHaveBeenCalledWith('root@example.test', 'senha-segura-do-admin'));
        expect(onAuthenticated).toHaveBeenCalledOnce();
    });

    it('keeps the form usable and exposes the server error when authentication fails', async () => {
        loginAdminMock.mockRejectedValue(new Error('E-mail ou senha inválidos'));
        const user = userEvent.setup();
        renderLogin();

        await user.type(screen.getByLabelText('E-mail'), 'root@example.test');
        await user.type(screen.getByLabelText('Senha'), 'senha-incorreta');
        await user.click(screen.getByRole('button', { name: 'Acessar painel' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos');
        expect(screen.getByRole('button', { name: 'Acessar painel' })).toBeEnabled();
    });
});
