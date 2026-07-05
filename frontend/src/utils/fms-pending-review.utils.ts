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
 * Pending review banner applies only when the *latest* sync log still has open changes.
 * Older batches with leftover pending counts are ignored once a newer sync completes clean.
 */
export function pickOpenPendingReviewLog(logs: FMSSyncLog[]): FMSSyncLog | null {
  const latest = logs[0];
  if (!latest) return null;
  if (latest.sync_status === 'failed') return null;
  if ((latest.changes_pending ?? 0) <= 0) return null;
  return latest;
}

export const FMS_PENDING_REVIEW_CHANGED = 'fms-pending-review-changed';

export function notifyPendingReviewChanged(): void {
  window.dispatchEvent(new CustomEvent(FMS_PENDING_REVIEW_CHANGED));
}
