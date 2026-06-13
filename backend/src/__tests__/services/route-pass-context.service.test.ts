import {
  RoutePassError,
  resolveAuthoritativeRoutePassScope,
  userHasUnitEntitlementInFacility,
} from '@/services/passes/route-pass-context.service';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/user.model', () => ({
  UserModel: {
    findById: jest.fn(),
  },
}));

jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn(),
  },
}));

const { UserModel } = require('@/models/user.model');
const { UserFacilityAssociationModel } = require('@/models/user-facility-association.model');

describe('route-pass-context.service', () => {
  let db: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    db = jest.fn((table: string) => {
      if (table === 'facilities') {
        return {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'fac-1' }),
        };
      }
      return {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
        fn: { now: () => new Date() },
      };
    });
  });

  it('rejects inactive users', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'u1',
      role: UserRole.TENANT,
      is_active: false,
    });

    await expect(resolveAuthoritativeRoutePassScope(db, 'u1')).rejects.toMatchObject({
      status: 403,
      message: 'User account is inactive',
    });
  });

  it('uses DB role for entitlement resolution', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'u1',
      role: UserRole.TENANT,
      is_active: true,
    });

    const scope = await resolveAuthoritativeRoutePassScope(db, 'u1');
    expect(scope.role).toBe(UserRole.TENANT);
    expect(scope.facilityIds).toBeUndefined();
  });

  it('loads facility admin associations from DB', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'fa-1',
      role: UserRole.FACILITY_ADMIN,
      is_active: true,
    });
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-a']);

    const scope = await resolveAuthoritativeRoutePassScope(db, 'fa-1');
    expect(scope.facilityIds).toEqual(['fac-a']);
  });

  it('allows tenant facility_id scoping when unit entitlement exists', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      role: UserRole.TENANT,
      is_active: true,
    });

    const assignmentFirst = jest.fn().mockResolvedValue({ id: 'ua-1' });
    db = jest.fn((table: string) => {
      if (table === 'unit_assignments as ua') {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereNull: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          first: assignmentFirst,
          fn: { now: () => new Date() },
        };
      }
      return {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereNull: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(undefined),
        fn: { now: () => new Date() },
      };
    });

    const scope = await resolveAuthoritativeRoutePassScope(db, 'tenant-1', 'fac-entitled');
    expect(scope.facilityId).toBe('fac-entitled');
    expect(scope.facilityIds).toEqual(['fac-entitled']);
    expect(assignmentFirst).toHaveBeenCalled();
  });

  it('rejects tenant facility_id scoping without unit entitlement', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'tenant-1',
      role: UserRole.TENANT,
      is_active: true,
    });

    await expect(resolveAuthoritativeRoutePassScope(db, 'tenant-1', 'fac-gone')).rejects.toBeInstanceOf(
      RoutePassError,
    );
  });

  it('allows admin facility_id scoping for any existing facility', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'admin-1',
      role: UserRole.ADMIN,
      is_active: true,
    });

    const scope = await resolveAuthoritativeRoutePassScope(db, 'admin-1', 'fac-1');
    expect(scope.role).toBe(UserRole.ADMIN);
    expect(scope.facilityId).toBe('fac-1');
    expect(scope.facilityIds).toEqual(['fac-1']);
  });

  it('rejects facility admin facility_id outside DB associations', async () => {
    (UserModel.findById as jest.Mock).mockResolvedValue({
      id: 'fa-1',
      role: UserRole.FACILITY_ADMIN,
      is_active: true,
    });
    (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue(['fac-a']);

    await expect(resolveAuthoritativeRoutePassScope(db, 'fa-1', 'fac-b')).rejects.toMatchObject({
      status: 403,
      message: 'Access denied to requested facility',
    });
  });

  it('userHasUnitEntitlementInFacility returns true for active share', async () => {
    db = jest.fn((table: string) => {
      if (table === 'unit_assignments as ua') {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereNull: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(undefined),
          fn: { now: () => new Date() },
        };
      }
      if (table === 'key_sharing as ks') {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          whereNull: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ id: 'ks-1' }),
          fn: { now: () => new Date() },
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    await expect(userHasUnitEntitlementInFacility(db, 'tenant-1', 'fac-1')).resolves.toBe(true);
  });
});
