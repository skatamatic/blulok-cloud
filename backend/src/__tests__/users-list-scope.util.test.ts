import { UserRole } from '@/types/auth.types';
import {
  filterUsersForListScope,
  isUserVisibleToFacilityAdmin,
  parseUserListFacilityIds,
  userMatchesFacilityFilter,
} from '@/utils/users-rbac.util';

describe('users-rbac list scope', () => {
  const facA = 'fac-a';
  const facB = 'fac-b';
  const managed = [facA, facB];

  const tenantAtA = { id: 'tenant-a', role: UserRole.TENANT, facility_ids: facA };
  const tenantAtB = { id: 'tenant-b', role: UserRole.TENANT, facility_ids: facB };
  const adminUser = { id: 'admin-1', role: UserRole.ADMIN, facility_ids: null };
  const devAdminUser = { id: 'dev-1', role: UserRole.DEV_ADMIN, facility_ids: null };

  describe('parseUserListFacilityIds', () => {
    it('parses comma-separated facility ids', () => {
      expect(parseUserListFacilityIds(`${facA}, ${facB}`)).toEqual([facA, facB]);
    });

    it('returns empty array for nullish values', () => {
      expect(parseUserListFacilityIds(null)).toEqual([]);
    });
  });

  describe('isUserVisibleToFacilityAdmin', () => {
    it('includes facility-scoped users sharing a managed facility', () => {
      expect(isUserVisibleToFacilityAdmin(tenantAtA, managed)).toBe(true);
    });

    it('excludes users outside managed facilities', () => {
      expect(
        isUserVisibleToFacilityAdmin(
          { id: 'other', role: UserRole.TENANT, facility_ids: 'other-fac' },
          managed
        )
      ).toBe(false);
    });

    it('excludes global admin and dev_admin users', () => {
      expect(isUserVisibleToFacilityAdmin(adminUser, managed)).toBe(false);
      expect(isUserVisibleToFacilityAdmin(devAdminUser, managed)).toBe(false);
    });
  });

  describe('filterUsersForListScope', () => {
    const allUsers = [tenantAtA, tenantAtB, adminUser, devAdminUser];

    it('returns all users for global admins', () => {
      expect(filterUsersForListScope(allUsers, UserRole.ADMIN, 'admin-1', [], new Set())).toEqual(
        allUsers
      );
    });

    it('returns only facility-associated users for facility admins', () => {
      const result = filterUsersForListScope(
        allUsers,
        UserRole.FACILITY_ADMIN,
        'fa-1',
        [facA],
        new Set()
      );
      expect(result.map((u) => u.id)).toEqual(['tenant-a']);
    });

    it('returns self and shared recipients for tenants', () => {
      const shared = new Set(['sharee-1']);
      const users = [
        { id: 'self', role: UserRole.TENANT, facility_ids: facA },
        { id: 'sharee-1', role: UserRole.TENANT, facility_ids: facA },
        { id: 'stranger', role: UserRole.TENANT, facility_ids: facA },
      ];
      const result = filterUsersForListScope(
        users,
        UserRole.TENANT,
        'self',
        [],
        shared
      );
      expect(result.map((u) => u.id).sort()).toEqual(['self', 'sharee-1']);
    });

    it('returns empty list for unknown roles', () => {
      expect(
        filterUsersForListScope(allUsers, UserRole.BLULOK_TECHNICIAN, 'tech-1', [], new Set())
      ).toEqual([]);
    });
  });

  describe('userMatchesFacilityFilter', () => {
    it('matches when user is associated with the facility', () => {
      expect(userMatchesFacilityFilter(tenantAtA, facA)).toBe(true);
    });

    it('does not match global admins without facility associations', () => {
      expect(userMatchesFacilityFilter(adminUser, facA)).toBe(false);
    });
  });
});
