import { UserRole } from '@/types/auth.types';

/**
 * Canonical in-app notification types.
 * Keep in sync with DB enum (migration) and Joi validators in notifications.routes.ts.
 */
export const IN_APP_NOTIFICATION_TYPES = [
  'access_granted',
  'access_denied',
  'device_registered',
  'password_reset',
  'unit_assigned',
  'unit_unassigned',
  'system_alert',
  'maintenance_alert',
  'security_alert',
  'general',
  'fms_sync_complete',
  'fms_sync_failed',
  'device_low_battery',
  'gateway_offline',
  'gateway_restored',
  'gateway_alert',
  'backend_error',
  'device_inventory_sync_error',
] as const;

export type InAppNotificationType = (typeof IN_APP_NOTIFICATION_TYPES)[number];

/** Roles that receive facility-scoped operational alerts by default. */
export const FACILITY_OPERATOR_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DEV_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.MAINTENANCE,
];

/** Roles that receive global backend/critical alerts. */
export const GLOBAL_OPERATOR_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.DEV_ADMIN,
];

/** In-app types with technical detail — visible only to dev_admin. */
export const DEV_ADMIN_ONLY_NOTIFICATION_TYPES: readonly InAppNotificationType[] = [
  'backend_error',
];

export const LOW_BATTERY_THRESHOLD_PERCENT = 20;

/** @deprecated Import from access-history.constants.ts */
export { MAX_HISTOGRAM_FACILITIES } from '@/constants/access-history.constants';
