import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../src/renderer/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <ConfirmDialog
        isOpen={false}
        title="Delete?"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('invokes confirm and cancel actions', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="Delete item?"
        message="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Back"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('supports dont-ask-again checkbox and Escape to cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onDontAskAgainChange = vi.fn();

    render(
      <ConfirmDialog
        isOpen
        title="Confirm"
        message="Proceed?"
        onConfirm={vi.fn()}
        onCancel={onCancel}
        dontAskAgain={{ checked: false, onChange: onDontAskAgainChange }}
      />,
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onDontAskAgainChange).toHaveBeenCalledWith(true);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables actions while loading', () => {
    render(
      <ConfirmDialog
        isOpen
        title="Removing"
        message="Wait"
        isLoading
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Removing/i })).toBeDisabled();
  });
});
