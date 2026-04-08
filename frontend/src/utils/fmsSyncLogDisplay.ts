import { FMSSyncLog } from '@/types/fms.types';

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
