/**
 * Real FMSService.applyTenantUpdated — global setup mocks FMSService by default, so we unmock here.
 */
jest.unmock('@/services/fms/fms.service');
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
    addUserToFacility: jest.fn().mockResolvedValue({}),
  },
}));

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';
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

describe('FMSService.applyTenantUpdated', () => {
  beforeEach(() => {
    (FMSService as any).instance = undefined;
    (UserFacilityAssociationModel.addUserToFacility as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restores facility access, reactivates user, and clears removed_from_fms_at when tenant returns', async () => {
    const svc = FMSService.getInstance() as any;

    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'storedge' }),
    };
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({
        id: 'map-1',
        metadata: {
          email: 't@example.com',
          [FMS_MAPPING_REMOVED_AT_KEY]: '2026-01-01T00:00:00.000Z',
        },
      }),
      updateMetadata: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: 'tenant-1',
      role: UserRole.TENANT,
      is_active: false,
    } as any);
    jest.spyOn(UserModel, 'updateById').mockResolvedValue(undefined as any);
    const activateSpy = jest.spyOn(UserModel, 'activateUser').mockResolvedValue(undefined as any);

    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['fac-1']);

    const result = emptyApplyResult();

    await svc.applyTenantUpdated(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        after_data: {
          externalId: 'ext-1',
          email: 't@example.com',
          firstName: 'Pat',
          lastName: 'Lee',
          phone: '5551234567',
          unitIds: [],
        },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(UserFacilityAssociationModel.addUserToFacility).toHaveBeenCalledWith('tenant-1', 'fac-1');
    expect(activateSpy).toHaveBeenCalledWith('tenant-1');
    expect(svc.entityMappingModel.updateMetadata).toHaveBeenCalledTimes(1);
    const updatedMetadata = svc.entityMappingModel.updateMetadata.mock.calls[0][1];
    expect(updatedMetadata.email).toBe('t@example.com');
    expect(updatedMetadata.phone).toBe('5551234567');
    expect(updatedMetadata[FMS_MAPPING_REMOVED_AT_KEY]).toBeUndefined();
  });

  it('reactivates a manually deactivated tenant still present in FMS with facility access', async () => {
    const svc = FMSService.getInstance() as any;

    svc.fmsConfigModel = {
      findByFacilityId: jest.fn().mockResolvedValue({ provider_type: 'storedge' }),
    };
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({
        id: 'map-1',
        metadata: {
          email: 't@example.com',
        },
      }),
      updateMetadata: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: 'tenant-1',
      role: UserRole.TENANT,
      is_active: false,
    } as any);
    jest.spyOn(UserModel, 'updateById').mockResolvedValue(undefined as any);
    const activateSpy = jest.spyOn(UserModel, 'activateUser').mockResolvedValue(undefined as any);

    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-1']);

    const result = emptyApplyResult();

    await svc.applyTenantUpdated(
      {
        sync_log_id: 'sync-1',
        internal_id: 'tenant-1',
        after_data: {
          externalId: 'ext-1',
          email: 't@example.com',
          firstName: 'Pat',
          lastName: 'Lee',
          phone: '5551234567',
          unitIds: [],
        },
      },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(UserFacilityAssociationModel.addUserToFacility).not.toHaveBeenCalled();
    expect(activateSpy).toHaveBeenCalledWith('tenant-1');
    expect(UserModel.updateById).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        first_name: 'Pat',
        last_name: 'Lee',
      }),
    );
  });
});
