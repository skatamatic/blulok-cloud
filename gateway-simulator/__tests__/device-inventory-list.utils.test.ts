import { describe, expect, it } from 'vitest';
import type { DeviceInventoryItem } from '@protocol/device-kinds';
import {
  DEFAULT_DEVICE_LIST_FILTERS,
  deviceMatchesFilters,
  filterAndSortDevices,
  getDeviceSearchableText,
  getDeviceSortValue,
  isDeviceSortColumn,
} from '../src/renderer/utils/device-inventory-list.utils';

const lock = (overrides: Partial<Extract<DeviceInventoryItem, { kind: 'lock' }>> = {}): DeviceInventoryItem => ({
  kind: 'lock',
  lock_id: 'L-001',
  lock_number: 1,
  state: 'CLOSED',
  locked: true,
  online: true,
  firmware_version: '1.0.0',
  battery_level: 85,
  signal_strength: -60,
  ...overrides,
});

const gateway = (): DeviceInventoryItem => ({
  kind: 'gateway',
  serial: 'GW-1',
  firmware_version: '3.0.0',
});

describe('device-inventory-list.utils', () => {
  it('getDeviceSortValue reads kind-specific fields', () => {
    expect(getDeviceSortValue(lock(), 'battery')).toBe(85);
    expect(getDeviceSortValue(lock(), 'signal')).toBe(-60);
    expect(getDeviceSortValue(gateway(), 'online')).toBeNull();
    expect(getDeviceSortValue(gateway(), 'state')).toBe('');
  });

  it('getDeviceSearchableText includes labels and telemetry tokens', () => {
    const text = getDeviceSearchableText(lock({ battery_level: 42, signal_strength: -70 }));
    expect(text).toContain('lock');
    expect(text).toContain('online');
    expect(text).toContain('locked');
    expect(text).toContain('42');
    expect(text).toContain('-70');
  });

  it('deviceMatchesFilters applies search, kind, and online filters', () => {
    expect(deviceMatchesFilters(lock(), { ...DEFAULT_DEVICE_LIST_FILTERS, search: 'l-001' })).toBe(true);
    expect(deviceMatchesFilters(lock(), { ...DEFAULT_DEVICE_LIST_FILTERS, search: 'missing' })).toBe(false);
    expect(deviceMatchesFilters(lock(), { ...DEFAULT_DEVICE_LIST_FILTERS, kind: 'bridge' })).toBe(false);
    expect(deviceMatchesFilters(lock({ online: false }), { ...DEFAULT_DEVICE_LIST_FILTERS, online: 'offline' })).toBe(
      true,
    );
    expect(deviceMatchesFilters(gateway(), { ...DEFAULT_DEVICE_LIST_FILTERS, online: 'offline' })).toBe(true);
    expect(deviceMatchesFilters(gateway(), { ...DEFAULT_DEVICE_LIST_FILTERS, online: 'online' })).toBe(false);
  });

  it('filterAndSortDevices sorts by column and direction', () => {
    const devices = [
      lock({ lock_id: 'B-2', battery_level: 10 }),
      lock({ lock_id: 'A-1', battery_level: 90 }),
    ];
    const asc = filterAndSortDevices(devices, {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      sortColumn: 'battery',
      sortDirection: 'asc',
    });
    expect(asc[0]).toMatchObject({ lock_id: 'B-2' });

    const desc = filterAndSortDevices(devices, {
      ...DEFAULT_DEVICE_LIST_FILTERS,
      sortColumn: 'battery',
      sortDirection: 'desc',
    });
    expect(desc[0]).toMatchObject({ lock_id: 'A-1' });
  });

  it('isDeviceSortColumn validates column ids', () => {
    expect(isDeviceSortColumn('firmware')).toBe(true);
    expect(isDeviceSortColumn('nope')).toBe(false);
  });
});
