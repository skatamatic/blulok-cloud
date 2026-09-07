/**
 * Full-sync cleanup: which open review batches may be discarded.
 * Webhook batches are real occupancy events and must survive a later manual sync.
 */
export function isSupersedablePendingSyncLog(log: { triggered_by?: string | null }): boolean {
  return log.triggered_by !== 'webhook';
}
