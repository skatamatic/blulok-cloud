import { UserRole } from '@/types/auth.types';

export function formatRoleName(role: UserRole): string {
  switch (role) {
    case UserRole.DEV_ADMIN:
      return 'Dev Admin';
    case UserRole.ADMIN:
      return 'Admin';
    case UserRole.FACILITY_ADMIN:
      return 'Facility Admin';
    case UserRole.BLULOK_TECHNICIAN:
      return 'BluLok Technician';
    case UserRole.MAINTENANCE:
      return 'Maintenance';
    case UserRole.TENANT:
    default:
      return 'Tenant';
  }
}

export function getRoleBadgeColor(role: UserRole): string {
  switch (role) {
    case UserRole.DEV_ADMIN:
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    case UserRole.ADMIN:
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case UserRole.FACILITY_ADMIN:
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    case UserRole.BLULOK_TECHNICIAN:
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case UserRole.MAINTENANCE:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    case UserRole.TENANT:
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
  }
}
