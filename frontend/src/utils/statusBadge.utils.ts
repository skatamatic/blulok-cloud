/** Shared semantic badge palettes for detail pages, facility lists, and overview stats. */

export const unitStatusColors = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  overlocked: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
} as const;

export const deviceStatusColors = {
  online: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  offline: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  low_battery: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
} as const;

export const lockStatusColors: Record<string, string> = {
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  locking: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 animate-pulse',
  unlocking: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 animate-pulse',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

export function statusBadgeSmClass(palette: string): string {
  return `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${palette}`;
}
