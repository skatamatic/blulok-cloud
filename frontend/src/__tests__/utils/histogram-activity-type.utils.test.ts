import {
  getHistogramTypeBreakdown,
  HISTOGRAM_ACTIVITY_TYPE_LABELS,
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
});
