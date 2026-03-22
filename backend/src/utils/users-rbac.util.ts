import { AuthService } from '@/services/auth.service';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';

/** Roles facility admins may create (no global / cross-facility privileges). */
export const FACILITY_ADMIN_CREATABLE_ROLES: UserRole[] = [
  UserRole.TENANT,
  UserRole.MAINTENANCE,
  UserRole.BLULOK_TECHNICIAN,
];

export function assertRequesterMayAssignRoleOnCreate(
  req: AuthenticatedRequest,
  targetRole: UserRole
): { ok: true } | { ok: false; status: number; message: string } {
  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    if (!FACILITY_ADMIN_CREATABLE_ROLES.includes(targetRole)) {
      return {
        ok: false,
        status: 403,
        message:
          'Facility admins can only create tenant, maintenance, or BluLok technician users',
      };
    }
  }
  if (targetRole === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
    return { ok: false, status: 403, message: 'Only dev_admin can create dev_admin users' };
  }
  return { ok: true };
}

export function assertRequesterMayAssignRoleOnUpdate(
  req: AuthenticatedRequest,
  nextRole: UserRole | undefined
): { ok: true } | { ok: false; status: number; message: string } {
  if (nextRole === undefined) return { ok: true };

  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    if (!FACILITY_ADMIN_CREATABLE_ROLES.includes(nextRole)) {
      return {
        ok: false,
        status: 403,
        message: 'Facility admins cannot assign this role',
      };
    }
  }

  if (nextRole === UserRole.DEV_ADMIN && req.user!.role !== UserRole.DEV_ADMIN) {
    return { ok: false, status: 403, message: 'Only dev_admin can assign dev_admin role' };
  }

  if (
    (nextRole === UserRole.ADMIN || nextRole === UserRole.FACILITY_ADMIN) &&
    !AuthService.isGlobalAdmin(req.user!.role)
  ) {
    return {
      ok: false,
      status: 403,
      message: 'Only global administrators can assign admin or facility_admin roles',
    };
  }

  return { ok: true };
}

/**
 * Validates facility IDs for assignment to a user with `targetRole`.
 * Global roles (admin, dev_admin) must not receive facility associations.
 */
export function validateFacilityIdsForAssignment(
  req: AuthenticatedRequest,
  facilityIds: string[],
  targetRole: UserRole
): { ok: true; facilityIds: string[] } | { ok: false; status: number; message: string } {
  const unique = Array.from(new Set(facilityIds.filter(Boolean)));

  if (AuthService.canAccessAllFacilities(targetRole)) {
    if (unique.length > 0) {
      return {
        ok: false,
        status: 400,
        message:
          'Global administrators do not use facility associations; omit facilityIds or use an empty array',
      };
    }
    return { ok: true, facilityIds: [] };
  }

  if (unique.length === 0) {
    return {
      ok: false,
      status: 400,
      message: 'At least one facility is required for this role',
    };
  }

  if (AuthService.canAccessAllFacilities(req.user!.role)) {
    return { ok: true, facilityIds: unique };
  }

  if (req.user!.role === UserRole.FACILITY_ADMIN) {
    const allowed = req.user!.facilityIds || [];
    const invalid = unique.filter((id) => !allowed.includes(id));
    if (invalid.length > 0) {
      return {
        ok: false,
        status: 403,
        message: 'You can only assign users to facilities you manage',
      };
    }
    return { ok: true, facilityIds: unique };
  }

  return { ok: false, status: 403, message: 'Insufficient permissions to assign facilities' };
}
