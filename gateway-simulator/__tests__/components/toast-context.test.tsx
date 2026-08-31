import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from '../../src/renderer/contexts/ToastContext';

function ToastProbe() {
  const toast = useToast();
  return (
    <div>
      <button type="button" onClick={() => toast.success('Saved', 'Device updated')}>
        Push success
      </button>
      <button type="button" onClick={() => toast.error('Failed', 'Network error', { dedupeKey: 'net' })}>
        Push error
      </button>
      <button type="button" onClick={() => toast.error('Failed again', 'Network error', { dedupeKey: 'net' })}>
        Push duplicate error
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  it('shows and dismisses toasts', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Push success' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('merges duplicate toasts with a count badge', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Push error' }));
    await user.click(screen.getByRole('button', { name: 'Push duplicate error' }));

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByLabelText('2 occurrences')).toHaveTextContent('×2');
  });
});
