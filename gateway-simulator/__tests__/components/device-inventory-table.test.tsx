import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceInventoryTable } from '../../src/renderer/components/DeviceInventoryTable';
import { setSkipDeviceDeleteConfirmForSession } from '../../src/renderer/utils/device-delete-confirm.session';
import { renderWithProviders, installSimulatorMock, sampleGateway, sampleLock } from './test-utils';
import { resetDeviceDeleteConfirmSession } from '../../src/renderer/utils/device-delete-confirm.session';

describe('DeviceInventoryTable', () => {
  beforeEach(() => {
    resetDeviceDeleteConfirmSession();
  });
  it('shows empty state when gateway has no devices', () => {
    installSimulatorMock();
    renderWithProviders(
      <DeviceInventoryTable gateway={sampleGateway()} connected onRefresh={vi.fn()} />,
    );
    expect(screen.getByText(/No devices yet/i)).toBeInTheDocument();
  });

  it('lists devices and opens remove confirmation before deleting', async () => {
    const user = userEvent.setup();
    const simulator = installSimulatorMock();
    const onRefresh = vi.fn();
    const lock = sampleLock();
    const gateway = sampleGateway({ devices: [lock] });

    renderWithProviders(
      <DeviceInventoryTable gateway={gateway} connected onRefresh={onRefresh} />,
    );

    expect(screen.getByText('LOCK-100')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Remove LOCK-100/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(simulator.removeDevice).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remove device' }));
    expect(simulator.removeDevice).toHaveBeenCalledWith(gateway.id, 'lock:LOCK-100');
    expect(onRefresh).toHaveBeenCalled();
  });

  it('skips confirmation when session flag is set', async () => {
    const user = userEvent.setup();
    setSkipDeviceDeleteConfirmForSession(true);
    const simulator = installSimulatorMock();
    const lock = sampleLock();
    const gateway = sampleGateway({ devices: [lock] });

    renderWithProviders(
      <DeviceInventoryTable gateway={gateway} connected onRefresh={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /Remove LOCK-100/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(simulator.removeDevice).toHaveBeenCalledWith(gateway.id, 'lock:LOCK-100');
  });

  it('filters devices and can clear filters', async () => {
    const user = userEvent.setup();
    installSimulatorMock();
    const gateway = sampleGateway({
      devices: [
        sampleLock({ lock_id: 'LOCK-AAA', firmware_version: '1.0.0' }),
        sampleLock({ lock_id: 'LOCK-BBB', firmware_version: '9.9.9', online: false }),
      ],
    });

    renderWithProviders(
      <DeviceInventoryTable gateway={gateway} connected onRefresh={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Search/i), '9.9.9');
    expect(screen.getByText('LOCK-BBB')).toBeInTheDocument();
    expect(screen.queryByText('LOCK-AAA')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(screen.getByText('LOCK-AAA')).toBeInTheDocument();
    expect(screen.getByText('LOCK-BBB')).toBeInTheDocument();
  });

  it('adds a device from the dropdown menu', async () => {
    const user = userEvent.setup();
    const simulator = installSimulatorMock();
    const onRefresh = vi.fn();
    const gateway = sampleGateway();

    renderWithProviders(
      <DeviceInventoryTable gateway={gateway} connected onRefresh={onRefresh} />,
    );

    await user.click(screen.getByRole('button', { name: /Add device/i }));
    const menu = screen.getByRole('menu', { name: /Choose device type/i });
    await user.click(within(menu).getByRole('menuitem', { name: /Lock/i }));

    expect(simulator.addDevice).toHaveBeenCalledWith(gateway.id, 'lock');
    expect(onRefresh).toHaveBeenCalled();
  });
});
