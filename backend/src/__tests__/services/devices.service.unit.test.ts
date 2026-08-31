/**
 * DevicesService unit tests — assignment rules, unassign, and access checks.
 * Mocks DatabaseService (knex), models, and DeviceEventService; no integration DB.
 */
import { mockDatabaseService } from '@/__tests__/mocks/database.mock';
import { UserRole } from '@/types/auth.types';

const mockUnitFindById = jest.fn();
jest.mock('@/models/unit.model', () => ({
  UnitModel: jest.fn().mockImplementation(() => ({
    findById: mockUnitFindById,
  })),
}));

const mockAssignDeviceToUnit = jest.fn().mockResolvedValue(undefined);
const mockUnassignDeviceFromUnit = jest.fn().mockResolvedValue(undefined);
jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    assignDeviceToUnit: mockAssignDeviceToUnit,
    unassignDeviceFromUnit: mockUnassignDeviceFromUnit,
  })),
}));

const mockSyncUnitLinkedMembers = jest.fn().mockResolvedValue(undefined);
const mockRemoveDirectBluLokMembershipsForDevice = jest.fn().mockResolvedValue(1);
jest.mock('@/models/device-group.model', () => ({
  DeviceGroupModel: jest.fn().mockImplementation(() => ({
    syncUnitLinkedMembers: mockSyncUnitLinkedMembers,
    removeDirectBluLokMembershipsForDevice: mockRemoveDirectBluLokMembershipsForDevice,
  })),
}));

const mockEmitAssigned = jest.fn();
const mockEmitUnassigned = jest.fn();
const mockEmitRemoved = jest.fn();
jest.mock('@/services/device-event.service', () => ({
  DeviceEventService: {
    getInstance: jest.fn(() => ({
      emitDeviceAssigned: mockEmitAssigned,
      emitDeviceUnassigned: mockEmitUnassigned,
      emitDeviceRemoved: mockEmitRemoved,
    })),
  },
}));

const mockPushCodesToGateway = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn(() => ({
      pushCodesToGateway: mockPushCodesToGateway,
    })),
  },
}));

const mockEnqueueDeletion = jest.fn().mockResolvedValue({ id: 'outbox-1' });
jest.mock('@/services/device-deletion-outbox.service', () => ({
  DeviceDeletionOutboxService: {
    getInstance: jest.fn(() => ({
      enqueueDeletion: mockEnqueueDeletion,
    })),
  },
}));

import { DevicesService } from '@/services/devices.service';

function resetDevicesServiceSingleton() {
  (DevicesService as unknown as { instance?: DevicesService }).instance = undefined;
}

/** Minimal knex chain: .where().first() and .where().where().first() */
function makeKnexForAssign(opts: {
  deviceRow: { id: string; gateway_id: string; unit_id: string | null } | null;
  gatewayRow: { id: string; facility_id: string } | null;
  existingOnUnit: { id: string } | null;
}) {
  return jest.fn((table: string) => {
    const chain: {
      where: jest.Mock;
      first: jest.Mock;
    } = {
      where: jest.fn(),
      first: jest.fn(),
    };

    chain.where.mockImplementation((col: string, val: unknown) => {
      if (table === 'blulok_devices') {
        if (col === 'id') {
          chain.first = jest.fn().mockResolvedValue(opts.deviceRow);
        }
        if (col === 'unit_id') {
          chain.first = jest.fn().mockResolvedValue(opts.existingOnUnit);
        }
      }
      if (table === 'gateways' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.gatewayRow);
      }
      return chain;
    });

    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  });
}

function makeKnexForUnassign(deviceRow: { id: string; gateway_id: string; unit_id: string | null } | null) {
  return jest.fn((table: string) => {
    const chain: { where: jest.Mock; first: jest.Mock } = {
      where: jest.fn(),
      first: jest.fn(),
    };
    chain.where.mockImplementation((col: string, val: unknown) => {
      if (table === 'blulok_devices' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(deviceRow);
      }
      if (table === 'gateways' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue({ id: val, facility_id: 'fac-1' });
      }
      return chain;
    });
    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  });
}

/** Transaction knex for removeBluLokDeviceFromCloudInventory */
function makeKnexForRemoveInventory(opts: {
  device: { id: string; gateway_id: string; unit_id: string | null; device_serial?: string } | null;
  gateway: { id: string; facility_id: string | null } | null;
  deleteRows?: number;
  accessCodeGroupMember?: Record<string, unknown> | null;
}) {
  const groupMemberDel = jest.fn().mockResolvedValue(1);

  const makeTrxTable = (table: string) => {
    if (table.includes('device_group_members')) {
      return {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(opts.accessCodeGroupMember ?? null),
        del: groupMemberDel,
      };
    }

    const chain: { where: jest.Mock; first: jest.Mock; del: jest.Mock; andWhere: jest.Mock } = {
      where: jest.fn(),
      first: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      andWhere: jest.fn().mockReturnThis(),
    };

    chain.where.mockImplementation((colOrObj: string | Record<string, unknown>, val?: unknown) => {
      if (table === 'blulok_devices') {
        if (typeof colOrObj === 'string' && colOrObj === 'id') {
          chain.first = jest.fn().mockResolvedValue(opts.device);
          chain.del = jest.fn().mockResolvedValue(opts.deleteRows ?? (opts.device ? 1 : 0));
        }
      }
      if (table === 'gateways' && colOrObj === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.gateway);
      }
      return chain;
    });

    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  };

  const trx = jest.fn((table: string) => makeTrxTable(table)) as jest.Mock & {
    transaction: jest.Mock;
  };

  const connection = Object.assign(trx, {
    transaction: jest.fn().mockImplementation(async (callback: (t: typeof trx) => Promise<unknown>) =>
      callback(trx),
    ),
  });

  return connection;
}

function makeKnexForAccess(opts: {
  device: { id: string; gateway_id: string } | null;
  gateway: { facility_id: string } | null;
  association: unknown | null;
  deviceTable?: 'blulok_devices' | 'access_control_devices' | 'gateway_inventory_devices';
}) {
  const deviceTable = opts.deviceTable ?? 'blulok_devices';
  return jest.fn((table: string) => {
    const chain: { where: jest.Mock; first: jest.Mock } = {
      where: jest.fn(),
      first: jest.fn(),
    };
    let whereCalls = 0;
    chain.where.mockImplementation((col: string, val: unknown) => {
      if (table === deviceTable && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.device);
      }
      if (table === 'gateways' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.gateway);
      }
      if (table === 'user_facility_associations') {
        whereCalls += 1;
        if (whereCalls >= 2) {
          chain.first = jest.fn().mockResolvedValue(opts.association);
        }
      }
      return chain;
    });
    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  });
}

function makeKnexForRemoveNetworkInfra(opts: {
  device: {
    id: string;
    gateway_id: string;
    device_kind: string;
    device_serial: string;
  } | null;
  gateway: { id: string; facility_id: string | null } | null;
  deleteRows?: number;
}) {
  const makeTrxTable = (table: string) => {
    const chain: { where: jest.Mock; first: jest.Mock; del: jest.Mock } = {
      where: jest.fn(),
      first: jest.fn(),
      del: jest.fn().mockResolvedValue(0),
    };

    chain.where.mockImplementation((col: string) => {
      if (table === 'gateway_inventory_devices' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.device);
        chain.del = jest.fn().mockResolvedValue(opts.deleteRows ?? (opts.device ? 1 : 0));
      }
      if (table === 'gateways' && col === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.gateway);
      }
      return chain;
    });

    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  };

  const trx = jest.fn((table: string) => makeTrxTable(table)) as jest.Mock & {
    transaction: jest.Mock;
  };

  return Object.assign(trx, {
    transaction: jest.fn().mockImplementation(async (callback: (t: typeof trx) => Promise<unknown>) =>
      callback(trx),
    ),
  });
}

function makeKnexForRemoveAccessControlInventory(opts: {
  device: {
    id: string;
    gateway_id: string;
    device_serial?: string;
    relay_channel?: number;
  } | null;
  gateway: { id: string; facility_id: string | null } | null;
  deleteRows?: number;
  accessCodeGroupMember?: Record<string, unknown> | null;
}) {
  const groupMemberDel = jest.fn().mockResolvedValue(1);

  const makeTrxTable = (table: string) => {
    if (table.includes('device_group_members')) {
      return {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(opts.accessCodeGroupMember ?? null),
        del: groupMemberDel,
      };
    }

    const chain: { where: jest.Mock; first: jest.Mock; del: jest.Mock; andWhere: jest.Mock } = {
      where: jest.fn(),
      first: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      andWhere: jest.fn().mockReturnThis(),
    };

    chain.where.mockImplementation((colOrObj: string | Record<string, unknown>, val?: unknown) => {
      if (table === 'access_control_devices') {
        if (typeof colOrObj === 'string' && colOrObj === 'id') {
          chain.first = jest.fn().mockResolvedValue(opts.device);
          chain.del = jest.fn().mockResolvedValue(opts.deleteRows ?? (opts.device ? 1 : 0));
        }
      }
      if (table === 'gateways' && colOrObj === 'id') {
        chain.first = jest.fn().mockResolvedValue(opts.gateway);
      }
      return chain;
    });

    chain.first = jest.fn().mockResolvedValue(null);
    return chain;
  };

  const trx = jest.fn((table: string) => makeTrxTable(table)) as jest.Mock & {
    transaction: jest.Mock;
  };

  const connection = Object.assign(trx, {
    transaction: jest.fn().mockImplementation(async (callback: (t: typeof trx) => Promise<unknown>) =>
      callback(trx),
    ),
  });

  return connection;
}

describe('DevicesService (unit)', () => {
  beforeEach(() => {
    resetDevicesServiceSingleton();
    jest.clearAllMocks();
    mockUnitFindById.mockReset();
    mockAssignDeviceToUnit.mockReset().mockResolvedValue(undefined);
    mockUnassignDeviceFromUnit.mockReset().mockResolvedValue(undefined);
    mockSyncUnitLinkedMembers.mockReset().mockResolvedValue(undefined);
  });

  describe('assignDeviceToUnit', () => {
    it('throws when device row is missing', async () => {
      const knex = makeKnexForAssign({
        deviceRow: null,
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await expect(
        svc.assignDeviceToUnit('missing-dev', 'unit-1', { performedBy: 'u1' })
      ).rejects.toThrow('Device not found');
    });

    it('throws when unit does not exist', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-1', unit_id: null },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue(undefined);

      const svc = DevicesService.getInstance();
      await expect(
        svc.assignDeviceToUnit('dev-1', 'unit-x', { performedBy: 'u1' })
      ).rejects.toThrow('Unit not found');
    });

    it('throws when device and unit facilities differ', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-1', unit_id: null },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-A' },
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-B' });

      const svc = DevicesService.getInstance();
      await expect(
        svc.assignDeviceToUnit('dev-1', 'unit-1', { performedBy: 'u1' })
      ).rejects.toThrow('Device and unit must belong to the same facility');
    });

    it('throws when device is already assigned to a different unit', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-1', unit_id: 'other-unit' },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await expect(
        svc.assignDeviceToUnit('dev-1', 'unit-1', { performedBy: 'u1' })
      ).rejects.toThrow(/already assigned to another unit/i);
    });

    it('assigns device, syncs group membership, and emits assignment event', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-1', unit_id: null },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await svc.assignDeviceToUnit('dev-1', 'unit-1', {
        performedBy: 'admin-1',
        source: 'api',
      });

      expect(mockAssignDeviceToUnit).toHaveBeenCalledWith('dev-1', 'unit-1');
      expect(mockSyncUnitLinkedMembers).toHaveBeenCalledWith('unit-1', 'dev-1');
      expect(mockEmitAssigned).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          unitId: 'unit-1',
          facilityId: 'fac-1',
          metadata: expect.objectContaining({ source: 'api', performedBy: 'admin-1' }),
        })
      );
    });

    it('throws when gateway row is missing for the device', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-missing', unit_id: null },
        gatewayRow: null,
        existingOnUnit: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await expect(
        svc.assignDeviceToUnit('dev-1', 'unit-1', { performedBy: 'u1' }),
      ).rejects.toThrow('Gateway not found for device');
    });

    it('no-ops when device is already assigned to the target unit', async () => {
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-1', gateway_id: 'gw-1', unit_id: 'unit-1' },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: { id: 'dev-1' },
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await svc.assignDeviceToUnit('dev-1', 'unit-1', { performedBy: 'u1' });

      expect(mockAssignDeviceToUnit).not.toHaveBeenCalled();
      expect(mockEmitAssigned).not.toHaveBeenCalled();
    });

    it('unassigns existing unit device then assigns when target unit already has another lock', async () => {
      mockEmitUnassigned.mockClear();
      const knex = makeKnexForAssign({
        deviceRow: { id: 'dev-new', gateway_id: 'gw-1', unit_id: null },
        gatewayRow: { id: 'gw-1', facility_id: 'fac-1' },
        existingOnUnit: { id: 'dev-old' },
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await svc.assignDeviceToUnit('dev-new', 'unit-1', {
        performedBy: 'admin-1',
        source: 'manual',
      });

      expect(mockUnassignDeviceFromUnit).toHaveBeenCalledWith('dev-old');
      expect(mockSyncUnitLinkedMembers).toHaveBeenCalledWith('unit-1', 'dev-old');
      expect(mockEmitUnassigned).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-old',
          unitId: 'unit-1',
          facilityId: 'fac-1',
          metadata: expect.objectContaining({
            reason: 'reassigned',
            source: 'manual',
            performedBy: 'admin-1',
          }),
        }),
      );
      expect(mockAssignDeviceToUnit).toHaveBeenCalledWith('dev-new', 'unit-1');
      expect(mockEmitAssigned).toHaveBeenCalledWith(
        expect.objectContaining({ deviceId: 'dev-new', unitId: 'unit-1' }),
      );
    });
  });

  describe('unassignDeviceFromUnit', () => {
    it('throws when device not found', async () => {
      const knex = makeKnexForUnassign(null);
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await expect(svc.unassignDeviceFromUnit('x', { performedBy: 'u1' })).rejects.toThrow('Device not found');
    });

    it('returns early when device has no unit', async () => {
      const knex = makeKnexForUnassign({ id: 'dev-1', gateway_id: 'gw-1', unit_id: null });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await svc.unassignDeviceFromUnit('dev-1', { performedBy: 'u1' });

      expect(mockUnassignDeviceFromUnit).not.toHaveBeenCalled();
      expect(mockEmitUnassigned).not.toHaveBeenCalled();
    });

    it('unassigns and emits event when device was on a unit', async () => {
      const knex = makeKnexForUnassign({ id: 'dev-1', gateway_id: 'gw-1', unit_id: 'unit-1' });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });
      mockUnitFindById.mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' });

      const svc = DevicesService.getInstance();
      await svc.unassignDeviceFromUnit('dev-1', { performedBy: 'fa-1', source: 'manual' });

      expect(mockUnassignDeviceFromUnit).toHaveBeenCalledWith('dev-1');
      expect(mockSyncUnitLinkedMembers).toHaveBeenCalledWith('unit-1', 'unit-1');
      expect(mockEmitUnassigned).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          unitId: 'unit-1',
          facilityId: 'fac-1',
          metadata: expect.objectContaining({ source: 'manual', performedBy: 'fa-1' }),
        })
      );
    });
  });

  describe('removeBluLokDeviceFromCloudInventory', () => {
    beforeEach(() => {
      mockEmitRemoved.mockClear();
      mockEmitUnassigned.mockClear();
      mockPushCodesToGateway.mockClear();
      mockEnqueueDeletion.mockClear();
    });

    it('throws when device not found', async () => {
      const connection = makeKnexForRemoveInventory({ device: null, gateway: null, deleteRows: 0 });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await expect(
        svc.removeBluLokDeviceFromCloudInventory('missing', { performedBy: 'admin-1' }),
      ).rejects.toThrow('Device not found');
      expect(mockEmitRemoved).not.toHaveBeenCalled();
    });

    it('deletes inventory, emits unassign then removed when device had a unit', async () => {
      const connection = makeKnexForRemoveInventory({
        device: { id: 'dev-1', gateway_id: 'gw-1', unit_id: 'unit-1', device_serial: 'LOCK-1' },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const summary = await svc.removeBluLokDeviceFromCloudInventory('dev-1', { performedBy: 'admin-1' });

      expect(summary).toEqual({
        gatewayId: 'gw-1',
        facilityId: 'fac-1',
        hadUnit: true,
        unitId: 'unit-1',
        deviceSerial: 'LOCK-1',
      });
      expect(mockEmitUnassigned).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: 'dev-1',
          unitId: 'unit-1',
          facilityId: 'fac-1',
          metadata: expect.objectContaining({ reason: 'inventory_removed' }),
        }),
      );
      expect(mockSyncUnitLinkedMembers).toHaveBeenCalledWith('unit-1', 'unit-1', expect.anything());
      expect(mockEmitRemoved).toHaveBeenCalledWith({
        deviceId: 'dev-1',
        deviceType: 'blulok',
        gatewayId: 'gw-1',
        facilityId: 'fac-1',
        unitId: 'unit-1',
      });
      expect(mockPushCodesToGateway).not.toHaveBeenCalled();
      expect(mockEnqueueDeletion).toHaveBeenCalledWith({
        facilityId: 'fac-1',
        gatewayId: 'gw-1',
        deviceKind: 'blulok',
        lockId: 'LOCK-1',
      });
    });

    it('pushes access codes when removal touches an access_code group', async () => {
      const connection = makeKnexForRemoveInventory({
        device: { id: 'dev-1', gateway_id: 'gw-1', unit_id: null, device_serial: 'LOCK-AC' },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
        accessCodeGroupMember: { group_type: 'access_code' },
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await svc.deleteBluLokFromInventory('dev-1', { source: 'gateway_sync' });
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockPushCodesToGateway).toHaveBeenCalledWith('fac-1');
      expect(mockEmitUnassigned).not.toHaveBeenCalled();
      expect(mockEnqueueDeletion).not.toHaveBeenCalled();
    });

    it('skips unit-linked group cleanup when device has no unit', async () => {
      const connection = makeKnexForRemoveInventory({
        device: { id: 'dev-2', gateway_id: 'gw-2', unit_id: null, device_serial: 'LOCK-2' },
        gateway: { id: 'gw-2', facility_id: null },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const summary = await svc.removeBluLokDeviceFromCloudInventory('dev-2', { performedBy: 'admin-1' });

      expect(summary.hadUnit).toBe(false);
      expect(summary.facilityId).toBeNull();
      expect(summary.unitId).toBeNull();
      expect(mockEmitRemoved).toHaveBeenCalled();
      expect(mockEmitUnassigned).not.toHaveBeenCalled();
      expect(mockEnqueueDeletion).not.toHaveBeenCalled();
    });

    it('enqueues DEVICE_DELETED tombstone for admin API delete', async () => {
      const connection = makeKnexForRemoveInventory({
        device: { id: 'dev-3', gateway_id: 'gw-1', unit_id: null, device_serial: 'LOCK-3' },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await svc.removeBluLokDeviceFromCloudInventory('dev-3', { performedBy: 'admin-1' });

      expect(mockEnqueueDeletion).toHaveBeenCalledWith({
        facilityId: 'fac-1',
        gatewayId: 'gw-1',
        deviceKind: 'blulok',
        lockId: 'LOCK-3',
      });
    });
  });

  describe('deleteAccessControlFromInventory', () => {
    beforeEach(() => {
      mockEmitRemoved.mockClear();
      mockPushCodesToGateway.mockClear();
      mockEnqueueDeletion.mockClear();
    });

    it('throws when access control device not found', async () => {
      const connection = makeKnexForRemoveAccessControlInventory({
        device: null,
        gateway: null,
        deleteRows: 0,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await expect(
        svc.deleteAccessControlFromInventory('missing', { source: 'admin_api', performedBy: 'admin-1' }),
      ).rejects.toThrow('Device not found');
      expect(mockEmitRemoved).not.toHaveBeenCalled();
    });

    it('deletes inventory, emits removed, and enqueues tombstone for admin API delete', async () => {
      const connection = makeKnexForRemoveAccessControlInventory({
        device: {
          id: 'ac-1',
          gateway_id: 'gw-1',
          device_serial: 'KP-001',
          relay_channel: 2,
        },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const summary = await svc.removeAccessControlDeviceFromCloudInventory('ac-1', {
        performedBy: 'admin-1',
      });

      expect(summary).toEqual({
        gatewayId: 'gw-1',
        facilityId: 'fac-1',
        accessId: 'KP-001',
        relayChannel: 2,
      });
      expect(mockEmitRemoved).toHaveBeenCalledWith({
        deviceId: 'ac-1',
        deviceType: 'access_control',
        gatewayId: 'gw-1',
        facilityId: 'fac-1',
        unitId: null,
      });
      expect(mockEnqueueDeletion).toHaveBeenCalledWith({
        facilityId: 'fac-1',
        gatewayId: 'gw-1',
        deviceKind: 'access_control',
        accessId: 'KP-001',
        relayChannel: 2,
      });
    });

    it('skips tombstone enqueue for gateway_sync source', async () => {
      const connection = makeKnexForRemoveAccessControlInventory({
        device: {
          id: 'ac-2',
          gateway_id: 'gw-1',
          device_serial: 'KP-002',
          relay_channel: 1,
        },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await svc.deleteAccessControlFromInventory('ac-2', { source: 'gateway_sync' });

      expect(mockEnqueueDeletion).not.toHaveBeenCalled();
    });
  });

  describe('hasUserAccessToDevice', () => {
    it('returns true for ADMIN without DB lookups', async () => {
      const knex = jest.fn();
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToDevice('any', 'user-1', UserRole.ADMIN);
      expect(ok).toBe(true);
      expect(knex).not.toHaveBeenCalled();
    });

    it('returns true for FACILITY_ADMIN when user_facility_associations row exists', async () => {
      const knex = makeKnexForAccess({
        device: { id: 'dev-1', gateway_id: 'gw-1' },
        gateway: { facility_id: 'fac-1' },
        association: { user_id: 'fa-1', facility_id: 'fac-1' },
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToDevice('dev-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(true);
    });

    it('returns false for FACILITY_ADMIN when no association row', async () => {
      const knex = makeKnexForAccess({
        device: { id: 'dev-1', gateway_id: 'gw-1' },
        gateway: { facility_id: 'fac-1' },
        association: null,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToDevice('dev-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(false);
    });

    it('returns false for TENANT', async () => {
      const knex = jest.fn();
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToDevice('dev-1', 't-1', UserRole.TENANT);
      expect(ok).toBe(false);
    });
  });

  describe('hasUserAccessToAccessControlDevice', () => {
    it('returns true for FACILITY_ADMIN when user_facility_associations row exists', async () => {
      const knex = makeKnexForAccess({
        device: { id: 'ac-1', gateway_id: 'gw-1' },
        gateway: { facility_id: 'fac-1' },
        association: { user_id: 'fa-1', facility_id: 'fac-1' },
        deviceTable: 'access_control_devices',
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToAccessControlDevice('ac-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(true);
    });

    it('returns false for FACILITY_ADMIN when no association row', async () => {
      const knex = makeKnexForAccess({
        device: { id: 'ac-1', gateway_id: 'gw-1' },
        gateway: { facility_id: 'fac-1' },
        association: null,
        deviceTable: 'access_control_devices',
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToAccessControlDevice('ac-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(false);
    });
  });

  describe('deleteNetworkInfraFromInventory', () => {
    beforeEach(() => {
      mockEnqueueDeletion.mockClear();
    });

    it('deletes inventory and enqueues DEVICE_DELETED tombstone for admin_api', async () => {
      const connection = makeKnexForRemoveNetworkInfra({
        device: {
          id: 'ni-1',
          gateway_id: 'gw-1',
          device_kind: 'bridge',
          device_serial: 'BR-1',
        },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const result = await svc.deleteNetworkInfraFromInventory('ni-1', {
        performedBy: 'admin-1',
        source: 'admin_api',
      });

      expect(result).toEqual({
        gatewayId: 'gw-1',
        facilityId: 'fac-1',
        deviceKind: 'bridge',
        deviceSerial: 'BR-1',
      });
      expect(mockEnqueueDeletion).toHaveBeenCalledWith({
        facilityId: 'fac-1',
        gatewayId: 'gw-1',
        deviceKind: 'bridge',
        deviceSerial: 'BR-1',
      });
    });

    it('skips tombstone enqueue when source is gateway_sync', async () => {
      const connection = makeKnexForRemoveNetworkInfra({
        device: {
          id: 'ni-2',
          gateway_id: 'gw-1',
          device_kind: 'friend_node',
          device_serial: 'FN-1',
        },
        gateway: { id: 'gw-1', facility_id: 'fac-1' },
        deleteRows: 1,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await svc.deleteNetworkInfraFromInventory('ni-2', { source: 'gateway_sync' });

      expect(mockEnqueueDeletion).not.toHaveBeenCalled();
    });

    it('throws when network infra device is missing', async () => {
      const connection = makeKnexForRemoveNetworkInfra({
        device: null,
        gateway: null,
        deleteRows: 0,
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: connection as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      await expect(
        svc.deleteNetworkInfraFromInventory('missing', {
          performedBy: 'admin-1',
          source: 'admin_api',
        }),
      ).rejects.toThrow('Device not found');
    });
  });

  describe('hasUserAccessToNetworkInfraDevice', () => {
    it('returns true for ADMIN without facility lookup', async () => {
      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToNetworkInfraDevice('any', 'user-1', UserRole.ADMIN);
      expect(ok).toBe(true);
    });

    it('returns true for FACILITY_ADMIN with association', async () => {
      const knex = makeKnexForAccess({
        device: { id: 'ni-1', gateway_id: 'gw-1' },
        gateway: { facility_id: 'fac-1' },
        association: { user_id: 'fa-1', facility_id: 'fac-1' },
        deviceTable: 'gateway_inventory_devices',
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToNetworkInfraDevice('ni-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(true);
    });

    it('returns false when network infra device is missing', async () => {
      const knex = makeKnexForAccess({
        device: null,
        gateway: { facility_id: 'fac-1' },
        association: { user_id: 'fa-1', facility_id: 'fac-1' },
        deviceTable: 'gateway_inventory_devices',
      });
      mockDatabaseService.getInstance.mockReturnValue({
        connection: knex as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToNetworkInfraDevice('missing', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(false);
    });

    it('returns false for TENANT role', async () => {
      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToNetworkInfraDevice('ni-1', 't-1', UserRole.TENANT);
      expect(ok).toBe(false);
    });

    it('returns false when knex throws', async () => {
      mockDatabaseService.getInstance.mockReturnValue({
        connection: jest.fn(() => {
          throw new Error('db down');
        }) as never,
        healthCheck: jest.fn().mockResolvedValue(true),
      });

      const svc = DevicesService.getInstance();
      const ok = await svc.hasUserAccessToNetworkInfraDevice('ni-1', 'fa-1', UserRole.FACILITY_ADMIN);
      expect(ok).toBe(false);
    });
  });
});
