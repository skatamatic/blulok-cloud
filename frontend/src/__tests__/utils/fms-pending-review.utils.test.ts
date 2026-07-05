import { formatPendingReviewLabel, pickOpenPendingReviewLog } from '@/utils/fms-pending-review.utils';

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

  it('returns null when latest sync has no pending (ignores older pending logs)', () => {
    const logs = [
      { id: 'new', changes_pending: 0, sync_status: 'completed' },
      { id: 'old', changes_pending: 5, sync_status: 'pending_review' },
    ] as any[];
    expect(pickOpenPendingReviewLog(logs)).toBeNull();
  });
});
