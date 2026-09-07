import { UserRole } from '@/types/auth.types';
import type { WidgetTypeDefinition } from '@/types/widget.types';

/**
 * Returns true if the user's role may add / see a widget in the registry.
 * - `dev_admin` is treated like `admin` when `admin` is listed.
 * - `maintenance` may use widgets that list `facility_admin` (facility operations).
 */
export function canAccessWidget(
  userRole: string | undefined,
  requiredPermissions?: string[]
): boolean {
  if (!requiredPermissions?.length) {
    return true;
  }
  if (!userRole) {
    return false;
  }

  if (requiredPermissions.includes(userRole)) {
    return true;
  }

  if (userRole === UserRole.DEV_ADMIN && requiredPermissions.includes(UserRole.ADMIN)) {
    return true;
  }

  if (
    userRole === UserRole.MAINTENANCE &&
    requiredPermissions.includes(UserRole.FACILITY_ADMIN)
  ) {
    return true;
  }

  return false;
}

export function filterWidgetsByRole<T extends WidgetTypeDefinition>(
  widgets: T[],
  userRole: string | undefined
): T[] {
  return widgets.filter((w) => canAccessWidget(userRole, w.requiredPermissions));
}
