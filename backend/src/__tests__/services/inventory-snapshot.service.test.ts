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

import { InventorySnapshotService } from '@/services/gateway/inventory-snapshot.service';

describe('InventorySnapshotService', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { __mockStorage: mockStorage } = require('@/services/provisioning/provisioning-storage.factory');

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindByFacilityId.mockResolvedValue({ id: 'gw-bound', facility_id: 'fac-1' });
    mockGetGatewayWithDevices.mockResolvedValue({
      blulokDevices: [
        { id: 'd2', device_serial: 'B-002', unit_id: 'u2', unit_number: '102', lock_number: 2 },
        { id: 'd1', device_serial: 'A-001', unit_id: 'u1', unit_number: '101', lock_number: 1 },
      ],
      accessControlDevices: [{ id: 'ac1', device_serial: 'AC-1', relay_channel: 1 }],
    });
    mockSnapshotCreate.mockResolvedValue(undefined);
  });

  it('builds deterministic snapshot payload', () => {
    const payload = InventorySnapshotService.buildSnapshotPayload(
      'fac-1',
      'gw-new',
      [
        { id: 'd2', device_serial: 'B-002', unit_id: 'u2', unit_number: '102', lock_number: 2 },
        { id: 'd1', device_serial: 'A-001', unit_id: 'u1', unit_number: '101', lock_number: 1 },
      ],
      [{ id: 'ac1', device_serial: 'AC-1', relay_channel: 1 }],
    );
    expect(payload.schema_version).toBe(1);
    expect(payload.devices.some((d) => d.serial === 'A-001')).toBe(true);
    expect(payload.devices.some((d) => d.kind === 'access_control')).toBe(true);
    expect(payload.devices[0].serial).toBe('AC-1');
  });

  it('serializes deterministically for same payload', () => {
    const payload = InventorySnapshotService.buildSnapshotPayload('fac', 'gw', [], []);
    const a = InventorySnapshotService.serializeDeterministic(payload);
    const b = InventorySnapshotService.serializeDeterministic(payload);
    expect(a).toBe(b);
  });

  it('previewForFacility returns empty when no gateway bound', async () => {
    mockFindByFacilityId.mockResolvedValueOnce(null);
    await expect(InventorySnapshotService.previewForFacility('fac-1')).resolves.toEqual([]);
  });

  it('previewForFacility returns sorted device list', async () => {
    const devices = await InventorySnapshotService.previewForFacility('fac-1');
    expect(devices).toHaveLength(3);
    expect(devices.map((d) => d.serial)).toEqual(['AC-1', 'A-001', 'B-002']);
  });

  it('buildAndStoreForFacility writes storage and creates snapshot row', async () => {
    const result = await InventorySnapshotService.buildAndStoreForFacility('fac-1', 'gw-target');

    expect(result.deviceCount).toBe(3);
    expect(result.storagePath).toMatch(/^inventory-snapshots\/gw-target\//);
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
        device_count: 3,
      }),
    );
  });

  it('loadSnapshotBinary verifies sha256 before returning binary', async () => {
    const payload = InventorySnapshotService.buildSnapshotPayload('fac-1', 'gw-1', [], []);
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
