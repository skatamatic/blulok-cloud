import {
  getHistogramTypeBreakdown,
  HISTOGRAM_ACTIVITY_TYPE_LABELS,
  HISTOGRAM_SKIPPED_ACTIVITY_TYPES,
} from '@/utils/histogram-activity-type.utils';

describe('histogram-activity-type.utils', () => {
  it('returns only non-zero types in display order', () => {
    expect(
      getHistogramTypeBreakdown({
        unlock: 5,
        lock: 2,
        access_attempt: 0,
      }),
    ).toEqual([
      { type: 'unlock', label: HISTOGRAM_ACTIVITY_TYPE_LABELS.unlock, count: 5 },
      { type: 'lock', label: HISTOGRAM_ACTIVITY_TYPE_LABELS.lock, count: 2 },
    ]);
  });

  it('skips transitional unlocking events from histogram aggregation', () => {
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('unlocking')).toBe(true);
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('unlock')).toBe(false);
  });
});
