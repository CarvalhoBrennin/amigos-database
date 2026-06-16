import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { Modal } from '@/components/ui/Modal';

function ModalHarness() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div>
            <button type="button" onClick={() => setIsOpen(true)}>
                Open Modal
            </button>
            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)}>
                <div className="p-4">
                    <button type="button">First Action</button>
                    <button type="button">Second Action</button>
                </div>
            </Modal>
        </div>
    );
}

describe('Modal', () => {
    it('traps focus and restores it when closed', async () => {
        const user = userEvent.setup();
        render(<ModalHarness />);

        const openButton = screen.getByRole('button', { name: 'Open Modal' });
        openButton.focus();
        await user.click(openButton);

        const closeButton = await screen.findByRole('button', { name: /fechar|close/i });
        const firstAction = await screen.findByRole('button', { name: 'First Action' });
        const secondAction = screen.getByRole('button', { name: 'Second Action' });

        await waitFor(() => {
            expect(closeButton).toHaveFocus();
        });

        await user.tab();
        expect(firstAction).toHaveFocus();

        await user.tab();
        expect(secondAction).toHaveFocus();

        await user.tab();
        expect(closeButton).toHaveFocus();

        await user.keyboard('{Escape}');

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: 'First Action' })).not.toBeInTheDocument();
        });

        expect(openButton).toHaveFocus();
    });

    it('has no critical accessibility violations', async () => {
        const user = userEvent.setup();
        const { container } = render(<ModalHarness />);

        await user.click(screen.getByRole('button', { name: 'Open Modal' }));
        await screen.findByRole('button', { name: 'First Action' });

        const results = await axe(container);
        expect(results.violations).toHaveLength(0);
    });
});
