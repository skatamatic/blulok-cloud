import { sortMergedDeviceList } from '../merged-device-list.utils';

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
});
