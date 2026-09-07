/**
 * FacilityAccessService — centralized facility RBAC (global vs facility-scoped).
 */
jest.unmock('@/services/facility-access.service');

import { FacilityAccessService } from '@/services/facility-access.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { DatabaseService } from '@/services/database.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
    hasAccessToFacility: jest.fn(),
  },
}));

jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(),
  },
}));

const mockGetIds = UserFacilityAssociationModel.getUserFacilityIds as jest.MockedFunction<
  typeof UserFacilityAssociationModel.getUserFacilityIds
>;
const mockHasAccess = UserFacilityAssociationModel.hasAccessToFacility as jest.MockedFunction<
  typeof UserFacilityAssociationModel.hasAccessToFacility
>;

function mockDbQueries(options: {
  assignmentFacilityIds?: string[];
  keyShareFacilityIds?: string[];
  assignmentExists?: boolean;
  keyShareExists?: boolean;
  /** When set, `gateways` lookups resolve facility_id for ZTP principals */
  ztpGatewayFacilityId?: string | null;
}) {
  const assignmentRows = (options.assignmentFacilityIds ?? []).map((facility_id) => ({ facility_id }));
  const shareRows = (options.keyShareFacilityIds ?? []).map((facility_id) => ({ facility_id }));

  const buildChain = (rows: { facility_id: string }[], firstResult?: unknown) => ({
    select: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(firstResult),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject),
  });

  const db = jest.fn((table: string) => {
    if (table === 'unit_assignments as ua') {
      return buildChain(assignmentRows, options.assignmentExists ? { id: 'a1' } : undefined);
    }
    if (table === 'key_sharing as ks') {
      return buildChain(shareRows, options.keyShareExists ? { id: 'k1' } : undefined);
    }
    if (table === 'gateways') {
      const facilityId = options.ztpGatewayFacilityId;
      return buildChain(
        [],
        facilityId ? { facility_id: facilityId } : facilityId === null ? { facility_id: null } : undefined,
      );
    }
    return buildChain([]);
  });

  (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: db });
}

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

    it('returns associations for facility admins', async () => {
      mockDbQueries({});
      mockGetIds.mockResolvedValueOnce(['fac-a', 'fac-b']);
      await expect(
        FacilityAccessService.getUserFacilityIds('u2', UserRole.FACILITY_ADMIN)
      ).resolves.toEqual(['fac-a', 'fac-b']);
      expect(mockGetIds).toHaveBeenCalledWith('u2');
    });

    it('scopes ZTP gateway principals to the bound facility', async () => {
      mockDbQueries({ ztpGatewayFacilityId: 'fac-ztp' });
      await expect(
        FacilityAccessService.getUserFacilityIds('ztp:gw-1', UserRole.FACILITY_ADMIN),
      ).resolves.toEqual(['fac-ztp']);
      expect(mockGetIds).not.toHaveBeenCalled();
    });

    it('returns empty for unbound ZTP principals', async () => {
      mockDbQueries({ ztpGatewayFacilityId: null });
      await expect(
        FacilityAccessService.getUserFacilityIds('ztp:gw-unbound', UserRole.FACILITY_ADMIN),
      ).resolves.toEqual([]);
      expect(mockGetIds).not.toHaveBeenCalled();
    });

    it('returns association facilities alone for tenants with no unit or share', async () => {
      mockDbQueries({});
      mockGetIds.mockResolvedValueOnce(['fac-from-assoc']);

      await expect(
        FacilityAccessService.getUserFacilityIds('tenant-1', UserRole.TENANT)
      ).resolves.toEqual(['fac-from-assoc']);
      expect(mockGetIds).toHaveBeenCalledWith('tenant-1');
    });

    it('unions associations with unit and key-share facilities for tenants', async () => {
      mockDbQueries({
        assignmentFacilityIds: ['fac-from-unit'],
        keyShareFacilityIds: ['fac-from-share'],
      });
      mockGetIds.mockResolvedValueOnce(['fac-from-assoc', 'fac-from-unit']);

      await expect(
        FacilityAccessService.getUserFacilityIds('tenant-1', UserRole.TENANT)
      ).resolves.toEqual(
        expect.arrayContaining(['fac-from-assoc', 'fac-from-unit', 'fac-from-share'])
      );
      expect(mockGetIds).toHaveBeenCalledWith('tenant-1');
    });

    it('propagates errors from the association model for facility admins', async () => {
      mockGetIds.mockRejectedValueOnce(new Error('db down'));
      await expect(FacilityAccessService.getUserFacilityIds('u1', UserRole.FACILITY_ADMIN)).rejects.toThrow('db down');
    });
  });

  describe('hasAccessToFacility', () => {
    it('returns true for ADMIN and DEV_ADMIN without querying associations', async () => {
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.ADMIN, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).not.toHaveBeenCalled();
    });

    it('delegates to UserFacilityAssociationModel for facility admins', async () => {
      mockHasAccess.mockResolvedValueOnce(true);
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.FACILITY_ADMIN, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).toHaveBeenCalledWith('u1', 'fac-1');
    });

    it('allows ZTP principals only for their bound facility', async () => {
      mockDbQueries({ ztpGatewayFacilityId: 'fac-1' });
      await expect(
        FacilityAccessService.hasAccessToFacility('ztp:gw-1', UserRole.FACILITY_ADMIN, 'fac-1'),
      ).resolves.toBe(true);
      await expect(
        FacilityAccessService.hasAccessToFacility('ztp:gw-1', UserRole.FACILITY_ADMIN, 'fac-other'),
      ).resolves.toBe(false);
      expect(mockHasAccess).not.toHaveBeenCalled();
    });

    it('allows tenants via association without unit or key-share', async () => {
      mockDbQueries({ assignmentExists: false, keyShareExists: false });
      mockHasAccess.mockResolvedValueOnce(true);
      await expect(
        FacilityAccessService.hasAccessToFacility('tenant-1', UserRole.TENANT, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).toHaveBeenCalledWith('tenant-1', 'fac-1');
    });

    it('allows tenants via unit assignment when association is absent', async () => {
      mockDbQueries({ assignmentExists: true });
      mockHasAccess.mockResolvedValueOnce(false);
      await expect(
        FacilityAccessService.hasAccessToFacility('tenant-1', UserRole.TENANT, 'fac-1')
      ).resolves.toBe(true);
      expect(mockHasAccess).toHaveBeenCalledWith('tenant-1', 'fac-1');
    });

    it('returns false for tenants with no association, unit, or key-share access', async () => {
      mockDbQueries({ assignmentExists: false, keyShareExists: false });
      mockHasAccess.mockResolvedValueOnce(false);
      await expect(
        FacilityAccessService.hasAccessToFacility('tenant-1', UserRole.TENANT, 'fac-removed')
      ).resolves.toBe(false);
    });

    it('returns false on error (secure default)', async () => {
      mockHasAccess.mockRejectedValueOnce(new Error('db'));
      await expect(
        FacilityAccessService.hasAccessToFacility('u1', UserRole.FACILITY_ADMIN, 'fac-1')
      ).resolves.toBe(false);
    });
  });

  describe('getUserScope', () => {
    it('returns type all for global admins', async () => {
      await expect(FacilityAccessService.getUserScope('u1', UserRole.DEV_ADMIN)).resolves.toEqual({
        type: 'all',
      });
    });

    it('returns facility_limited with ids for facility admins', async () => {
      mockGetIds.mockResolvedValueOnce(['f1']);
      await expect(FacilityAccessService.getUserScope('u1', UserRole.FACILITY_ADMIN)).resolves.toEqual({
        type: 'facility_limited',
        facilityIds: ['f1'],
      });
    });

    it('returns tenant facilities from associations and assignments', async () => {
      mockDbQueries({ assignmentFacilityIds: ['fac-unit'] });
      mockGetIds.mockResolvedValueOnce(['fac-assoc']);
      await expect(FacilityAccessService.getUserScope('t1', UserRole.TENANT)).resolves.toEqual({
        type: 'facility_limited',
        facilityIds: expect.arrayContaining(['fac-assoc', 'fac-unit']),
      });
    });
  });

  describe('validateFacilityAccess', () => {
    it('returns true when hasAccessToFacility is true', async () => {
      mockHasAccess.mockResolvedValueOnce(true);
      await expect(
        FacilityAccessService.validateFacilityAccess('u1', UserRole.FACILITY_ADMIN, 'fac-1', 'read')
      ).resolves.toBe(true);
    });

    it('returns false when hasAccessToFacility is false', async () => {
      mockHasAccess.mockResolvedValueOnce(false);
      await expect(
        FacilityAccessService.validateFacilityAccess('u1', UserRole.FACILITY_ADMIN, 'fac-1', 'read')
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
      await expect(FacilityAccessService.getAccessInfo('u1', UserRole.FACILITY_ADMIN)).resolves.toEqual({
        role: UserRole.FACILITY_ADMIN,
        scope: 'facility_limited',
        facilityIds: [],
        facilityCount: 0,
      });
    });
  });
});
