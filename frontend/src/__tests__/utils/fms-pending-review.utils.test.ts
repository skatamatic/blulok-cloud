import { formatPendingReviewLabel } from '@/utils/fms-pending-review.utils';

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
