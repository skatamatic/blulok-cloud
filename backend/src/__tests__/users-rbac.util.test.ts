import { UserRole } from '@/types/auth.types';
import {
  assertRequesterMayAssignRoleOnCreate,
  assertRequesterMayAssignRoleOnUpdate,
  FACILITY_ADMIN_CREATABLE_ROLES,
  validateFacilityIdsForAssignment,
} from '@/utils/users-rbac.util';

describe('users-rbac.util', () => {
  const devAdmin = { userId: '1', role: UserRole.DEV_ADMIN, facilityIds: [] as string[] };
  const admin = { userId: '2', role: UserRole.ADMIN, facilityIds: [] as string[] };
  const facilityAdmin = {
    userId: '3',
    role: UserRole.FACILITY_ADMIN,
    facilityIds: ['fac-a', 'fac-b'],
  };

  describe('FACILITY_ADMIN_CREATABLE_ROLES', () => {
    it('contains only scoped operational roles', () => {
      expect(FACILITY_ADMIN_CREATABLE_ROLES).toEqual([
        UserRole.TENANT,
        UserRole.MAINTENANCE,
        UserRole.BLULOK_TECHNICIAN,
      ]);
    });
  });

  describe('assertRequesterMayAssignRoleOnCreate', () => {
    it('allows facility admin to create tenant', () => {
      const req = { user: facilityAdmin } as any;
      expect(assertRequesterMayAssignRoleOnCreate(req, UserRole.TENANT).ok).toBe(true);
    });

    it('denies facility admin from creating admin', () => {
      const req = { user: facilityAdmin } as any;
      const r = assertRequesterMayAssignRoleOnCreate(req, UserRole.ADMIN);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(403);
    });

    it('denies non–dev_admin from creating dev_admin', () => {
      const req = { user: admin } as any;
      const r = assertRequesterMayAssignRoleOnCreate(req, UserRole.DEV_ADMIN);
      expect(r.ok).toBe(false);
    });

    it('allows dev_admin to create dev_admin', () => {
      const req = { user: devAdmin } as any;
      expect(assertRequesterMayAssignRoleOnCreate(req, UserRole.DEV_ADMIN).ok).toBe(true);
    });
  });

  describe('assertRequesterMayAssignRoleOnUpdate', () => {
    it('denies facility admin from assigning admin role', () => {
      const req = { user: facilityAdmin } as any;
      const r = assertRequesterMayAssignRoleOnUpdate(req, UserRole.ADMIN);
      expect(r.ok).toBe(false);
    });

    it('allows global admin to assign facility_admin', () => {
      const req = { user: admin } as any;
      expect(assertRequesterMayAssignRoleOnUpdate(req, UserRole.FACILITY_ADMIN).ok).toBe(true);
    });

    it('denies facility admin from assigning facility_admin', () => {
      const req = { user: facilityAdmin } as any;
      const r = assertRequesterMayAssignRoleOnUpdate(req, UserRole.FACILITY_ADMIN);
      expect(r.ok).toBe(false);
    });
  });

  describe('validateFacilityIdsForAssignment', () => {
    it('rejects facility associations for global-scoped target roles', () => {
      const req = { user: admin } as any;
      const r = validateFacilityIdsForAssignment(req, ['fac-a'], UserRole.ADMIN);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    });

    it('requires at least one facility for tenant', () => {
      const req = { user: admin } as any;
      const r = validateFacilityIdsForAssignment(req, [], UserRole.TENANT);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.status).toBe(400);
    });

    it('allows global admin to assign any existing facility id to tenant', () => {
      const req = { user: admin } as any;
      const r = validateFacilityIdsForAssignment(req, ['fac-x'], UserRole.TENANT);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.facilityIds).toEqual(['fac-x']);
    });

    it('restricts facility admin to their facilities only', () => {
      const req = { user: facilityAdmin } as any;
      const ok = validateFacilityIdsForAssignment(req, ['fac-a'], UserRole.TENANT);
      expect(ok.ok).toBe(true);

      const bad = validateFacilityIdsForAssignment(req, ['other'], UserRole.TENANT);
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.status).toBe(403);
    });
  });
});
