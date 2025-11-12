import { FMSService } from '@/services/fms/fms.service';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { UserModel } from '@/models/user.model';

jest.mock('@/models/key-sharing.model');
jest.mock('@/models/unit-assignment.model');
jest.mock('@/models/fms-sync-log.model');
jest.mock('@/models/user.model');

describe('FMSService.applyTenantRemoved - shared keys safety', () => {
  const svc = FMSService.getInstance() as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not deactivate user if they have active shared keys', async () => {
    // Arrange mocked dependencies
    (FMSSyncLogModel.prototype.findById as any) = jest.fn().mockResolvedValue({ id: 'sync-1', facility_id: 'fac-1', triggered_by_user_id: 'admin-1' });
    (UserModel.findById as any) = jest.fn().mockResolvedValue({ id: 'tenant-1', role: 'tenant' });
    (UnitAssignmentModel.prototype.findByTenantId as any) = jest.fn().mockResolvedValue([
      { unit_id: 'u-other', tenant_id: 'tenant-1', is_primary: true },
    ]);
    (KeySharingModel as any).mockImplementation(() => ({ getUserSharedUnits: jest.fn().mockResolvedValue([ { id: 'ks-1' } ]) }));
    const deactivateSpy = jest.spyOn(UserModel, 'deactivateUser').mockResolvedValue(undefined as any);

    // Act: call public method
    await svc.applyTenantRemoved({ sync_log_id: 'sync-1', internal_id: 'tenant-1' }, { accessChanges: { accessRevoked: [], usersDeactivated: [] } });

    // Assert
    expect(deactivateSpy).not.toHaveBeenCalled();
  });
});


