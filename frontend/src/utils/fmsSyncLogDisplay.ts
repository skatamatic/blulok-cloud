import { FMSSyncLog } from '@/types/fms.types';

export type FmsSyncLogKind = 'webhook_push' | 'full_sync';

/** Webhook pushes are granular; manual/automatic runs are comprehensive full syncs. */
export function getFmsSyncLogKind(log: FMSSyncLog): FmsSyncLogKind {
  return log.triggered_by === 'webhook' ? 'webhook_push' : 'full_sync';
}

export function isFmsWebhookPushLog(log: FMSSyncLog): boolean {
  return getFmsSyncLogKind(log) === 'webhook_push';
}

export function getFmsSyncLogTypeLabel(log: FMSSyncLog): string {
  return isFmsWebhookPushLog(log) ? 'Update push' : 'Full sync';
}

/** Row container classes for dashboard sync history. */
export function getFmsSyncHistoryRowClassName(log: FMSSyncLog): string {
  if (isFmsWebhookPushLog(log)) {
    return 'flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-sky-200/70 dark:border-sky-800/50 bg-sky-50/60 dark:bg-sky-950/25 text-xs';
  }
  return 'flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 text-xs';
}

/** Type badge classes paired with {@link getFmsSyncLogTypeLabel}. */
export function getFmsSyncHistoryTypeBadgeClassName(log: FMSSyncLog): string {
  if (isFmsWebhookPushLog(log)) {
    return 'inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300';
  }
  return 'inline-flex shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gray-200/90 text-gray-700 dark:bg-gray-600/70 dark:text-gray-200';
}

/**
 * Compact changes summary for sync history rows.
 * Webhook pushes use granular "change(s)" wording; full syncs use "detected".
 */
export function getFmsSyncHistoryChangesLabel(log: FMSSyncLog): string {
  const count = log.changes_detected ?? 0;
  if (isFmsWebhookPushLog(log)) {
    if (count === 0) return 'No changes';
    return count === 1 ? '1 change' : `${count} changes`;
  }
  const suffix = getFmsSyncHistoryDetectedSuffix(log);
  return `${count} detected${suffix}`;
}

/**
 * Suffix after "N detected" in compact sync history (dashboard widget).
 * Does not infer "auto" from counts — uses {@link FMSSyncLog.sync_summary.changes_auto_applied}.
 */
export function getFmsSyncHistoryDetectedSuffix(log: FMSSyncLog): string {
  const detected = log.changes_detected ?? 0;
  const applied = log.changes_applied ?? 0;
  if (detected === 0) {
    return '';
  }
  if (applied === detected && log.sync_summary?.changes_auto_applied === true) {
    return ' • Auto-applied';
  }
  if (applied === detected) {
    return ' • All applied';
  }
  return ` • ${applied} applied`;
}

/** "Applied" column text on the FMS tab sync history table. */
export function getFmsSyncAppliedColumnText(log: FMSSyncLog): string {
  const detected = log.changes_detected ?? 0;
  const applied = log.changes_applied ?? 0;
  if (detected === 0) {
    return '—';
  }
  if (applied === detected && log.sync_summary?.changes_auto_applied === true) {
    return 'Auto-applied';
  }
  if (applied === detected) {
    return 'All applied';
  }
  return String(applied);
}
