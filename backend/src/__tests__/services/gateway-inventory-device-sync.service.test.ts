const mockFindByGatewayId = jest.fn();
const mockUpsert = jest.fn();
const mockFindById = jest.fn();
const mockDeleteNetworkInfraFromInventory = jest.fn();
const mockCancelForNetworkInfra = jest.fn();
const mockFindByIdGateway = jest.fn();
const mockUpdateGateway = jest.fn();

jest.mock('@/models/gateway-inventory-device.model', () => ({
  GatewayInventoryDeviceModel: jest.fn().mockImplementation(() => ({
    findByGatewayId: (...args: unknown[]) => mockFindByGatewayId(...args),
    upsert: (...args: unknown[]) => mockUpsert(...args),
    extractMetadataFromPayload: (item: Record<string, unknown>) => {
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        if (!['kind', 'serial', 'state', 'firmware_version', 'info'].includes(key)) {
          metadata[key] = value;
        }
      }
      return metadata;
    },
  })),
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: (...args: unknown[]) => mockFindByIdGateway(...args),
    update: (...args: unknown[]) => mockUpdateGateway(...args),
    findBoundGatewaysWithContext: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('@/services/devices.service', () => ({
  DevicesService: {
    getInstance: jest.fn(() => ({
      deleteNetworkInfraFromInventory: (...args: unknown[]) =>
        mockDeleteNetworkInfraFromInventory(...args),
    })),
  },
}));

jest.mock('@/services/device-deletion-outbox.service', () => ({
  DeviceDeletionOutboxService: {
    getInstance: jest.fn(() => ({
      cancelForNetworkInfra: (...args: unknown[]) => mockCancelForNetworkInfra(...args),
    })),
  },
}));

import { GatewayInventoryDeviceSyncService } from '@/services/gateway-inventory-device-sync.service';

describe('GatewayInventoryDeviceSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GatewayInventoryDeviceSyncService as unknown as { instance?: GatewayInventoryDeviceSyncService }).instance =
      undefined;
    mockFindByIdGateway.mockResolvedValue({ id: 'gw-1', facility_id: 'fac-1' });
    mockFindByGatewayId.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({});
    mockDeleteNetworkInfraFromInventory.mockResolvedValue({});
    mockCancelForNetworkInfra.mockResolvedValue(undefined);
    mockUpdateGateway.mockResolvedValue({});
  });

  it('removes sync-managed infra rows omitted from an empty inventory payload', async () => {
    mockFindByGatewayId
      .mockResolvedValueOnce([
        {
          id: 'dev-1',
          device_kind: 'bridge',
          device_serial: 'BR-OLD',
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await GatewayInventoryDeviceSyncService.getInstance().syncNetworkInfraInventory(
      'gw-1',
      [],
    );

    expect(mockDeleteNetworkInfraFromInventory).toHaveBeenCalledWith('dev-1', {
      source: 'gateway_sync',
    });
    expect(result.removed).toBe(1);
  });

  it('cancels pending tombstones when infra devices reappear in inventory', async () => {
    await GatewayInventoryDeviceSyncService.getInstance().syncNetworkInfraInventory('gw-1', [
      { kind: 'bridge', serial: 'BR-1', state: 'healthy' },
    ]);

    expect(mockCancelForNetworkInfra).toHaveBeenCalledWith('fac-1', 'bridge', 'BR-1');
  });

  it('does not overwrite last_seen when gateway omits it on update', async () => {
    mockFindByGatewayId.mockResolvedValue([
      {
        id: 'dev-1',
        device_kind: 'bridge',
        device_serial: 'BR-1',
        state: 'healthy',
        firmware_version: '1.0.0',
        info: {},
        metadata: {},
        last_seen: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await GatewayInventoryDeviceSyncService.getInstance().syncNetworkInfraInventory('gw-1', [
      { kind: 'bridge', serial: 'BR-1', state: 'healthy', firmware_version: '1.0.0' },
    ]);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceSerial: 'BR-1',
      }),
    );
    expect(mockUpsert.mock.calls[0][0]).not.toHaveProperty('lastSeen');
  });

  it('applyGatewayInventoryUpdate stringifies metadata JSON for MySQL', async () => {
    mockFindByIdGateway.mockResolvedValue({ id: 'gw-1', metadata: { existing: true } });

    await GatewayInventoryDeviceSyncService.getInstance().applyGatewayInventoryUpdate('gw-1', {
      kind: 'gateway',
      serial: 'AA:BB:CC:DD:EE:FF',
      state: 'healthy',
      firmware_version: '9.9.9-e2e',
      info: { mesh_version: 'e2e' },
    });

    expect(mockUpdateGateway).toHaveBeenCalledWith(
      'gw-1',
      expect.objectContaining({
        firmware_version: '9.9.9-e2e',
        mac_address: 'AA:BB:CC:DD:EE:FF',
        metadata: JSON.stringify({
          existing: true,
          inventory_info: { mesh_version: 'e2e' },
        }),
      }),
    );
  });
});
