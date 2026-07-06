import { FMSWebhookFeedItem } from '@/types/fms.types';

export const FMS_WEBHOOK_FEED_LIMIT = 5;

export function mergeWebhookFeed(
  existing: FMSWebhookFeedItem[],
  incoming: FMSWebhookFeedItem,
): FMSWebhookFeedItem[] {
  const next = [incoming, ...existing.filter((item) => item.id !== incoming.id)];
  next.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
  );
  return next.slice(0, FMS_WEBHOOK_FEED_LIMIT);
}

/** Clear stale pending-review badges once the open review log is gone or changed. */
export function reconcileWebhookFeedReview(
  events: FMSWebhookFeedItem[],
  openPendingSyncLogId: string | null,
): FMSWebhookFeedItem[] {
  return events.map((event) => {
    if (!event.requiresReview) return event;
    if (openPendingSyncLogId && event.syncLogId === openPendingSyncLogId) return event;
    return { ...event, requiresReview: false };
  });
}

export function getWebhookFeedOutcomeLabel(item: FMSWebhookFeedItem): string {
  if (item.changesDetected === 0) {
    return 'No changes';
  }
  if (item.autoApplied) {
    return 'Auto-applied';
  }
  if (item.requiresReview) {
    if (item.changesApplied > 0) {
      const needsReview = Math.max(0, item.changesDetected - item.changesApplied);
      return `${item.changesApplied} applied · ${needsReview} need review`;
    }
    return 'Pending review';
  }
  return `${item.changesApplied}/${item.changesDetected} applied`;
}

export function getWebhookFeedOutcomeClass(item: FMSWebhookFeedItem): string {
  if (item.autoApplied) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300';
  }
  if (item.requiresReview) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300';
  }
  if (item.changesDetected === 0) {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300';
  }
  return 'bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-300';
}
