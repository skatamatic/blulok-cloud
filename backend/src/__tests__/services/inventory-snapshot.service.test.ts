import * as crypto from 'crypto';

const mockFindByFacilityId = jest.fn();
const mockGetGatewayWithDevices = jest.fn();
const mockSnapshotCreate = jest.fn();
const mockSnapshotFindById = jest.fn();

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
    getGatewayWithDevices: (...args: unknown[]) => mockGetGatewayWithDevices(...args),
  })),
}));

jest.mock('@/models/gateway-recovery.model', () => ({
  GatewayInventorySnapshotModel: jest.fn().mockImplementation(() => ({
    create: (...args: unknown[]) => mockSnapshotCreate(...args),
    findById: (...args: unknown[]) => mockSnapshotFindById(...args),
  })),
}));

jest.mock('@/services/provisioning/provisioning-storage.factory', () => {
  const mockStorage = {
    initialize: jest.fn().mockResolvedValue(undefined),
    writePreparedUpload: jest.fn().mockResolvedValue(undefined),
    download: jest.fn(),
  };
  return {
    getProvisioningStorageProvider: jest.fn().mockResolvedValue(mockStorage),
    __mockStorage: mockStorage,
  };
});

const mockGetDenylistsForDeviceIds = jest.fn().mockResolvedValue(new Map());
jest.mock('@/services/denylist-sync.service', () => ({
  DenylistSyncService: {
    getDenylistsForDeviceIds: (...args: unknown[]) => mockGetDenylistsForDeviceIds(...args),
  },
  DenylistSyncEntry: {},
}));

import {
  InventorySnapshotService,
  inventorySnapshotDeviceKey,
  inventorySnapshotDeviceLabel,
} from '@/services/gateway/inventory-snapshot.service';

describe('InventorySnapshotService', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __mockStorage: mockStorage } = require('@/services/provisioning/provisioning-storage.factory');

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDenylistsForDeviceIds.mockResolvedValue(new Map([
      ['d1', [{ sub: 'tenant-1', exp: 9999999999 }]],
    ]));
    mockFindByFacilityId.mockResolvedValue({ id: 'gw-bound', facility_id: 'fac-1' });
    mockGetGatewayWithDevices.mockResolvedValue({
      blulokDevices: [
        {
          id: 'd2',
          device_serial: 'B-002',
          unit_id: 'u2',
          unit_number: '102',
          device_settings: { lockNumber: 2 },
        },
        {
          id: 'd1',
          device_serial: 'A-001',
          unit_id: 'u1',
          unit_number: '101',
          device_settings: { lockNumber: 1 },
        },
      ],
      accessControlDevices: [{ id: 'ac1', device_serial: 'AC-1', relay_channel: 1 }],
      inventoryDevices: [{ id: 'br1', device_kind: 'bridge', device_serial: 'BR-1', state: 'healthy' }],
    });
    mockSnapshotCreate.mockResolvedValue(undefined);
  });

  it('builds deterministic snapshot payload with gateway-native identifiers', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [
        {
          id: 'd2',
          device_serial: 'B-002',
          unit_id: 'u2',
          unit_number: '102',
          device_settings: { lockNumber: 2 },
        },
        {
          id: 'd1',
          device_serial: 'A-001',
          unit_id: 'u1',
          unit_number: '101',
          device_settings: { lockNumber: 1 },
        },
      ],
      [{ id: 'ac1', device_serial: 'AC-1', relay_channel: 1 }],
    );
    expect(payload.schema_version).toBe(2);
    expect(payload.devices.some((d) => d.kind === 'lock' && d.lock_id === 'A-001')).toBe(true);
    expect(payload.devices.some((d) => d.kind === 'access_control' && d.access_id === 'AC-1')).toBe(true);
    expect(payload.devices[0]).toMatchObject({ kind: 'access_control', access_id: 'AC-1' });
    expect(JSON.stringify(payload)).not.toContain('device_id');
  });

  it('omits cloud device_id and serial on lock rows — only lock_id', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [{
        id: '7bf0fc9a-6b29-11f1-b308-42010a280008',
        device_serial: '0961cd2f-f892-4a5e-921c-45abe91068d2',
        device_settings: { lockNumber: 2453 },
      }],
      [],
    );
    const lock = payload.devices.find((d) => d.kind === 'lock');
    expect(lock).toMatchObject({
      lock_id: '0961cd2f-f892-4a5e-921c-45abe91068d2',
      lock_number: 2453,
    });
    expect(lock).not.toHaveProperty('device_id');
    expect(lock).not.toHaveProperty('serial');
  });

  it('reads lock_number from device_settings.lockNumber', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [{
        id: 'd1',
        device_serial: 'A-001',
        device_settings: { lockNumber: 16136 },
      }],
      [],
    );
    expect(payload.devices[0]?.kind === 'lock' && payload.devices[0].lock_number).toBe(16136);
  });

  it('includes gateway-synced locks not assigned to a unit (null unit_id/unit_number)', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [
        {
          id: 'd1',
          device_serial: 'A-001',
          unit_id: 'u1',
          unit_number: '101',
          device_settings: { lockNumber: 1 },
        },
        { id: 'd2', device_serial: 'SIM-LOCK-xyz', unit_id: null, unit_number: null },
      ],
      [],
    );
    const synced = payload.devices.find((d) => d.kind === 'lock' && d.lock_id === 'SIM-LOCK-xyz');
    expect(synced).toBeDefined();
    expect(synced?.unit_id).toBeNull();
  });

  it('includes network infra devices with serial only', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [],
      [],
      [{ id: 'br1', device_kind: 'bridge', device_serial: 'BR-1', state: 'healthy', info: { hop: 2 } }],
    );
    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0]).toMatchObject({
      kind: 'bridge',
      serial: 'BR-1',
      state: 'healthy',
    });
    expect(payload.devices[0]).not.toHaveProperty('device_id');
  });

  it('excludes gateway inventory rows from recovery snapshot payload', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [],
      [],
      [
        { id: 'gw1', device_kind: 'gateway', device_serial: 'GW-SELF', state: 'healthy' },
        { id: 'fn1', device_kind: 'friend_node', device_serial: 'FN-1', state: 'healthy' },
      ],
    );
    expect(payload.devices).toHaveLength(1);
    expect(payload.devices[0]?.kind).toBe('friend_node');
  });

  it('serializes deterministically for same payload', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload('fac', 'gw', [], []);
    const a = InventorySnapshotService.serializeDeterministic(payload);
    const b = InventorySnapshotService.serializeDeterministic(payload);
    expect(a).toBe(b);
  });

  it('serializeDeterministic preserves gateway-native device fields', () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [{
        id: 'd1',
        device_serial: 'A-001',
        unit_id: 'u1',
        unit_number: '101',
        device_settings: { lockNumber: 1 },
      }],
      [{ id: 'ac1', device_serial: 'AC-1', relay_channel: 1 }],
    );
    const parsed = JSON.parse(InventorySnapshotService.serializeDeterministic(payload)) as {
      devices: Array<{ kind: string; lock_id?: string; access_id?: string }>;
    };
    expect(parsed.devices).toHaveLength(2);
    expect(parsed.devices.some((d) => d.kind === 'lock' && d.lock_id === 'A-001')).toBe(true);
    expect(parsed.devices.some((d) => d.kind === 'access_control' && d.access_id === 'AC-1')).toBe(true);
  });

  it('inventorySnapshotDeviceKey and label resolve gateway identifiers', () => {
    expect(inventorySnapshotDeviceKey({
      kind: 'lock',
      lock_id: 'L-001',
    })).toBe('lock:L-001');
    expect(inventorySnapshotDeviceLabel({
      kind: 'access_control',
      access_id: 'AC-1',
      relay_channel: 2,
    })).toBe('AC-1 (relay 2)');
  });

  it('previewForFacility returns empty when no gateway bound', async () => {
    mockFindByFacilityId.mockResolvedValueOnce(null);
    await expect(InventorySnapshotService.previewForFacility('fac-1')).resolves.toEqual([]);
  });

  it('previewForFacility returns sorted device list with denylist enrichment', async () => {
    const devices = await InventorySnapshotService.previewForFacility('fac-1');
    expect(devices).toHaveLength(4);
    expect(devices.map(inventorySnapshotDeviceLabel)).toEqual(['AC-1', 'BR-1', 'A-001', 'B-002']);
    const lock = devices.find((d) => d.kind === 'lock' && d.lock_id === 'A-001');
    expect(lock?.denylist).toEqual([{ sub: 'tenant-1', exp: 9999999999 }]);
    expect(mockGetDenylistsForDeviceIds).toHaveBeenCalledWith(['d2', 'd1', 'ac1']);
  });

  it('buildAndStoreForFacility writes storage and creates snapshot row', async () => {
    const result = await InventorySnapshotService.buildAndStoreForFacility('fac-1', 'gw-target');

    expect(result.deviceCount).toBe(4);
    expect(result.storagePath).toMatch(/^provisioning\/inventory-snapshots\/gw-target\//);
    expect(mockStorage.writePreparedUpload).toHaveBeenCalledWith(
      result.storagePath,
      expect.any(Buffer),
    );
    expect(mockSnapshotCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: result.snapshotId,
        gateway_id: 'gw-target',
        facility_id: 'fac-1',
        sha256_hash: result.sha256,
        device_count: 4,
      }),
    );
  });

  it('loadSnapshotBinary verifies sha256 before returning binary', async () => {
    const { payload } = InventorySnapshotService.buildSnapshotPayload('fac-1', 'gw-1', [], []);
    const json = InventorySnapshotService.serializeDeterministic(payload);
    const binary = Buffer.from(json, 'utf8');
    const sha256 = crypto.createHash('sha256').update(binary).digest('hex');

    mockSnapshotFindById.mockResolvedValueOnce({
      id: 'snap-1',
      storage_path: 'inventory-snapshots/gw-1/snap-1.json',
      sha256_hash: sha256,
    });
    mockStorage.download.mockResolvedValueOnce(binary);

    const loaded = await InventorySnapshotService.loadSnapshotBinary('snap-1');
    expect(loaded.binary.equals(binary)).toBe(true);
  });

  it('loadSnapshotBinary rejects hash mismatch', async () => {
    mockSnapshotFindById.mockResolvedValueOnce({
      id: 'snap-1',
      storage_path: 'inventory-snapshots/gw-1/snap-1.json',
      sha256_hash: 'a'.repeat(64),
    });
    mockStorage.download.mockResolvedValueOnce(Buffer.from('tampered'));

    await expect(InventorySnapshotService.loadSnapshotBinary('snap-1')).rejects.toThrow(
      /SHA-256 mismatch/,
    );
  });

  it('loadSnapshotBinary throws when snapshot missing', async () => {
    mockSnapshotFindById.mockResolvedValueOnce(null);
    await expect(InventorySnapshotService.loadSnapshotBinary('missing')).rejects.toThrow(
      /not found/,
    );
  });
});
