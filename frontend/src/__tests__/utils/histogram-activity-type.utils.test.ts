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
        access_attempt: 3,
      }),
    ).toEqual([
      { type: 'access_attempt', label: HISTOGRAM_ACTIVITY_TYPE_LABELS.access_attempt, count: 3 },
      { type: 'unlock', label: HISTOGRAM_ACTIVITY_TYPE_LABELS.unlock, count: 5 },
    ]);
  });

  it('skips lock and transitional events from histogram aggregation', () => {
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('lock')).toBe(true);
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('locking')).toBe(true);
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('unlocking')).toBe(true);
    expect(HISTOGRAM_SKIPPED_ACTIVITY_TYPES.has('unlock')).toBe(false);
  });
});
