import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeviceDetailDrawer } from '../../src/renderer/components/DeviceDetailDrawer';

describe('DeviceDetailDrawer', () => {
  it('closes when the header X button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <DeviceDetailDrawer deviceKey="lock:ABC" onClose={onClose}>
        {(key) => <p>Details for {key}</p>}
      </DeviceDetailDrawer>,
    );

    expect(screen.getByText('Details for lock:ABC')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Close device details/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
