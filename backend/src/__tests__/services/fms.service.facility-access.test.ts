/** Real FMSService is globally mocked in setup-mocks; this suite tests private access logic on the actual class. */
jest.unmock('@/services/fms/fms.service');

import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';

import { FMSService } from '@/services/fms/fms.service';

describe('FMSService.validateFacilityAccess (private)', () => {
  const facilityId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    (FMSService as unknown as { instance?: unknown }).instance = undefined;
  });

  function validate(
    userId: string,
    userRole: UserRole,
    fid: string = facilityId
  ): Promise<void> {
    const svc = FMSService.getInstance();
    return (svc as unknown as { validateFacilityAccess: (u: string, r: UserRole, f: string) => Promise<void> }).validateFacilityAccess(
      userId,
      userRole,
      fid
    );
  }

  it('allows ADMIN', async () => {
    await expect(validate('any-id', UserRole.ADMIN)).resolves.toBeUndefined();
  });

  it('allows DEV_ADMIN', async () => {
    await expect(validate('any-id', UserRole.DEV_ADMIN)).resolves.toBeUndefined();
  });

  it('allows FACILITY_ADMIN when association grants access', async () => {
    const spy = jest.spyOn(UserFacilityAssociationModel, 'hasAccessToFacility').mockResolvedValue(true);
    await expect(validate('facility-admin-1', UserRole.FACILITY_ADMIN)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith('facility-admin-1', facilityId);
    spy.mockRestore();
  });

  it('rejects FACILITY_ADMIN when association denies access', async () => {
    const spy = jest.spyOn(UserFacilityAssociationModel, 'hasAccessToFacility').mockResolvedValue(false);
    await expect(validate('facility-admin-1', UserRole.FACILITY_ADMIN)).rejects.toThrow(
      /do not have permission to sync this facility/i
    );
    spy.mockRestore();
  });

  it('rejects TENANT', async () => {
    await expect(validate('tenant-1', UserRole.TENANT)).rejects.toThrow(/Insufficient permissions for FMS sync/);
  });
});
