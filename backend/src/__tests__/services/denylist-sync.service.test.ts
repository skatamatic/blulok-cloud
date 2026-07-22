const mockFindBluLokDevices = jest.fn();
const mockFindAccessControlDevices = jest.fn();
const mockFindActiveByDeviceIds = jest.fn();
const mockFindByFacilityId = jest.fn();
const mockGetFacilityConnectionStatus = jest.fn();
const mockUnicastToFacility = jest.fn();
const mockBuildDenylistSync = jest.fn().mockResolvedValue('signed.jwt.token');

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

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
  })),
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getFacilityConnectionStatus: (...args: unknown[]) => mockGetFacilityConnectionStatus(...args),
      unicastToFacility: (...args: unknown[]) => mockUnicastToFacility(...args),
    })),
  },
}));

jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistSync: (...args: unknown[]) => mockBuildDenylistSync(...args),
  },
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
    mockFindByFacilityId.mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' });
    mockGetFacilityConnectionStatus.mockReturnValue({ connected: true });
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

  it('pushSnapshotToFacility signs and unicasts DENYLIST_SYNC when gateway is online', async () => {
    await DenylistSyncService.pushSnapshotToFacility('fac-1');

    expect(mockFindByFacilityId).toHaveBeenCalledWith('fac-1');
    expect(mockBuildDenylistSync).toHaveBeenCalledWith(
      'fac-1',
      expect.arrayContaining([
        expect.objectContaining({ cloud_device_id: 'lock-uuid-1' }),
      ]),
    );
    expect(mockUnicastToFacility).toHaveBeenCalledWith('fac-1', 'signed.jwt.token');
  });

  it('pushSnapshotToFacility no-ops when unbound or offline', async () => {
    mockFindByFacilityId.mockResolvedValueOnce(null);
    await DenylistSyncService.pushSnapshotToFacility('fac-1');
    expect(mockUnicastToFacility).not.toHaveBeenCalled();

    mockFindByFacilityId.mockResolvedValueOnce({ id: 'gw-1' });
    mockGetFacilityConnectionStatus.mockReturnValueOnce({ connected: false });
    await DenylistSyncService.pushSnapshotToFacility('fac-1');
    expect(mockUnicastToFacility).not.toHaveBeenCalled();
  });
});
