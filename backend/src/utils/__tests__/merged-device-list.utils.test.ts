import {
  normalizeNetworkInfraSortKey,
  sortMergedDeviceList,
} from '../merged-device-list.utils';

describe('sortMergedDeviceList', () => {
  it('sorts by name using natural order for access control display names', () => {
    const devices = [
      { id: 'b', device_category: 'access_control', name: 'Gate 10' },
      { id: 'a', device_category: 'access_control', name: 'Gate 2' },
      { id: 'c', device_category: 'access_control', name: 'Gate 1' },
    ];
    sortMergedDeviceList(devices as Record<string, unknown>[], 'name', 'asc');
    expect(devices.map((d) => d.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts network infra rows by mapped device_kind', () => {
    const devices = [
      { id: '1', device_category: 'network_infra', device_kind: 'friend_node', name: 'FN-1', device_serial: 'FN-1', status: 'online' },
      { id: '2', device_category: 'network_infra', device_kind: 'bridge', name: 'BR-1', device_serial: 'BR-1', status: 'online' },
    ];
    sortMergedDeviceList(devices as Record<string, unknown>[], 'device_kind', 'asc');
    expect(devices.map((d) => d.id)).toEqual(['2', '1']);
  });
});

describe('normalizeNetworkInfraSortKey', () => {
  it('maps operational table keys to infra sort keys', () => {
    expect(normalizeNetworkInfraSortKey('device_type')).toBe('device_kind');
    expect(normalizeNetworkInfraSortKey('last_activity')).toBe('last_seen');
  });
});
