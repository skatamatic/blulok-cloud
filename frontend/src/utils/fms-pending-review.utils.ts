import type { FMSSyncLog } from '@/types/fms.types';

export type PendingReviewSource = 'manual' | 'automatic' | 'webhook';

export function formatPendingReviewLabel(
  count: number,
  triggeredBy?: PendingReviewSource | null,
): string {
  const countLabel = `${count} change${count === 1 ? '' : 's'} pending review`;
  if (triggeredBy === 'webhook') return `${countLabel} (from webhook)`;
  if (triggeredBy === 'manual') return `${countLabel} (from sync)`;
  return countLabel;
}

/**
 * Newest non-failed log that still has pending changes.
 * A later failed full sync must not hide an earlier webhook review queue.
 */
export function pickOpenPendingReviewLog(logs: FMSSyncLog[]): FMSSyncLog | null {
  return (
    logs.find(
      (log) => log.sync_status !== 'failed' && (log.changes_pending ?? 0) > 0,
    ) ?? null
  );
}

const FMS_REVIEW_NOTIFICATION_TYPES = new Set([
  'fms_webhook_received',
  'fms_sync_complete',
  'fms_sync_failed',
]);

function notificationNeedsFmsReview(metadata?: Record<string, unknown> | null): boolean {
  if (!metadata) return false;
  if (metadata.requiresReview === true || metadata.autoApplyBlocked === true) return true;
  return Number(metadata.pendingCount ?? 0) > 0;
}

export function resolveFmsReviewSyncLogId(notification: {
  reference?: { type: string; id: string } | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const fromMetadata = notification.metadata?.syncLogId;
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata;
  }
  if (notification.reference?.type === 'fms_sync' && notification.reference.id) {
    return notification.reference.id;
  }
  return null;
}

export function collectFmsReviewSyncLogIds(
  notifications: Array<{
    notificationType: string;
    reference?: { type: string; id: string } | null;
    metadata?: Record<string, unknown> | null;
  }>,
): string[] {
  const ids = new Set<string>();
  for (const notification of notifications) {
    if (!FMS_REVIEW_NOTIFICATION_TYPES.has(notification.notificationType)) continue;
    const syncLogId = resolveFmsReviewSyncLogId(notification);
    if (syncLogId) ids.add(syncLogId);
  }
  return [...ids];
}

export function getFmsNotificationReviewTarget(
  notification: {
    notificationType: string;
    facilityId?: string | null;
    reference?: { type: string; id: string } | null;
    metadata?: Record<string, unknown> | null;
  },
  options?: { openSyncLogIds?: Set<string> | null },
): { facilityId: string; syncLogId: string } | null {
  if (!FMS_REVIEW_NOTIFICATION_TYPES.has(notification.notificationType)) return null;
  if (!notificationNeedsFmsReview(notification.metadata)) return null;
  const facilityId = notification.facilityId;
  const syncLogId = resolveFmsReviewSyncLogId(notification);
  if (!facilityId || !syncLogId) return null;
  if (options && 'openSyncLogIds' in options) {
    if (options.openSyncLogIds == null) return null;
    if (!options.openSyncLogIds.has(syncLogId)) return null;
  }
  return { facilityId, syncLogId };
}

/** Stored metadata still says "needs review" after apply/dismiss. */
export function isFmsNotificationReviewSettled(
  notification: {
    notificationType: string;
    reference?: { type: string; id: string } | null;
    metadata?: Record<string, unknown> | null;
  },
  openSyncLogIds: Set<string> | null,
): boolean {
  if (openSyncLogIds == null) return false;
  if (!notificationNeedsFmsReview(notification.metadata)) return false;
  const syncLogId = resolveFmsReviewSyncLogId(notification);
  if (!syncLogId) return false;
  return !openSyncLogIds.has(syncLogId);
}

export function formatSettledFmsReviewMessage(message: string): string {
  const rewritten = message
    .replace(
      /\d+\s+changes?\s+need(?:s)?\s+your\s+review(?:\s+before\s+they\s+take\s+effect)?/gi,
      'Those changes have already been reviewed or dismissed',
    )
    .replace(
      /Open Review changes to see the cause and how to fix it\.?/gi,
      'Nothing is left to review.',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (rewritten !== message.trim()) return rewritten;
  if (!/reviewed or dismissed/i.test(message)) {
    return `${message.replace(/\s+/g, ' ').trim()} Those changes have already been reviewed or dismissed.`;
  }
  return rewritten;
}

export const FMS_PENDING_REVIEW_CHANGED = 'fms-pending-review-changed';

export function notifyPendingReviewChanged(): void {
  window.dispatchEvent(new CustomEvent(FMS_PENDING_REVIEW_CHANGED));
}
