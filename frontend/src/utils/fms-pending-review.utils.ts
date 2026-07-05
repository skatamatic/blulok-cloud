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
