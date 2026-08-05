/**
 * Real FMSService.applyUnitUpdated / applyTenantUnitChanged occupancy self-heal.
 */
jest.unmock('@/services/fms/fms.service');
jest.mock('@/models/key-sharing.model', () => ({
  KeySharingModel: jest.fn(),
}));
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn().mockResolvedValue(['fac-1']),
    addUserToFacility: jest.fn().mockResolvedValue({}),
    removeUserFromFacility: jest.fn().mockResolvedValue(1),
  },
}));
jest.mock('@/services/key-sharing.service', () => ({
  KeySharingService: {
    getInstance: jest.fn(() => ({
      revokeAllActiveSharesForUnit: jest.fn().mockResolvedValue(0),
    })),
  },
}));

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { KeySharingService } from '@/services/key-sharing.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';
import { FMSChangeType } from '@/types/fms.types';
import { FMS_MAPPING_REMOVED_AT_KEY } from '@/services/fms/fms-tenant-removal.utils';

function emptyApplyResult() {
  return {
    success: true,
    changesApplied: 0,
    changesFailed: 0,
    errors: [] as string[],
    errorDetails: [] as [],
    appliedChangeIds: [] as string[],
    failedChangeIds: [] as string[],
    accessChanges: {
      usersCreated: [] as string[],
      usersDeactivated: [] as string[],
      accessGranted: [] as { userId: string; unitId: string }[],
      accessRevoked: [] as { userId: string; unitId: string }[],
    },
  };
}

describe('FMSService.applyUnitUpdated occupancy self-heal', () => {
  const revokeShares = jest.fn().mockResolvedValue(0);

  beforeEach(() => {
    (FMSService as any).instance = undefined;
    (KeySharingModel as unknown as jest.Mock).mockImplementation(() => ({
      getUserSharedUnits: jest.fn().mockResolvedValue([]),
    }));
    (KeySharingService.getInstance as jest.Mock).mockReturnValue({
      revokeAllActiveSharesForUnit: revokeShares,
    });
    revokeShares.mockClear();
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-1']);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function wireBase(svc: any) {
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({
        id: 'unit-1',
        facility_id: 'fac-1',
        unit_number: '101',
      }),
    };
    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'generic_rest' }),
    };
    svc.entityMappingModel = {
      findByExternalId: jest.fn().mockResolvedValue({
        id: 'map-u',
        internal_id: 'unit-1',
        external_id: 'ext-u',
      }),
      findByInternalId: jest.fn().mockResolvedValue({
        id: 'map-u',
        internal_id: 'unit-1',
        external_id: 'ext-u',
      }),
      delete: jest.fn(),
      create: jest.fn(),
      updateMetadata: jest.fn().mockResolvedValue(undefined),
    };
    svc.unitsService = {
      updateUnit: jest.fn().mockResolvedValue({}),
      unassignTenant: jest.fn().mockResolvedValue(undefined),
      assignTenant: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('vacant update unassigns tenants, revokes shares, deactivates last-unit tenant, then updates status', async () => {
    const svc = FMSService.getInstance() as any;
    wireBase(svc);
    svc.unitAssignmentModel = {
      findByUnitId: jest.fn().mockResolvedValue([
        { unit_id: 'unit-1', tenant_id: 'tenant-1', is_primary: true },
      ]),
      findByTenantId: jest.fn().mockResolvedValue([]),
    };
    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
    } as any);
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    const result = emptyApplyResult();
    await svc.applyUnitUpdated(
      {
        id: 'chg-1',
        sync_log_id: 'sync-1',
        change_type: FMSChangeType.UNIT_UPDATED,
        entity_type: 'unit',
        external_id: 'ext-u',
        internal_id: 'unit-1',
        before_data: { status: 'occupied' },
        after_data: {
          externalId: 'ext-u',
          unitNumber: '101',
          status: 'available',
        },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(svc.unitsService.unassignTenant).toHaveBeenCalledWith(
      'unit-1',
      'tenant-1',
      expect.objectContaining({ source: 'fms_sync', syncLogId: 'sync-1' }),
    );
    expect(revokeShares).toHaveBeenCalledWith(
      'unit-1',
      'admin-1',
      UserRole.ADMIN,
      { bestEffortGatewayDenylist: true },
    );
    expect(deactivateSpy).toHaveBeenCalledWith('tenant-1');
    expect(result.accessChanges.accessRevoked).toEqual([{ userId: 'tenant-1', unitId: 'unit-1' }]);
    expect(result.accessChanges.usersDeactivated).toEqual(['tenant-1']);
    expect(svc.unitsService.updateUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.objectContaining({ status: 'available' }),
      'admin-1',
      UserRole.ADMIN,
    );
  });

  it('vacant update does not deactivate tenant who still has other unit assignments', async () => {
    const svc = FMSService.getInstance() as any;
    wireBase(svc);
    svc.unitAssignmentModel = {
      findByUnitId: jest.fn().mockResolvedValue([
        { unit_id: 'unit-1', tenant_id: 'tenant-1', is_primary: true },
      ]),
      findByTenantId: jest.fn().mockResolvedValue([{ unit_id: 'unit-other', tenant_id: 'tenant-1' }]),
    };
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    const result = emptyApplyResult();
    await svc.applyUnitUpdated(
      {
        sync_log_id: 'sync-1',
        internal_id: 'unit-1',
        external_id: 'ext-u',
        before_data: { status: 'occupied' },
        after_data: { externalId: 'ext-u', unitNumber: '101', status: 'available' },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(svc.unitsService.unassignTenant).toHaveBeenCalled();
    expect(deactivateSpy).not.toHaveBeenCalled();
    expect(result.accessChanges.usersDeactivated).toEqual([]);
  });

  it('occupied update assigns mapped tenant after restore/reactivate', async () => {
    const svc = FMSService.getInstance() as any;
    wireBase(svc);
    svc.unitAssignmentModel = {
      findByUnitId: jest.fn().mockResolvedValue([]),
      findByTenantId: jest.fn().mockResolvedValue([]),
    };
    const tenantMapping = {
      id: 'map-t',
      internal_id: 'tenant-1',
      external_id: 'ext-tenant',
      metadata: { [FMS_MAPPING_REMOVED_AT_KEY]: '2026-01-01T00:00:00.000Z' },
    };
    svc.entityMappingModel.findByExternalId = jest.fn().mockImplementation(
      (_fac: string, entityType: string) => {
        if (entityType === 'unit') {
          return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: 'ext-u' });
        }
        return Promise.resolve(tenantMapping);
      },
    );
    svc.entityMappingModel.findByInternalId = jest.fn().mockResolvedValue({
      id: 'map-u',
      internal_id: 'unit-1',
      external_id: 'ext-u',
    });

    jest.spyOn(UserModel, 'findById').mockImplementation(async (id: string) => {
      if (id === 'admin-1') return { id: 'admin-1', role: UserRole.ADMIN } as any;
      // Simulate MySQL tinyint: inactive as 0 (not boolean false)
      return { id: 'tenant-1', role: UserRole.TENANT, is_active: 0 } as any;
    });
    const activateSpy = jest.spyOn(UserModel, 'activateUser').mockResolvedValue(undefined as any);
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue([]);

    const result = emptyApplyResult();
    await svc.applyUnitUpdated(
      {
        sync_log_id: 'sync-1',
        internal_id: 'unit-1',
        external_id: 'ext-u',
        before_data: { status: 'available' },
        after_data: {
          externalId: 'ext-u',
          unitNumber: '101',
          status: 'occupied',
          tenantId: 'ext-tenant',
        },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(activateSpy).toHaveBeenCalledWith('tenant-1');
    expect(UserFacilityAssociationModel.addUserToFacility).toHaveBeenCalledWith('tenant-1', 'fac-1');
    expect(svc.unitsService.assignTenant).toHaveBeenCalledWith(
      'unit-1',
      'tenant-1',
      expect.objectContaining({ source: 'fms_sync', isPrimary: true }),
    );
    expect(result.accessChanges.accessGranted).toEqual([{ userId: 'tenant-1', unitId: 'unit-1' }]);
    expect(svc.unitsService.updateUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.objectContaining({ status: 'occupied' }),
      'admin-1',
      UserRole.ADMIN,
    );
  });

  it('occupied update fails clearly when FMS tenant is not mapped', async () => {
    const svc = FMSService.getInstance() as any;
    wireBase(svc);
    svc.unitAssignmentModel = {
      findByUnitId: jest.fn().mockResolvedValue([]),
    };
    svc.entityMappingModel.findByExternalId = jest.fn().mockImplementation(
      (_fac: string, entityType: string) => {
        if (entityType === 'unit') {
          return Promise.resolve({ id: 'map-u', internal_id: 'unit-1', external_id: 'ext-u' });
        }
        return Promise.resolve(null);
      },
    );
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);

    await expect(
      svc.applyUnitUpdated(
        {
          sync_log_id: 'sync-1',
          internal_id: 'unit-1',
          external_id: 'ext-u',
          before_data: { status: 'available' },
          after_data: {
            externalId: 'ext-u',
            unitNumber: '101',
            status: 'occupied',
            tenantId: 'missing-tenant',
          },
        },
        emptyApplyResult(),
        { facilityId: 'fac-1', performedBy: 'admin-1' },
      ),
    ).rejects.toThrow(/not mapped yet \(apply tenant_added first\)/);
    expect(svc.unitsService.assignTenant).not.toHaveBeenCalled();
    expect(svc.unitsService.updateUnit).not.toHaveBeenCalled();
  });

  it('creates missing unit mapping then still applies vacant status update', async () => {
    const svc = FMSService.getInstance() as any;
    wireBase(svc);
    svc.unitAssignmentModel = {
      findByUnitId: jest.fn().mockResolvedValue([]),
    };
    svc.entityMappingModel.findByInternalId = jest.fn().mockResolvedValue(null);
    svc.entityMappingModel.findByExternalId = jest.fn().mockResolvedValue(null);
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);

    await svc.applyUnitUpdated(
      {
        sync_log_id: 'sync-1',
        internal_id: 'unit-1',
        external_id: 'ext-u-new',
        before_data: { status: 'occupied' },
        after_data: { externalId: 'ext-u-new', unitNumber: '101', status: 'available' },
      },
      emptyApplyResult(),
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(svc.entityMappingModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        external_id: 'ext-u-new',
        internal_id: 'unit-1',
        entity_type: 'unit',
      }),
    );
    expect(svc.unitsService.updateUnit).toHaveBeenCalledWith(
      'unit-1',
      expect.objectContaining({ status: 'available' }),
      'admin-1',
      UserRole.ADMIN,
    );
  });
});

describe('FMSService.applyTenantUnitChanged unassign last-unit deactivate', () => {
  const revokeShares = jest.fn().mockResolvedValue(0);

  beforeEach(() => {
    (FMSService as any).instance = undefined;
    (KeySharingModel as unknown as jest.Mock).mockImplementation(() => ({
      getUserSharedUnits: jest.fn().mockResolvedValue([]),
    }));
    (KeySharingService.getInstance as jest.Mock).mockReturnValue({
      revokeAllActiveSharesForUnit: revokeShares,
    });
    revokeShares.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('deactivates tenant after unassign when no remaining assignments or shared keys', async () => {
    const svc = FMSService.getInstance() as any;
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({ id: 'map-t', internal_id: 'tenant-1' }),
      findByExternalId: jest.fn(),
    };
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1', unit_number: '101' }),
    };
    svc.unitAssignmentModel = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      findByUnitId: jest.fn().mockResolvedValue([]),
    };
    svc.unitsService = {
      unassignTenant: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    const result = emptyApplyResult();
    await svc.applyTenantUnitChanged(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        external_id: 'ext-t',
        before_data: { action: 'unassign_unit', unitId: 'unit-1' },
        after_data: null,
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(svc.unitsService.unassignTenant).toHaveBeenCalledWith(
      'unit-1',
      'tenant-1',
      expect.objectContaining({ source: 'fms_sync' }),
    );
    expect(deactivateSpy).toHaveBeenCalledWith('tenant-1');
    expect(result.accessChanges.usersDeactivated).toEqual(['tenant-1']);
    expect(revokeShares).toHaveBeenCalledWith(
      'unit-1',
      'admin-1',
      UserRole.ADMIN,
      { bestEffortGatewayDenylist: true },
    );
  });

  it('does not revoke unit shares when other tenants remain assigned', async () => {
    const svc = FMSService.getInstance() as any;
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({ id: 'map-t', internal_id: 'tenant-1' }),
    };
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' }),
    };
    svc.unitAssignmentModel = {
      findByTenantId: jest.fn().mockResolvedValue([{ unit_id: 'unit-other', tenant_id: 'tenant-1' }]),
      findByUnitId: jest.fn().mockResolvedValue([{ unit_id: 'unit-1', tenant_id: 'tenant-2' }]),
    };
    svc.unitsService = {
      unassignTenant: jest.fn().mockResolvedValue(undefined),
    };
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    await svc.applyTenantUnitChanged(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        before_data: { action: 'unassign_unit', unitId: 'unit-1' },
        after_data: null,
      },
      emptyApplyResult(),
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(deactivateSpy).not.toHaveBeenCalled();
    expect(revokeShares).not.toHaveBeenCalled();
  });

  it('unassigns when webhook payload carries an empty after_data object', async () => {
    const svc = FMSService.getInstance() as any;
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({ id: 'map-t', internal_id: 'tenant-1' }),
      findByExternalId: jest.fn(),
    };
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1', unit_number: '101' }),
    };
    svc.unitAssignmentModel = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      findByUnitId: jest.fn().mockResolvedValue([]),
    };
    svc.unitsService = {
      unassignTenant: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);
    jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    await svc.applyTenantUnitChanged(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        before_data: { action: 'unassign_unit', unitId: 'unit-1', webhookOnly: true },
        after_data: {},
      },
      emptyApplyResult(),
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(svc.unitsService.unassignTenant).toHaveBeenCalledWith(
      'unit-1',
      'tenant-1',
      expect.objectContaining({ source: 'fms_sync' }),
    );
  });

  it('fails clearly when no assign/unassign action is present', async () => {
    const svc = FMSService.getInstance() as any;
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({ id: 'map-t', internal_id: 'tenant-1' }),
      findByExternalId: jest.fn(),
    };
    svc.unitsService = { unassignTenant: jest.fn(), assignTenant: jest.fn() };

    await expect(
      svc.applyTenantUnitChanged(
        {
          sync_log_id: 'sync-1',
          internal_id: 'tenant-1',
          before_data: { unitId: 'unit-1' },
          after_data: {},
        },
        emptyApplyResult(),
        { facilityId: 'fac-1', performedBy: 'admin-1' },
      ),
    ).rejects.toThrow(/missing an assign_unit \/ unassign_unit action/);
    expect(svc.unitsService.unassignTenant).not.toHaveBeenCalled();
    expect(svc.unitsService.assignTenant).not.toHaveBeenCalled();
  });

  it('does not deactivate when tenant still has active shared keys', async () => {
    const svc = FMSService.getInstance() as any;
    (KeySharingModel as unknown as jest.Mock).mockImplementation(() => ({
      getUserSharedUnits: jest.fn().mockResolvedValue([{ id: 'ks-1' }]),
    }));
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({ id: 'map-t', internal_id: 'tenant-1' }),
    };
    svc.unitModel = {
      findById: jest.fn().mockResolvedValue({ id: 'unit-1', facility_id: 'fac-1' }),
    };
    svc.unitAssignmentModel = {
      findByTenantId: jest.fn().mockResolvedValue([]),
      findByUnitId: jest.fn().mockResolvedValue([]),
    };
    svc.unitsService = {
      unassignTenant: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(UserModel, 'findById').mockResolvedValue({ id: 'admin-1', role: UserRole.ADMIN } as any);
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    const result = emptyApplyResult();
    await svc.applyTenantUnitChanged(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        before_data: { action: 'unassign_unit', unitId: 'unit-1' },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(deactivateSpy).not.toHaveBeenCalled();
    expect(result.accessChanges.usersDeactivated).toEqual([]);
    expect(revokeShares).toHaveBeenCalled();
  });
});
