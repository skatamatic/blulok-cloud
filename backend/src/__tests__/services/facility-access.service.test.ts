/**
 * FacilityAccessService — centralized facility RBAC (global vs facility-scoped).
 */
import { FacilityAccessService } from '@/services/facility-access.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
    hasAccessToFacility: jest.fn(),
  },
}));

const mockGetIds = UserFacilityAssociationModel.getUserFacilityIds as jest.MockedFunction<
  typeof UserFacilityAssociationModel.getUserFacilityIds
>;
const mockHasAccess = UserFacilityAssociationModel.hasAccessToFacility as jest.MockedFunction<
  typeof UserFacilityAssociationModel.hasAccessToFacility
>;

describe('FacilityAccessService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserFacilityIds', () => {
    it('returns empty array for global admins (means all facilities)', async () => {
      await expect(FacilityAccessService.getUserFacilityIds('u1', UserRole.ADMIN)).resolves.toEqual([]);
      await expect(FacilityAccessService.getUserFacilityIds('u1', UserRole.DEV_ADMIN)).resolves.toEqual([]);
      expect(mockGetIds).not.toHaveBeenCalled();
    });

    it('returns associations for facility-scoped roles', async () => {
      mockGetIds.mockResolvedValueOnce(['fac-a', 'fac-b']);
      await expect(
        FacilityAccessService.getUserFacilityIds('u2', UserRole.FACILITY_ADMIN)
      ).resolves.toEqual(['fac-a', 'fac-b']);
      expect(mockGetIds).toHaveBeenCalledWith('u2');
    });

    it('propagates errors from the association model', async () => {
      mockGetIds.mockRejectedValueOnce(new Error('db down'));
      await expect(FacilityAccessService.getUserFacilityIds('u1', UserRole.TENANT)).rejects.toThrow('db down');
    });
  });

  describe('hasAccessToFacility', () => {
    it('returns true for ADMIN and DEV_ADMIN without querying associations', async () => {
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.ADMIN, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).not.toHaveBeenCalled();
    });

    it('delegates to UserFacilityAssociationModel for other roles', async () => {
      mockHasAccess.mockResolvedValueOnce(true);
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.FACILITY_ADMIN, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).toHaveBeenCalledWith('u1', 'fac-1');
    });

    it('returns false on error (secure default)', async () => {
      mockHasAccess.mockRejectedValueOnce(new Error('db'));
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.TENANT, 'fac-1')
      ).resolves.toBe(false);
    });
  });

  describe('getUserScope', () => {
    it('returns type all for global admins', async () => {
      await expect(FacilityAccessService.getUserScope('u1', UserRole.DEV_ADMIN)).resolves.toEqual({
        type: 'all',
      });
    });

    it('returns facility_limited with ids for scoped users', async () => {
      mockGetIds.mockResolvedValueOnce(['f1']);
      await expect(FacilityAccessService.getUserScope('u1', UserRole.TENANT)).resolves.toEqual({
        type: 'facility_limited',
        facilityIds: ['f1'],
      });
    });

    it('returns empty facilityIds when user has no associations', async () => {
      mockGetIds.mockResolvedValueOnce([]);
      await expect(FacilityAccessService.getUserScope('u1', UserRole.TENANT)).resolves.toEqual({
        type: 'facility_limited',
        facilityIds: [],
      });
    });
  });

  describe('validateFacilityAccess', () => {
    it('returns true when hasAccessToFacility is true', async () => {
      mockHasAccess.mockResolvedValueOnce(true);
      await expect(
        FacilityAccessService.validateFacilityAccess('u1', UserRole.TENANT, 'fac-1', 'read')
      ).resolves.toBe(true);
    });

    it('returns false when hasAccessToFacility is false', async () => {
      mockHasAccess.mockResolvedValueOnce(false);
      await expect(
        FacilityAccessService.validateFacilityAccess('u1', UserRole.TENANT, 'fac-1', 'read')
      ).resolves.toBe(false);
    });
  });

  describe('getAccessInfo', () => {
    it('returns scope all for admins', async () => {
      await expect(FacilityAccessService.getAccessInfo('u1', UserRole.ADMIN)).resolves.toMatchObject({
        role: UserRole.ADMIN,
        scope: 'all',
        facilityIds: [],
        facilityCount: 0,
      });
    });

    it('returns fallback on unexpected errors', async () => {
      mockGetIds.mockImplementationOnce(() => {
        throw new Error('unexpected');
      });
      await expect(FacilityAccessService.getAccessInfo('u1', UserRole.TENANT)).resolves.toEqual({
        role: UserRole.TENANT,
        scope: 'facility_limited',
        facilityIds: [],
        facilityCount: 0,
      });
    });
  });
});
