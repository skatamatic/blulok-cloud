import type { DashboardNotificationView } from '@/utils/notification-display.utils';
import {
  describeFmsUpdatePushSubjectFromMetadata,
  getFmsUpdateEventLabel,
} from '@/utils/fms-update-push-notification.utils';
import {
  formatSettledFmsReviewMessage,
  getFmsNotificationReviewTarget,
  isFmsNotificationReviewSettled,
} from '@/utils/fms-pending-review.utils';

export type FmsNotificationDisplayItem = {
  key: string;
  notification: DashboardNotificationView;
  instances: DashboardNotificationView[];
};

function extractTenantClusterKey(notification: DashboardNotificationView): string | null {
  const metadata = notification.metadata;
  const subject = describeFmsUpdatePushSubjectFromMetadata(metadata);
  if (subject) {
    const name = subject.split('·')[0]?.split('(')[0]?.trim();
    if (name) return name.toLowerCase();
  }

  const payload =
    metadata?.payload && typeof metadata.payload === 'object' && !Array.isArray(metadata.payload)
      ? (metadata.payload as Record<string, unknown>)
      : metadata;
  if (payload && typeof payload === 'object') {
    const first = typeof payload.first_name === 'string' ? payload.first_name : payload.firstName;
    const last = typeof payload.last_name === 'string' ? payload.last_name : payload.lastName;
    const name = [first, last]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim();
    if (name) return name.toLowerCase();
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (email) return email;
  }

  return null;
}

export function getFmsWebhookGroupKey(notification: DashboardNotificationView): string | null {
  if (notification.notificationType !== 'fms_webhook_received') return null;
  const facility = notification.facilityId ?? 'unknown';
  const identity = extractTenantClusterKey(notification);
  if (identity) return `fms-wh:${facility}:${identity}`;
  return `fms-wh:${facility}:${notification.id}`;
}

export function formatGroupedFmsUpdateMessage(options: {
  facilityName?: string | null;
  subject?: string | null;
  instanceCount: number;
  stillNeedsReview: boolean;
}): string {
  const facility = options.facilityName?.trim() || 'This facility';
  const subject = options.subject?.trim() ? ` for ${options.subject.trim()}` : '';
  const count = options.instanceCount;
  const head = `${facility} received ${count} FMS update${count === 1 ? '' : 's'}${subject}.`;
  return options.stillNeedsReview
    ? `${head} Open Review changes for anything still pending.`
    : `${head} Those changes have already been reviewed or dismissed.`;
}

function facilityNameFromNotification(notification: DashboardNotificationView): string | null {
  const fromMeta =
    typeof notification.metadata?.facilityName === 'string'
      ? notification.metadata.facilityName.trim()
      : '';
  if (fromMeta) return fromMeta;
  const fromMessage = notification.message.match(/^(.+?) received (?:a |an )?/i);
  return fromMessage?.[1]?.trim() || null;
}

export function presentFmsNotificationForDisplay(
  notification: DashboardNotificationView,
  openSyncLogIds: Set<string> | null,
): DashboardNotificationView {
  if (!isFmsNotificationReviewSettled(notification, openSyncLogIds)) {
    return notification;
  }
  return {
    ...notification,
    message: formatSettledFmsReviewMessage(notification.message),
    actionRequired: false,
    tone: notification.tone === 'warning' ? 'info' : notification.tone,
  };
}

const RECORDED_FMS_GROUPS_KEY = 'blulok.fms-notification-groups';

export function recordedFmsGroupsEqual(a: string[][], b: string[][]): boolean {
  const normalize = (groups: string[][]) =>
    groups
      .map((ids) => [...ids].sort().join(','))
      .sort()
      .join('|');
  return normalize(a) === normalize(b);
}

export function mergeRecordedFmsNotificationGroups(
  existing: string[][],
  ids: string[],
): string[][] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length < 2) return existing;
  const incoming = new Set(unique);
  const overlapping = existing.filter((group) => group.some((id) => incoming.has(id)));
  if (overlapping.length === 0) return [...existing, unique];
  const union = new Set<string>();
  for (const group of overlapping) {
    for (const id of group) union.add(id);
  }
  for (const id of unique) union.add(id);
  return [...existing.filter((group) => !overlapping.includes(group)), [...union]];
}

export function rememberUnreadFmsNotificationGroups(
  items: FmsNotificationDisplayItem[],
  existing: string[][],
): string[][] {
  let next = existing;
  for (const item of items) {
    if (item.instances.length < 2) continue;
    if (item.instances.some((row) => row.isRead)) continue;
    next = mergeRecordedFmsNotificationGroups(
      next,
      item.instances.map((row) => row.id),
    );
  }
  return next;
}

export function loadRecordedFmsNotificationGroups(): string[][] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECORDED_FMS_GROUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((group): group is string[] => Array.isArray(group) && group.every((id) => typeof id === 'string'))
      .filter((group) => group.length >= 2);
  } catch {
    return [];
  }
}

export function saveRecordedFmsNotificationGroups(groups: string[][]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(RECORDED_FMS_GROUPS_KEY, JSON.stringify(groups.filter((group) => group.length >= 2)));
  } catch {
    // Quota or private-mode failures should not break the widget.
  }
}

function shareRecordedFmsGroup(recordedGroups: string[][], leftId: string, rightId: string): boolean {
  return recordedGroups.some((group) => group.includes(leftId) && group.includes(rightId));
}

function canAttachToFmsGroup(
  neighbor: DashboardNotificationView,
  next: DashboardNotificationView,
  recordedGroups: string[][],
): boolean {
  const neighborKey = getFmsWebhookGroupKey(neighbor);
  const nextKey = getFmsWebhookGroupKey(next);
  if (!neighborKey || !nextKey || neighborKey !== nextKey) return false;
  if (!neighbor.isRead && !next.isRead) return true;
  if (neighbor.isRead && next.isRead) {
    return shareRecordedFmsGroup(recordedGroups, neighbor.id, next.id);
  }
  return false;
}

export function groupDashboardNotifications(
  notifications: DashboardNotificationView[],
  openSyncLogIds: Set<string> | null = null,
  recordedGroups: string[][] = [],
): FmsNotificationDisplayItem[] {
  const result: FmsNotificationDisplayItem[] = [];

  for (const notification of notifications) {
    const groupKey = getFmsWebhookGroupKey(notification);
    if (!groupKey) {
      result.push({
        key: notification.id,
        notification: presentFmsNotificationForDisplay(notification, openSyncLogIds),
        instances: [notification],
      });
      continue;
    }

    const last = result[result.length - 1];
    const neighbor = last?.instances[last.instances.length - 1];
    if (last && neighbor && canAttachToFmsGroup(neighbor, notification, recordedGroups)) {
      last.instances.push(notification);
      continue;
    }

    result.push({
      key: `${groupKey}:${notification.id}`,
      notification,
      instances: [notification],
    });
  }

  return result.map((item) => {
    if (item.instances.length === 1) {
      return {
        ...item,
        notification: presentFmsNotificationForDisplay(item.instances[0], openSyncLogIds),
      };
    }

    const instances = item.instances;
    const primary = instances[0];
    const stillNeedsReview = instances.some((row) =>
      Boolean(getFmsNotificationReviewTarget(row, { openSyncLogIds })),
    );
    const subject = describeFmsUpdatePushSubjectFromMetadata(primary.metadata);
    const presentedPrimary = presentFmsNotificationForDisplay(primary, openSyncLogIds);

    return {
      key: item.key,
      instances,
      notification: {
        ...presentedPrimary,
        message: formatGroupedFmsUpdateMessage({
          facilityName: facilityNameFromNotification(primary),
          subject,
          instanceCount: instances.length,
          stillNeedsReview,
        }),
        actionRequired: stillNeedsReview,
        tone: stillNeedsReview ? 'warning' : 'info',
        isRead: instances.every((row) => row.isRead),
      },
    };
  });
}

export function describeFmsNotificationInstance(notification: DashboardNotificationView): {
  eventLabel: string;
  message: string;
} {
  const eventType =
    typeof notification.metadata?.eventType === 'string' ? notification.metadata.eventType : undefined;
  return {
    eventLabel: getFmsUpdateEventLabel(eventType),
    message: notification.message,
  };
}

export function pickGroupedFmsReviewTarget(
  instances: DashboardNotificationView[],
  openSyncLogIds: Set<string> | null,
): ReturnType<typeof getFmsNotificationReviewTarget> {
  for (const instance of instances) {
    const target = getFmsNotificationReviewTarget(instance, { openSyncLogIds });
    if (target) return target;
  }
  return null;
}
