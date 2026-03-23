import type { UserNotificationApi } from '@/types/notifications.types';

/** Types that always imply follow-up (aligned with product rules; tune in one place). */
const ACTION_REQUIRED_TYPES = new Set([
  'security_alert',
  'maintenance_alert',
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
  tone: WidgetNotificationTone;
  timestamp: Date;
  isRead: boolean;
  actionRequired: boolean;
  source: 'system' | 'device' | 'user' | 'security';
  metadata?: {
    unitId?: string;
    userId?: string;
    deviceId?: string;
    facilityId?: string;
  };
}

function mapApiTypeToTone(
  notificationType: string,
  priority: string
): WidgetNotificationTone {
  if (
    notificationType === 'access_denied' ||
    notificationType === 'security_alert' ||
    priority === 'urgent'
  ) {
    return 'error';
  }
  if (
    notificationType === 'maintenance_alert' ||
    notificationType === 'system_alert' ||
    priority === 'high'
  ) {
    return 'warning';
  }
  if (priority === 'low') {
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
    notificationType === 'access_denied'
  ) {
    return 'security';
  }
  if (notificationType.includes('device') || notificationType.includes('unit')) {
    return 'device';
  }
  return 'system';
}

export function mapApiNotificationToDashboardView(
  n: UserNotificationApi
): DashboardNotificationView & { displayType: 'info' | 'warning' | 'error' | 'success' } {
  const actionRequired = deriveActionRequired(n.type, n.priority);
  const tone = mapApiTypeToTone(n.type, n.priority);
  const meta = n.metadata ?? undefined;
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    tone,
    displayType: mapToneToLegacyType(tone),
    timestamp: new Date(n.createdAt),
    isRead: n.isRead,
    actionRequired,
    source: mapTypeToSource(n.type),
    metadata: {
      facilityId: n.facilityId ?? undefined,
      ...(meta && typeof meta === 'object'
        ? {
            unitId: typeof meta.unitId === 'string' ? meta.unitId : undefined,
            userId: typeof meta.userId === 'string' ? meta.userId : undefined,
            deviceId: typeof meta.deviceId === 'string' ? meta.deviceId : undefined,
          }
        : {}),
    },
  };
}
