import { UserRole } from '@/types/auth.types';

/** Roles that may open the Settings page (limited tab set). */
export function canAccessSystemSettings(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return [
    UserRole.TENANT,
    UserRole.MAINTENANCE,
    UserRole.FACILITY_ADMIN,
    UserRole.BLULOK_TECHNICIAN,
    UserRole.ADMIN,
    UserRole.DEV_ADMIN,
  ].includes(role as UserRole);
}

/** Matches backend `canEditLayout` — personal dashboard mutation (admin/dev_admin only). */
export function canEditDashboardLayout(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return [UserRole.ADMIN, UserRole.DEV_ADMIN].includes(role as UserRole);
}

/** Matches backend `requireAdmin` on saved-dashboard routes (admin/dev_admin only). */
export function canManageDashboardLibrary(role: UserRole | string | undefined): boolean {
  if (!role) return false;
  return [UserRole.ADMIN, UserRole.DEV_ADMIN].includes(role as UserRole);
}

/** Settings sidebar: show Dashboard tab when either personal or library tools apply. */
export function canAccessDashboardSettings(role: UserRole | string | undefined): boolean {
  return canEditDashboardLayout(role) || canManageDashboardLibrary(role);
}
