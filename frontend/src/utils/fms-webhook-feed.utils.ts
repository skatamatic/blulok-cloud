import { FMSWebhookFeedItem } from '@/types/fms.types';

export const FMS_WEBHOOK_FEED_LIMIT = 5;

export function mergeWebhookFeed(
  existing: FMSWebhookFeedItem[],
  incoming: FMSWebhookFeedItem,
): FMSWebhookFeedItem[] {
  const next = [incoming, ...existing.filter((item) => item.id !== incoming.id)];
  return next.slice(0, FMS_WEBHOOK_FEED_LIMIT);
}

export function getWebhookFeedOutcomeLabel(item: FMSWebhookFeedItem): string {
  if (item.changesDetected === 0) {
    return 'No changes';
  }
  if (item.autoApplied) {
    return 'Auto-applied';
  }
  if (item.requiresReview) {
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
