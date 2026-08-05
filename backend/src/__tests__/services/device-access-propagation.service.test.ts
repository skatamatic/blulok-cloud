/**
 * DeviceAccessPropagationService — lock assign/unassign → zone denylist push.
 */
import { DeviceEvent } from '@/services/device-event.service';

const mockOn = jest.fn();
jest.mock('@/services/device-event.service', () => {
  const actual = jest.requireActual('@/services/device-event.service');
  return {
    ...actual,
    DeviceEventService: {
      getInstance: jest.fn(() => ({ on: mockOn })),
    },
  };
});

const mockBulkCreate = jest.fn().mockResolvedValue(undefined);
const mockFindByUser = jest.fn().mockResolvedValue([]);
const mockBulkRemove = jest.fn().mockResolvedValue(undefined);
jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    bulkCreate: mockBulkCreate,
    findByUser: mockFindByUser,
    bulkRemove: mockBulkRemove,
  })),
}));

const mockUnicast = jest.fn();
jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({ unicastToFacility: mockUnicast })),
  },
}));

jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistAdd: jest.fn().mockResolvedValue(false),
    shouldSkipDenylistRemove: jest.fn().mockReturnValue(false),
  },
}));

jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistAdd: jest.fn().mockResolvedValue('jwt-add'),
    buildDenylistRemove: jest.fn().mockResolvedValue('jwt-remove'),
  },
}));

jest.mock('@/services/access-control-zone-access.service', () => ({
  AccessControlZoneAccessService: {
    getAppEnabledAccessControlDeviceIdsForUnits: jest.fn().mockResolvedValue([]),
    getDenylistRemovalTargetsForUserGrant: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/config/environment', () => ({
  config: {
    security: {
      routePassTtlHours: 24,
    },
  },
}));

const mockDb = jest.fn();
(mockDb as unknown as { fn: { now: jest.Mock }; raw: jest.Mock }).fn = {
  now: jest.fn(() => 'NOW()'),
};
(mockDb as unknown as { raw: jest.Mock }).raw = jest.fn((sql: string, bindings?: unknown[]) => ({
  sql,
  bindings,
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({ connection: mockDb })),
  },
}));

import { DeviceAccessPropagationService } from '@/services/device-access-propagation.service';
import { AccessControlZoneAccessService } from '@/services/access-control-zone-access.service';
import { DenylistOptimizationService } from '@/services/denylist-optimization.service';
import { DenylistService } from '@/services/denylist.service';

type PropagationServicePrivate = {
  handleDeviceUnassigned: (event: {
    deviceId: string;
    unitId: string;
    facilityId: string;
    metadata?: { performedBy?: string; reason?: string };
  }) => Promise<void>;
  handleDeviceAssigned: (event: {
    deviceId: string;
    unitId: string;
    facilityId: string;
  }) => Promise<void>;
  getUnitAccessUserIds: (unitId: string) => Promise<string[]>;
};

function asPrivate(svc: DeviceAccessPropagationService): PropagationServicePrivate {
  return svc as unknown as PropagationServicePrivate;
}

function makeThenables(tableRows: Record<string, unknown[]>) {
  mockDb.mockImplementation((table: string) => {
    const rows = tableRows[table] ?? [];
    const chain: {
      select: jest.Mock;
      where: jest.Mock;
      then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
    } = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn(),
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    chain.where.mockImplementation((arg: unknown) => {
      if (typeof arg === 'function') {
        const qb = {
          whereNull: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
        };
        arg(qb);
      }
      return chain;
    });
    return chain;
  });
}

describe('DeviceAccessPropagationService', () => {
  let svc: DeviceAccessPropagationService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOn.mockClear();
    (DeviceAccessPropagationService as unknown as { instance?: DeviceAccessPropagationService }).instance =
      undefined;
    mockBulkCreate.mockResolvedValue(undefined);
    mockFindByUser.mockResolvedValue([]);
    mockBulkRemove.mockResolvedValue(undefined);
    (DenylistOptimizationService.shouldSkipDenylistAdd as jest.Mock).mockResolvedValue(false);
    (DenylistOptimizationService.shouldSkipDenylistRemove as jest.Mock).mockReturnValue(false);
    (
      AccessControlZoneAccessService.getAppEnabledAccessControlDeviceIdsForUnits as jest.Mock
    ).mockResolvedValue(['ac-1']);
    (
      AccessControlZoneAccessService.getDenylistRemovalTargetsForUserGrant as jest.Mock
    ).mockResolvedValue([{ device_id: 'ac-1', device_type: 'access_control' }]);
    makeThenables({
      unit_assignments: [{ tenant_id: 'tenant-1' }],
      key_sharing: [{ shared_with_user_id: 'share-1' }],
    });
    svc = DeviceAccessPropagationService.getInstance();
  });

  it('registers DEVICE_ASSIGNED and DEVICE_UNASSIGNED listeners once', () => {
    expect(mockOn).toHaveBeenCalledWith(DeviceEvent.DEVICE_UNASSIGNED, expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith(DeviceEvent.DEVICE_ASSIGNED, expect.any(Function));
  });

  it('getUnitAccessUserIds unions tenants and active key shares', async () => {
    makeThenables({
      unit_assignments: [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-1' }],
      key_sharing: [{ shared_with_user_id: 'share-1' }],
    });

    const ids = await asPrivate(svc).getUnitAccessUserIds('unit-1');

    expect(ids.sort()).toEqual(['share-1', 'tenant-1']);
  });

  describe('handleDeviceUnassigned', () => {
    it('returns early when unit has no tenants or key shares', async () => {
      makeThenables({ unit_assignments: [], key_sharing: [] });

      await asPrivate(svc).handleDeviceUnassigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { performedBy: 'admin-1' },
      });

      expect(
        AccessControlZoneAccessService.getAppEnabledAccessControlDeviceIdsForUnits,
      ).not.toHaveBeenCalled();
      expect(mockBulkCreate).not.toHaveBeenCalled();
    });

    it('adds denylist entries and unicasts DENYLIST_ADD for unit users', async () => {
      await asPrivate(svc).handleDeviceUnassigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { performedBy: 'admin-1', reason: 'manual' },
      });

      expect(
        AccessControlZoneAccessService.getAppEnabledAccessControlDeviceIdsForUnits,
      ).toHaveBeenCalledWith(['unit-1']);
      expect(mockBulkCreate).toHaveBeenCalledTimes(2);
      expect(mockBulkCreate).toHaveBeenCalledWith([
        expect.objectContaining({
          device_id: 'ac-1',
          device_type: 'access_control',
          user_id: 'tenant-1',
          source: 'unit_unassignment',
          created_by: 'admin-1',
        }),
      ]);
      expect(DenylistService.buildDenylistAdd).toHaveBeenCalled();
      expect(mockUnicast).toHaveBeenCalledWith('fac-1', 'jwt-add');
    });

    it('skips gateway unicast when route-pass optimization says skip add', async () => {
      (DenylistOptimizationService.shouldSkipDenylistAdd as jest.Mock).mockResolvedValue(true);

      await asPrivate(svc).handleDeviceUnassigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(mockBulkCreate).toHaveBeenCalled();
      expect(DenylistService.buildDenylistAdd).not.toHaveBeenCalled();
      expect(mockUnicast).not.toHaveBeenCalled();
    });

    it('does not create denylist rows when there are no scoped access-control targets', async () => {
      (
        AccessControlZoneAccessService.getAppEnabledAccessControlDeviceIdsForUnits as jest.Mock
      ).mockResolvedValue([]);

      await asPrivate(svc).handleDeviceUnassigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(mockBulkCreate).not.toHaveBeenCalled();
      expect(mockUnicast).not.toHaveBeenCalled();
    });

    it('swallows handler errors without throwing', async () => {
      (
        AccessControlZoneAccessService.getAppEnabledAccessControlDeviceIdsForUnits as jest.Mock
      ).mockRejectedValue(new Error('zone lookup failed'));

      await expect(
        asPrivate(svc).handleDeviceUnassigned({
          deviceId: 'dev-1',
          unitId: 'unit-1',
          facilityId: 'fac-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleDeviceAssigned', () => {
    it('returns early when unit has no access users', async () => {
      makeThenables({ unit_assignments: [], key_sharing: [] });

      await asPrivate(svc).handleDeviceAssigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(
        AccessControlZoneAccessService.getDenylistRemovalTargetsForUserGrant,
      ).not.toHaveBeenCalled();
    });

    it('removes denylist entries and unicasts DENYLIST_REMOVE for unit users', async () => {
      mockFindByUser.mockResolvedValue([
        { device_id: 'ac-1', user_id: 'tenant-1' },
        { device_id: 'other', user_id: 'tenant-1' },
      ]);

      await asPrivate(svc).handleDeviceAssigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(
        AccessControlZoneAccessService.getDenylistRemovalTargetsForUserGrant,
      ).toHaveBeenCalledWith(['unit-1'], 'tenant-1');
      expect(mockBulkRemove).toHaveBeenCalledWith(['ac-1'], 'tenant-1');
      expect(DenylistService.buildDenylistRemove).toHaveBeenCalledWith(
        [{ sub: 'tenant-1', exp: 0 }],
        ['ac-1'],
      );
      expect(mockUnicast).toHaveBeenCalledWith('fac-1', 'jwt-remove');
    });

    it('skips remove push when user has no matching denylist entries', async () => {
      mockFindByUser.mockResolvedValue([{ device_id: 'unrelated', user_id: 'tenant-1' }]);

      await asPrivate(svc).handleDeviceAssigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(mockBulkRemove).not.toHaveBeenCalled();
      expect(mockUnicast).not.toHaveBeenCalled();
    });

    it('skips gateway unicast when all matching entries are optimization-skipped', async () => {
      mockFindByUser.mockResolvedValue([{ device_id: 'ac-1', user_id: 'tenant-1' }]);
      (DenylistOptimizationService.shouldSkipDenylistRemove as jest.Mock).mockReturnValue(true);

      await asPrivate(svc).handleDeviceAssigned({
        deviceId: 'dev-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(mockBulkRemove).toHaveBeenCalled();
      expect(DenylistService.buildDenylistRemove).not.toHaveBeenCalled();
      expect(mockUnicast).not.toHaveBeenCalled();
    });

    it('swallows handler errors without throwing', async () => {
      (
        AccessControlZoneAccessService.getDenylistRemovalTargetsForUserGrant as jest.Mock
      ).mockRejectedValue(new Error('grant lookup failed'));

      await expect(
        asPrivate(svc).handleDeviceAssigned({
          deviceId: 'dev-1',
          unitId: 'unit-1',
          facilityId: 'fac-1',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
