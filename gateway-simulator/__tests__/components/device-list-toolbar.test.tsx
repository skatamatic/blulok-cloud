import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeviceListToolbar } from '../../src/renderer/components/DeviceListToolbar';
import { DEFAULT_DEVICE_LIST_FILTERS } from '../../src/renderer/utils/device-inventory-list.utils';

describe('DeviceListToolbar', () => {
  it('updates search, kind filter, and sort column', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();

    render(
      <DeviceListToolbar
        filters={DEFAULT_DEVICE_LIST_FILTERS}
        totalCount={3}
        visibleCount={3}
        onChange={onChange}
        onClear={onClear}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^Search$/i), { target: { value: 'lock' } });
    expect(onChange).toHaveBeenCalledWith({ search: 'lock' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), 'lock');
    expect(onChange).toHaveBeenCalledWith({ kind: 'lock' });

    await user.click(screen.getByRole('button', { name: /Sort by Firmware/i }));
    expect(onChange).toHaveBeenCalledWith({ sortColumn: 'firmware', sortDirection: 'asc' });
  });

  it('shows clear action when filters are active', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();

    render(
      <DeviceListToolbar
        filters={{ ...DEFAULT_DEVICE_LIST_FILTERS, search: 'abc' }}
        totalCount={2}
        visibleCount={1}
        onChange={vi.fn()}
        onClear={onClear}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
