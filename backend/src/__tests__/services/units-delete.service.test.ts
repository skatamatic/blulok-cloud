import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/services/key-sharing.service', () => ({
  KeySharingService: {
    getInstance: jest.fn().mockReturnValue({
      revokeAllActiveSharesForUnit: jest.fn().mockResolvedValue(0),
    }),
  },
}));

jest.mock('@/services/devices.service', () => ({
  DevicesService: {
    getInstance: jest.fn().mockReturnValue({
      unassignDeviceFromUnit: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockGroupMemberDel = jest.fn().mockResolvedValue(1);

jest.mock('@/services/database.service', () => {
  const mockKnexConnection = jest.fn((table: string) => {
    if (table === 'device_group_members') {
      return {
        where: jest.fn().mockReturnValue({
          del: mockGroupMemberDel,
        }),
      };
    }
    return {};
  });
  return {
    DatabaseService: {
      getInstance: jest.fn().mockReturnValue({
        connection: mockKnexConnection,
      }),
    },
  };
});

jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn().mockReturnValue({
      logUnitDeleted: jest.fn().mockResolvedValue({}),
    }),
  },
}));

describe('UnitsService.deleteUnit', () => {
  let unitsService: UnitsService;
  let mockUnitModel: any;
  let mockAssignmentModel: any;
  let mockDeviceModel: any;
  let mockKeySharingService: { revokeAllActiveSharesForUnit: jest.Mock };
  let mockDevicesService: { unassignDeviceFromUnit: jest.Mock };

  const unitId = 'unit-1';
  const userId = 'admin-1';
  const facilityId = 'fac-1';

  beforeEach(() => {
    (UnitsService as any).instance = undefined;
    unitsService = UnitsService.getInstance();

    mockUnitModel = (unitsService as any).unitModel;
    mockAssignmentModel = (unitsService as any).unitAssignmentModel;
    mockDeviceModel = (unitsService as any).deviceModel;

    mockUnitModel.findById = jest.fn().mockResolvedValue({
      id: unitId,
      facility_id: facilityId,
      unit_number: 'A-101',
    });
    mockUnitModel.hasUserAccessToUnit = jest.fn().mockResolvedValue(true);
    mockUnitModel.deleteUnitById = jest.fn().mockResolvedValue(undefined);
    mockAssignmentModel.findByUnitId = jest.fn().mockResolvedValue([
      { tenant_id: 'tenant-1', access_type: 'full', is_primary: true },
      { tenant_id: 'tenant-2', access_type: 'shared', is_primary: false },
    ]);
    mockDeviceModel.findBluLokByUnitId = jest.fn().mockResolvedValue({ id: 'device-1' });

    jest.spyOn(unitsService, 'unassignTenant').mockResolvedValue(undefined);

    const { KeySharingService } = require('@/services/key-sharing.service');
    mockKeySharingService = KeySharingService.getInstance();
    mockKeySharingService.revokeAllActiveSharesForUnit.mockResolvedValue(1);

    const { DevicesService } = require('@/services/devices.service');
    mockDevicesService = DevicesService.getInstance();
    mockGroupMemberDel.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('unassigns all tenants, revokes key shares, detaches device, and deletes unit', async () => {
    await unitsService.deleteUnit(unitId, userId, UserRole.ADMIN);

    expect(unitsService.unassignTenant).toHaveBeenCalledTimes(2);
    expect(unitsService.unassignTenant).toHaveBeenCalledWith(unitId, 'tenant-1', {
      performedBy: userId,
      source: 'api',
    });
    expect(unitsService.unassignTenant).toHaveBeenCalledWith(unitId, 'tenant-2', {
      performedBy: userId,
      source: 'api',
    });

    expect(mockKeySharingService.revokeAllActiveSharesForUnit).toHaveBeenCalledWith(
      unitId,
      userId,
      UserRole.ADMIN,
      { bestEffortGatewayDenylist: true },
    );

    expect(mockDevicesService.unassignDeviceFromUnit).toHaveBeenCalledWith('device-1', {
      performedBy: userId,
      source: 'api',
    });

    expect(mockGroupMemberDel).toHaveBeenCalled();
    expect(mockUnitModel.deleteUnitById).toHaveBeenCalledWith(unitId);
  });

  it('skips device unassign when no lock is linked', async () => {
    mockDeviceModel.findBluLokByUnitId.mockResolvedValue(null);

    await unitsService.deleteUnit(unitId, userId, UserRole.FACILITY_ADMIN);

    expect(mockDevicesService.unassignDeviceFromUnit).not.toHaveBeenCalled();
    expect(mockUnitModel.deleteUnitById).toHaveBeenCalled();
  });

  it('throws when unit is not found', async () => {
    mockUnitModel.findById.mockResolvedValue(null);

    await expect(unitsService.deleteUnit(unitId, userId, UserRole.ADMIN)).rejects.toThrow('Unit not found');
    expect(mockUnitModel.deleteUnitById).not.toHaveBeenCalled();
  });

  it('throws when user lacks access', async () => {
    mockUnitModel.hasUserAccessToUnit.mockResolvedValue(false);

    await expect(unitsService.deleteUnit(unitId, userId, UserRole.FACILITY_ADMIN)).rejects.toThrow(
      'Access denied',
    );
    expect(unitsService.unassignTenant).not.toHaveBeenCalled();
    expect(mockUnitModel.deleteUnitById).not.toHaveBeenCalled();
  });
});
