import { UserRole } from '@/types/auth.types';
import {
  assertJwtFacilityClaim,
  hasJwtFacilityClaim,
} from '@/utils/facility-access-claim.utils';

describe('facility-access-claim.utils', () => {
  describe('hasJwtFacilityClaim', () => {
    it('allows global admins for any facility', () => {
      expect(
        hasJwtFacilityClaim({ role: UserRole.ADMIN, facilityIds: [] }, 'fac-1'),
      ).toBe(true);
      expect(
        hasJwtFacilityClaim({ role: UserRole.DEV_ADMIN }, 'fac-1'),
      ).toBe(true);
    });

    it('requires facility id on the JWT claim for facility-scoped roles', () => {
      expect(
        hasJwtFacilityClaim(
          { role: UserRole.FACILITY_ADMIN, facilityIds: ['fac-1', 'fac-2'] },
          'fac-1',
        ),
      ).toBe(true);
      expect(
        hasJwtFacilityClaim(
          { role: UserRole.FACILITY_ADMIN, facilityIds: ['fac-2'] },
          'fac-1',
        ),
      ).toBe(false);
      expect(
        hasJwtFacilityClaim({ role: UserRole.TENANT }, 'fac-1'),
      ).toBe(false);
    });
  });

  describe('assertJwtFacilityClaim', () => {
    it('sends 403 and returns false when claim is missing', () => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const res = { status } as unknown as import('express').Response;

      expect(
        assertJwtFacilityClaim(
          res,
          { role: UserRole.FACILITY_ADMIN, facilityIds: ['other'] },
          'fac-1',
        ),
      ).toBe(false);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions - facility access required',
      });
    });

    it('returns true without writing when claim matches', () => {
      const json = jest.fn();
      const status = jest.fn().mockReturnValue({ json });
      const res = { status } as unknown as import('express').Response;

      expect(
        assertJwtFacilityClaim(
          res,
          { role: UserRole.FACILITY_ADMIN, facilityIds: ['fac-1'] },
          'fac-1',
        ),
      ).toBe(true);
      expect(status).not.toHaveBeenCalled();
    });
  });
});
