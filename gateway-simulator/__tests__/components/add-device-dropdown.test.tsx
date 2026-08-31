import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AddDeviceDropdown } from '../../src/renderer/components/AddDeviceDropdown';

describe('AddDeviceDropdown', () => {
  it('opens menu, selects kind, and closes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn().mockResolvedValue(undefined);

    render(<AddDeviceDropdown onSelect={onSelect} />);

    const trigger = screen.getByRole('button', { name: /Add device/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: /Access control/i }));
    expect(onSelect).toHaveBeenCalledWith('access_control');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<AddDeviceDropdown onSelect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Add device/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
