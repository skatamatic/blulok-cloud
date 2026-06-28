const mockFindBluLokDevices = jest.fn();
const mockFindAccessControlDevices = jest.fn();
const mockFindActiveByDeviceIds = jest.fn();

jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    findBluLokDevices: (...args: unknown[]) => mockFindBluLokDevices(...args),
    findAccessControlDevices: (...args: unknown[]) => mockFindAccessControlDevices(...args),
  })),
}));

jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    findActiveByDeviceIds: (...args: unknown[]) => mockFindActiveByDeviceIds(...args),
  })),
}));

import { DenylistSyncService } from '@/services/denylist-sync.service';

describe('DenylistSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindBluLokDevices.mockResolvedValue([
      { id: 'lock-uuid-1', device_serial: 'L-001' },
    ]);
    mockFindAccessControlDevices.mockResolvedValue([
      { id: 'ac-uuid-1', device_serial: 'AC-001', relay_channel: 1 },
    ]);
    mockFindActiveByDeviceIds.mockResolvedValue([
      {
        device_id: 'lock-uuid-1',
        user_id: 'tenant-1',
        expires_at: new Date('2099-01-01T00:00:00Z'),
      },
    ]);
  });

  it('buildOperationalSyncForGateway returns denylist rows keyed by cloud device id', async () => {
    const rows = await DenylistSyncService.buildOperationalSyncForGateway('gw-1');

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.cloud_device_id === 'lock-uuid-1')).toMatchObject({
      kind: 'lock',
      serial: 'L-001',
      denylist: [{
        sub: 'tenant-1',
        exp: Math.floor(new Date('2099-01-01T00:00:00Z').getTime() / 1000),
      }],
    });
    expect(rows.find((row) => row.cloud_device_id === 'ac-uuid-1')).toMatchObject({
      kind: 'access_control',
      serial: 'AC-001',
      denylist: [],
    });
  });

  it('getDenylistsForDeviceIds groups active entries', async () => {
    mockFindActiveByDeviceIds.mockResolvedValueOnce([
      {
        device_id: 'dev-1',
        user_id: 'user-a',
        expires_at: null,
      },
    ]);

    const grouped = await DenylistSyncService.getDenylistsForDeviceIds(['dev-1']);
    expect(grouped.get('dev-1')).toEqual([{ sub: 'user-a', exp: 4_102_444_800 }]);
  });
});
