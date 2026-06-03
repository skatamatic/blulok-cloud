/** Canonical in-app notification types (keep aligned with backend IN_APP_NOTIFICATION_TYPES). */
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

/**
 * In-app notification row returned by GET /api/v1/notifications
 * (matches backend NotificationResponse)
 */
export interface UserNotificationApi {
  id: string;
  type: InAppNotificationType | string;
  title: string;
  message: string;
  priority: string;
  isRead: boolean;
  readAt: string | null;
  reference: { type: string; id: string } | null;
  facilityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
