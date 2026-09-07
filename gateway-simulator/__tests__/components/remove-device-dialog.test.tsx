import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RemoveDeviceDialog } from '../../src/renderer/components/RemoveDeviceDialog';
import { sampleLock } from './test-utils';

describe('RemoveDeviceDialog', () => {
  it('is hidden when no device is selected', () => {
    render(
      <RemoveDeviceDialog
        device={null}
        dontAskAgain={false}
        onDontAskAgainChange={vi.fn()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows device metadata and wires confirm/cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onDontAskAgainChange = vi.fn();
    const device = sampleLock();

    render(
      <RemoveDeviceDialog
        device={device}
        dontAskAgain={false}
        onDontAskAgainChange={onDontAskAgainChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getAllByText('LOCK-100').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('checkbox'));
    expect(onDontAskAgainChange).toHaveBeenCalledWith(true);

    await user.click(screen.getByRole('button', { name: 'Keep device' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
