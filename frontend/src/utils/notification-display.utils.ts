import type { UserNotificationApi } from '@/types/notifications.types';

/** Types that always imply follow-up (aligned with product rules; tune in one place). */
const ACTION_REQUIRED_TYPES = new Set([
  'security_alert',
  'maintenance_alert',
  'fms_sync_failed',
  'device_low_battery',
  'gateway_offline',
  'gateway_alert',
  'device_inventory_sync_error',
  'backend_error',
]);

const ACTION_REQUIRED_PRIORITIES = new Set(['high', 'urgent']);

/**
 * Derive whether a notification should appear under "Action Required" filters.
 * No DB column — priority + notification_type only.
 */
export function deriveActionRequired(
  notificationType: string,
  priority: string
): boolean {
  return (
    ACTION_REQUIRED_TYPES.has(notificationType) ||
    ACTION_REQUIRED_PRIORITIES.has(priority)
  );
}

export type WidgetNotificationTone = 'info' | 'warning' | 'error' | 'success';

export interface DashboardNotificationView {
  id: string;
  title: string;
  message: string;
  notificationType: string;
  priority: string;
  tone: WidgetNotificationTone;
  timestamp: Date;
  isRead: boolean;
  actionRequired: boolean;
  source: 'system' | 'device' | 'user' | 'security';
  reference?: { type: string; id: string } | null;
  metadata?: Record<string, unknown> | null;
  facilityId?: string | null;
}

function mapApiTypeToTone(
  notificationType: string,
  priority: string
): WidgetNotificationTone {
  if (
    notificationType === 'access_denied' ||
    notificationType === 'security_alert' ||
    notificationType === 'fms_sync_failed' ||
    notificationType === 'gateway_offline' ||
    notificationType === 'device_inventory_sync_error' ||
    notificationType === 'backend_error' ||
    priority === 'urgent'
  ) {
    return 'error';
  }
  if (
    notificationType === 'maintenance_alert' ||
    notificationType === 'system_alert' ||
    notificationType === 'device_low_battery' ||
    notificationType === 'gateway_alert' ||
    priority === 'high'
  ) {
    return 'warning';
  }
  if (
    notificationType === 'fms_sync_complete' ||
    notificationType === 'gateway_restored' ||
    notificationType === 'access_granted' ||
    notificationType === 'unit_assigned'
  ) {
    return 'success';
  }
  return 'info';
}

function mapToneToLegacyType(tone: WidgetNotificationTone): 'info' | 'warning' | 'error' | 'success' {
  return tone;
}

function mapTypeToSource(notificationType: string): DashboardNotificationView['source'] {
  if (
    notificationType.includes('security') ||
    notificationType === 'access_denied' ||
    notificationType.startsWith('gateway_')
  ) {
    return 'security';
  }
  if (
    notificationType.includes('device') ||
    notificationType.includes('unit') ||
    notificationType === 'device_low_battery'
  ) {
    return 'device';
  }
  return 'system';
}

/** Technical notification types visible only to dev_admin. */
export const DEV_ADMIN_ONLY_NOTIFICATION_TYPES = ['backend_error'] as const;

export function isDevAdminRole(role: string | undefined): boolean {
  return role === 'dev_admin';
}

export function canViewNotificationType(
  notificationType: string,
  role: string | undefined,
): boolean {
  if (isDevAdminRole(role)) {
    return true;
  }
  return !DEV_ADMIN_ONLY_NOTIFICATION_TYPES.includes(
    notificationType as (typeof DEV_ADMIN_ONLY_NOTIFICATION_TYPES)[number],
  );
}

export function filterNotificationsForViewer<T extends { type?: string; notificationType?: string }>(
  notifications: T[],
  role: string | undefined,
): T[] {
  if (isDevAdminRole(role)) {
    return notifications;
  }
  return notifications.filter((n) =>
    canViewNotificationType(String(n.notificationType ?? n.type ?? ''), role),
  );
}

function formatMetadataEntries(metadata: Record<string, unknown> | null | undefined): string[] {
  if (!metadata || typeof metadata !== 'object') {
    return [];
  }
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const rendered =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);
      return `${key}: ${rendered}`;
    });
}

export function getNotificationDetailLines(
  notification: Pick<
    DashboardNotificationView,
    'message' | 'notificationType' | 'priority' | 'reference' | 'metadata' | 'facilityId'
  >,
): string[] {
  const lines: string[] = [notification.message];
  lines.push(`Type · ${notification.notificationType}`);
  lines.push(`Priority · ${notification.priority}`);
  if (notification.facilityId) {
    lines.push(`Facility · ${notification.facilityId}`);
  }
  if (notification.reference) {
    lines.push(`Reference · ${notification.reference.type} (${notification.reference.id})`);
  }
  lines.push(...formatMetadataEntries(notification.metadata ?? null));
  return lines;
}

export function notificationMessageNeedsExpansion(message: string, maxPreviewLength = 96): boolean {
  return message.trim().length > maxPreviewLength || message.includes('\n');
}

export function mapApiNotificationToDashboardView(
  n: UserNotificationApi
): DashboardNotificationView & { displayType: 'info' | 'warning' | 'error' | 'success' } {
  const actionRequired = deriveActionRequired(n.type, n.priority);
  const tone = mapApiTypeToTone(n.type, n.priority);
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    notificationType: n.type,
    priority: n.priority,
    tone,
    displayType: mapToneToLegacyType(tone),
    timestamp: new Date(n.createdAt),
    isRead: n.isRead,
    actionRequired,
    source: mapTypeToSource(n.type),
    reference: n.reference,
    metadata: n.metadata,
    facilityId: n.facilityId,
  };
}
