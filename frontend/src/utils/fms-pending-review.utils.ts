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

function resolveFmsReviewSyncLogId(notification: {
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

export function getFmsNotificationReviewTarget(notification: {
  notificationType: string;
  facilityId?: string | null;
  reference?: { type: string; id: string } | null;
  metadata?: Record<string, unknown> | null;
}): { facilityId: string; syncLogId: string } | null {
  if (!FMS_REVIEW_NOTIFICATION_TYPES.has(notification.notificationType)) return null;
  if (!notificationNeedsFmsReview(notification.metadata)) return null;
  const facilityId = notification.facilityId;
  const syncLogId = resolveFmsReviewSyncLogId(notification);
  if (!facilityId || !syncLogId) return null;
  return { facilityId, syncLogId };
}

export const FMS_PENDING_REVIEW_CHANGED = 'fms-pending-review-changed';

export function notifyPendingReviewChanged(): void {
  window.dispatchEvent(new CustomEvent(FMS_PENDING_REVIEW_CHANGED));
}
