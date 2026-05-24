import { AuthService } from '@/services/auth.service';
import { AuthenticatedRequest, UserRole } from '@/types/auth.types';

/** Minimum fields required for list RBAC; full rows from `getUsersWithFacilities()` include more. */
export interface UserListRecord {
  id: string;
  role: string;
  facility_ids?: string | null;
  email?: string | null;
  phone_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean;
  last_login?: Date | string | null;
  created_at?: Date | string;
  updated_at?: Date | string;
  facility_names?: string | null;
}

export function parseUserListFacilityIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

/** Facility admins may only list users associated with their facilities — never global admins. */
export function isUserVisibleToFacilityAdmin(
  user: UserListRecord,
  managedFacilityIds: string[]
): boolean {
  if (managedFacilityIds.length === 0) return false;
  if (AuthService.canAccessAllFacilities(user.role as UserRole)) {
    return false;
  }
  const userFacilityIds = parseUserListFacilityIds(user.facility_ids);
  return userFacilityIds.some((id) => managedFacilityIds.includes(id));
}

export function filterUsersForListScope<T extends UserListRecord>(
  users: T[],
  requesterRole: UserRole,
  requesterId: string,
  managedFacilityIds: string[],
  sharedAccessUserIds: ReadonlySet<string>
): T[] {
  if (AuthService.canAccessAllFacilities(requesterRole)) {
    return users;
  }

  if (requesterRole === UserRole.FACILITY_ADMIN) {
    return users.filter((user) => isUserVisibleToFacilityAdmin(user, managedFacilityIds));
  }

  if (requesterRole === UserRole.TENANT || requesterRole === UserRole.MAINTENANCE) {
    return users.filter(
      (user) => user.id === requesterId || sharedAccessUserIds.has(user.id)
    );
  }

  return [];
}

export function userMatchesFacilityFilter(user: UserListRecord, facilityId: string): boolean {
  return parseUserListFacilityIds(user.facility_ids).includes(facilityId);
}

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
