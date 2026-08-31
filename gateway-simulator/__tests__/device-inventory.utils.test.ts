import { describe, expect, it } from 'vitest';
import {
  buildDeviceSummaryStats,
  inventoryDeviceKey,
  inventoryDeviceLabel,
  isEditableInventoryDevice,
  isDeviceInErrorState,
  isLockShownOpen,
  resolveDevicePresenceStatus,
  supportsAccessEvents,
} from '../src/renderer/utils/device-inventory.utils';

describe('device-inventory.utils', () => {
  it('inventoryDeviceKey formats composite keys', () => {
    expect(inventoryDeviceKey({ kind: 'lock', lock_id: 'L1', online: true, locked: true })).toBe('lock:L1');
    expect(
      inventoryDeviceKey({
        kind: 'access_control',
        access_id: 'AC1',
        relay_channel: 2,
        online: true,
        locked: false,
      }),
    ).toBe('access_control:AC1:2');
    expect(inventoryDeviceKey({ kind: 'bridge', serial: 'BR-1', online: true, state: 'healthy' })).toBe(
      'bridge:BR-1',
    );
  });

  it('inventoryDeviceLabel is human readable', () => {
    expect(inventoryDeviceLabel({ kind: 'lock', lock_id: 'L1', online: true, locked: true })).toBe('L1');
    expect(
      inventoryDeviceLabel({
        kind: 'access_control',
        access_id: 'AC1',
        relay_channel: 3,
        online: true,
        locked: false,
      }),
    ).toContain('AC1');
  });

  it('supportsAccessEvents and isEditableInventoryDevice', () => {
    expect(supportsAccessEvents({ kind: 'lock', lock_id: 'L', online: true, locked: true })).toBe(true);
    expect(supportsAccessEvents({ kind: 'bridge', serial: 'B', online: true, state: 'healthy' })).toBe(false);
    expect(isEditableInventoryDevice({ kind: 'gateway', serial: 'G', state: 'healthy', last_seen: '' })).toBe(false);
    expect(isEditableInventoryDevice({ kind: 'lock', lock_id: 'L', online: true, locked: true })).toBe(true);
  });

  it('buildDeviceSummaryStats returns readonly chips for collapsed cards', () => {
    expect(
      buildDeviceSummaryStats({
        kind: 'lock',
        lock_id: 'L1',
        state: 'CLOSED',
        locked: true,
        online: true,
        battery_level: 3400,
        signal_strength: -55,
        firmware_version: '2.0.0',
      }).map((s) => s.label),
    ).toEqual(['CLOSED', '3400 mV', '-55 dBm', 'v2.0.0']);

    expect(
      buildDeviceSummaryStats({
        kind: 'access_control',
        access_id: 'AC1',
        relay_channel: 1,
        device_type: 'door',
        locked: false,
        online: false,
        firmware_version: '1.1.0',
      }).map((s) => s.key),
    ).toEqual(['type', 'locked', 'firmware']);
  });

  it('resolveDevicePresenceStatus prefers error over online/offline', () => {
    expect(
      resolveDevicePresenceStatus({
        kind: 'lock',
        lock_id: 'L1',
        state: 'ERROR',
        online: true,
        locked: false,
      }),
    ).toBe('error');

    expect(
      resolveDevicePresenceStatus({
        kind: 'access_control',
        access_id: 'AC1',
        online: true,
        locked: true,
        error_code: 'E42',
      }),
    ).toBe('error');

    expect(
      resolveDevicePresenceStatus({
        kind: 'lock',
        lock_id: 'L2',
        state: 'CLOSED',
        online: true,
        locked: true,
      }),
    ).toBe('online');

    expect(
      resolveDevicePresenceStatus({
        kind: 'bridge',
        serial: 'BR-1',
        online: false,
        state: 'healthy',
      }),
    ).toBe('offline');
  });

  it('isDeviceInErrorState detects fault-like infra states', () => {
    expect(
      isDeviceInErrorState({ kind: 'bridge', serial: 'BR-1', online: true, state: 'link_fault' }),
    ).toBe(true);
  });

  it('isLockShownOpen reflects lock state and locked flag', () => {
    expect(
      isLockShownOpen({ kind: 'lock', lock_id: 'L1', state: 'OPENED', locked: false, online: true }),
    ).toBe(true);
    expect(
      isLockShownOpen({ kind: 'lock', lock_id: 'L2', state: 'CLOSED', locked: true, online: true }),
    ).toBe(false);
    expect(
      isLockShownOpen({ kind: 'lock', lock_id: 'L3', state: 'UNKNOWN', locked: false, online: true }),
    ).toBe(true);
    expect(
      isLockShownOpen({ kind: 'access_control', access_id: 'AC1', locked: false, online: true }),
    ).toBe(false);
  });
});
