/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/Modal/Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal isOpen={false} onClose={jest.fn()}>
        Hidden
      </Modal>,
    );
    expect(screen.queryByTestId('modal-overlay')).not.toBeInTheDocument();
  });

  it('portals a full-viewport overlay onto document.body', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <div className="relative" style={{ transform: 'translate(0, 0)' }}>
        <Modal isOpen onClose={onClose}>
          Reset body
        </Modal>
      </div>,
    );

    const overlay = screen.getByTestId('modal-overlay');
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.className).toMatch(/fixed/);
    expect(overlay.className).toMatch(/inset-0/);
    expect(overlay.className).toMatch(/bg-black\/45/);
    expect(screen.getByRole('dialog')).toHaveTextContent('Reset body');

    await user.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });
});
