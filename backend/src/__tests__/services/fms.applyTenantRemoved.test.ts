/**
 * Real FMSService.applyTenantRemoved — global setup mocks FMSService by default, so we unmock here.
 */
jest.unmock('@/services/fms/fms.service');
jest.mock('@/models/key-sharing.model', () => ({
  KeySharingModel: jest.fn(),
}));
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    removeUserFromFacility: jest.fn().mockResolvedValue(1),
  },
}));

import { FMSService } from '@/services/fms/fms.service';
import { UserModel } from '@/models/user.model';
import { KeySharingModel } from '@/models/key-sharing.model';
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
    accessChanges: {
      usersCreated: [] as string[],
      usersDeactivated: [] as string[],
      accessGranted: [] as { userId: string; unitId: string }[],
      accessRevoked: [] as { userId: string; unitId: string }[],
    },
  };
}

describe('FMSService.applyTenantRemoved', () => {
  beforeEach(() => {
    (FMSService as any).instance = undefined;
    (KeySharingModel as unknown as jest.Mock).mockImplementation(() => ({
      getUserSharedUnits: jest.fn().mockResolvedValue([{ id: 'ks-1' }]),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not deactivate when the user still has active shared keys (even if facility assignments cleared)', async () => {
    const svc = FMSService.getInstance() as any;

    svc.unitAssignmentModel = {
      findByTenantId: jest.fn().mockResolvedValue([
        { unit_id: 'u-fac1', tenant_id: 'tenant-1', is_primary: true },
      ]),
    };
    svc.unitModel = {
      findByIds: jest.fn().mockResolvedValue([{ id: 'u-fac1', facility_id: 'fac-1' }]),
    };
    svc.unitsService = {
      unassignTenant: jest.fn().mockResolvedValue(undefined),
    };
    svc.entityMappingModel = {
      findByInternalId: jest.fn().mockResolvedValue({
        id: 'map-1',
        metadata: { email: 't@example.com' },
      }),
      updateMetadata: jest.fn().mockResolvedValue(undefined),
    };

    jest.spyOn(UserModel, 'findById').mockResolvedValue({
      id: 'tenant-1',
      role: UserRole.TENANT,
    } as any);
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    const result = emptyApplyResult();

    await svc.applyTenantRemoved(
      { sync_log_id: 'sync-1', internal_id: 'tenant-1' },
      result,
      { facilityId: 'fac-1', performedBy: 'admin-1' },
    );

    expect(deactivateSpy).not.toHaveBeenCalled();
    expect(svc.unitsService.unassignTenant).toHaveBeenCalledWith(
      'u-fac1',
      'tenant-1',
      expect.objectContaining({
        performedBy: 'admin-1',
        source: 'fms_sync',
        syncLogId: 'sync-1',
      }),
    );
    expect(result.accessChanges.accessRevoked).toEqual([{ userId: 'tenant-1', unitId: 'u-fac1' }]);
    expect(UserFacilityAssociationModel.removeUserFromFacility).toHaveBeenCalledWith('tenant-1', 'fac-1');
    expect(svc.entityMappingModel.updateMetadata).toHaveBeenCalledWith(
      'map-1',
      expect.objectContaining({ [FMS_MAPPING_REMOVED_AT_KEY]: expect.any(String) }),
    );
  });
});
