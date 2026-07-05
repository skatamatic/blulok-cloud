import type { UserNotificationApi } from '@/types/notifications.types';
import { formatNotificationTimestamp } from '@/utils/datetime.utils';

export { formatNotificationTimestamp };

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

  const lines: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    if (key === 'payload' && typeof value === 'object' && !Array.isArray(value)) {
      lines.push('Webhook payload:');
      for (const [payloadKey, payloadValue] of Object.entries(value as Record<string, unknown>)) {
        if (payloadValue === undefined || payloadValue === null || payloadValue === '') {
          continue;
        }
        const rendered =
          typeof payloadValue === 'string' ||
          typeof payloadValue === 'number' ||
          typeof payloadValue === 'boolean'
            ? String(payloadValue)
            : JSON.stringify(payloadValue);
        lines.push(`  ${payloadKey}: ${rendered}`);
      }
      continue;
    }

    const rendered =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value);
    lines.push(`${key}: ${rendered}`);
  }
  return lines;
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

export interface NotificationCardVisual {
  card: string;
  accentBar: string;
  iconShell: string;
  title: string;
  message: string;
  timestamp: string;
  expandedRing: string;
  showPulse: boolean;
}

export interface NotificationUrgencyBadge {
  label: string;
  className: string;
}

const toneBorderBySeverity: Record<WidgetNotificationTone, string> = {
  error: 'border-red-300/90 dark:border-red-700/70',
  warning: 'border-amber-300/90 dark:border-amber-700/60',
  success: 'border-emerald-200 dark:border-emerald-800/50',
  info: 'border-[#147FD4]/25 dark:border-[#147FD4]/35',
};

const toneAccentBarBySeverity: Record<WidgetNotificationTone, string> = {
  error: 'bg-red-500 dark:bg-red-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  success: 'bg-emerald-500 dark:bg-emerald-400',
  info: 'bg-[#147FD4]',
};

const toneExpandedRingBySeverity: Record<WidgetNotificationTone, string> = {
  error: 'ring-2 ring-red-300/50 dark:ring-red-700/40 border-red-300/80 dark:border-red-700/60',
  warning:
    'ring-2 ring-amber-300/45 dark:ring-amber-700/35 border-amber-300/80 dark:border-amber-700/55',
  success: 'ring-1 ring-emerald-300/40 dark:ring-emerald-700/35',
  info: 'ring-1 ring-[#147FD4]/25 border-[#147FD4]/30',
};

const readCardNeutralSurface =
  'bg-white dark:bg-gray-800/90';

function readCardVisual(tone: WidgetNotificationTone): NotificationCardVisual {
  return {
    card: `${toneBorderBySeverity[tone]} ${readCardNeutralSurface}`,
    accentBar: toneAccentBarBySeverity[tone],
    iconShell: 'bg-gray-100 text-gray-500 dark:bg-gray-700/80 dark:text-gray-400',
    title: 'text-gray-700 dark:text-gray-200',
    message: 'text-gray-500 dark:text-gray-400',
    timestamp: 'text-gray-400 dark:text-gray-500',
    expandedRing: toneExpandedRingBySeverity[tone],
    showPulse: false,
  };
}

function unreadCardVisual(tone: WidgetNotificationTone): NotificationCardVisual {
  switch (tone) {
    case 'error':
      return {
        card: `${toneBorderBySeverity.error} bg-gradient-to-r from-red-50 via-red-50/80 to-white dark:from-red-950/40 dark:via-red-950/20 dark:to-gray-900/40 shadow-sm shadow-red-100/80 dark:shadow-red-950/30`,
        accentBar: toneAccentBarBySeverity.error,
        iconShell: 'bg-red-100 text-red-600 ring-2 ring-red-200/80 dark:bg-red-900/50 dark:text-red-300 dark:ring-red-800/60',
        title: 'text-red-950 dark:text-red-50',
        message: 'text-red-900/80 dark:text-red-100/80',
        timestamp: 'text-red-700/70 dark:text-red-300/70',
        expandedRing: toneExpandedRingBySeverity.error,
        showPulse: true,
      };
    case 'warning':
      return {
        card: `${toneBorderBySeverity.warning} bg-gradient-to-r from-amber-50 via-amber-50/70 to-white dark:from-amber-950/30 dark:via-amber-950/15 dark:to-gray-900/40 shadow-sm shadow-amber-100/70 dark:shadow-amber-950/20`,
        accentBar: toneAccentBarBySeverity.warning,
        iconShell: 'bg-amber-100 text-amber-700 ring-2 ring-amber-200/80 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800/50',
        title: 'text-amber-950 dark:text-amber-50',
        message: 'text-amber-900/80 dark:text-amber-100/75',
        timestamp: 'text-amber-800/70 dark:text-amber-300/70',
        expandedRing: toneExpandedRingBySeverity.warning,
        showPulse: false,
      };
    case 'success':
      return {
        card: `${toneBorderBySeverity.success} bg-emerald-50/70 dark:bg-emerald-950/20`,
        accentBar: toneAccentBarBySeverity.success,
        iconShell: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/35 dark:text-emerald-300',
        title: 'text-emerald-950 dark:text-emerald-50',
        message: 'text-emerald-900/75 dark:text-emerald-100/70',
        timestamp: 'text-emerald-700/70 dark:text-emerald-300/65',
        expandedRing: toneExpandedRingBySeverity.success,
        showPulse: false,
      };
    case 'info':
    default:
      return {
        card: `${toneBorderBySeverity.info} bg-gradient-to-r from-[#147FD4]/8 via-[#147FD4]/5 to-white dark:from-[#147FD4]/15 dark:via-[#147FD4]/8 dark:to-gray-900/30`,
        accentBar: toneAccentBarBySeverity.info,
        iconShell: 'bg-[#147FD4]/10 text-[#147FD4] dark:bg-[#147FD4]/20 dark:text-[#5eb3f0]',
        title: 'text-gray-900 dark:text-white',
        message: 'text-gray-600 dark:text-gray-300',
        timestamp: 'text-gray-500 dark:text-gray-400',
        expandedRing: toneExpandedRingBySeverity.info,
        showPulse: false,
      };
  }
}

export function getNotificationCardVisual(
  notification: Pick<DashboardNotificationView, 'tone' | 'isRead'>,
): NotificationCardVisual {
  return notification.isRead
    ? readCardVisual(notification.tone)
    : unreadCardVisual(notification.tone);
}

export function getNotificationUrgencyBadge(
  notification: Pick<
    DashboardNotificationView,
    'tone' | 'priority' | 'isRead' | 'actionRequired'
  >,
): NotificationUrgencyBadge | null {
  if (notification.tone === 'error') {
    const critical =
      notification.priority === 'urgent' || notification.actionRequired;
    return {
      label: critical ? 'Critical' : 'Alert',
      className:
        'bg-red-600 text-white shadow-sm shadow-red-500/30 dark:bg-red-500 dark:text-white',
    };
  }

  if (notification.tone === 'warning') {
    return {
      label: 'Attention',
      className:
        'bg-amber-500 text-white shadow-sm shadow-amber-500/25 dark:bg-amber-500 dark:text-white',
    };
  }

  if (notification.actionRequired) {
    return {
      label: 'Action needed',
      className:
        'bg-orange-500 text-white shadow-sm shadow-orange-500/25 dark:bg-orange-500 dark:text-white',
    };
  }

  return null;
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
