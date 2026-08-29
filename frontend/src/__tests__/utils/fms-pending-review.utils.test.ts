import {
  formatPendingReviewLabel,
  getFmsNotificationReviewTarget,
  pickOpenPendingReviewLog,
} from '@/utils/fms-pending-review.utils';

describe('formatPendingReviewLabel', () => {
  it('formats singular and plural counts', () => {
    expect(formatPendingReviewLabel(1)).toBe('1 change pending review');
    expect(formatPendingReviewLabel(3)).toBe('3 changes pending review');
  });

  it('includes trigger source when provided', () => {
    expect(formatPendingReviewLabel(2, 'webhook')).toBe('2 changes pending review (from webhook)');
    expect(formatPendingReviewLabel(2, 'manual')).toBe('2 changes pending review (from sync)');
  });
});

describe('pickOpenPendingReviewLog', () => {
  it('returns latest log when it has pending changes', () => {
    const logs = [
      { id: 'new', changes_pending: 3, sync_status: 'pending_review' },
      { id: 'old', changes_pending: 5, sync_status: 'pending_review' },
    ] as any[];
    expect(pickOpenPendingReviewLog(logs)?.id).toBe('new');
  });

  it('falls back to an older pending batch when the latest sync failed', () => {
    const logs = [
      { id: 'failed-sync', changes_pending: 0, sync_status: 'failed' },
      { id: 'webhook-review', changes_pending: 3, sync_status: 'pending_review' },
    ] as any[];
    expect(pickOpenPendingReviewLog(logs)?.id).toBe('webhook-review');
  });

  it('falls back to an older pending batch when the latest sync completed clean', () => {
    const logs = [
      { id: 'new', changes_pending: 0, sync_status: 'completed' },
      { id: 'old', changes_pending: 5, sync_status: 'pending_review' },
    ] as any[];
    expect(pickOpenPendingReviewLog(logs)?.id).toBe('old');
  });
});

describe('getFmsNotificationReviewTarget', () => {
  it('returns facility and sync log for a webhook that still needs review', () => {
    expect(
      getFmsNotificationReviewTarget({
        notificationType: 'fms_webhook_received',
        facilityId: 'fac-1',
        metadata: { requiresReview: true, syncLogId: 'sync-1' },
      }),
    ).toEqual({ facilityId: 'fac-1', syncLogId: 'sync-1' });
  });

  it('returns null when review is not required', () => {
    expect(
      getFmsNotificationReviewTarget({
        notificationType: 'fms_webhook_received',
        facilityId: 'fac-1',
        metadata: { requiresReview: false, syncLogId: 'sync-1' },
      }),
    ).toBeNull();
  });

  it('opens review from a full-sync card using the fms_sync reference when metadata omits syncLogId', () => {
    expect(
      getFmsNotificationReviewTarget({
        notificationType: 'fms_sync_complete',
        facilityId: 'fac-1',
        reference: { type: 'fms_sync', id: 'sync-legacy' },
        metadata: { requiresReview: true, pendingCount: 2 },
      }),
    ).toEqual({ facilityId: 'fac-1', syncLogId: 'sync-legacy' });
  });

  it('opens review when auto-apply was blocked even if requiresReview was omitted', () => {
    expect(
      getFmsNotificationReviewTarget({
        notificationType: 'fms_sync_complete',
        facilityId: 'fac-1',
        metadata: { autoApplyBlocked: true, syncLogId: 'sync-2' },
      }),
    ).toEqual({ facilityId: 'fac-1', syncLogId: 'sync-2' });
  });
});
