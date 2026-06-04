import {
  buildHistogramChartEntries,
  formatHistogramAxisLabel,
  generateHistogramSlotKeys,
  shouldShowHistogramAxisLabel,
} from '@/utils/histogram-timeline.utils';

describe('histogram-timeline.utils', () => {
  it('generates 24 hourly slots for day period', () => {
    const slots = generateHistogramSlotKeys('day', new Date('2026-06-01T15:30:00'));
    expect(slots).toHaveLength(24);
    expect(slots[23]).toBe('2026-06-01 15:00:00');
  });

  it('generates 7 daily slots for week period', () => {
    expect(generateHistogramSlotKeys('week', new Date('2026-06-01T12:00:00'))).toHaveLength(7);
  });

  it('generates 30 daily slots for month period', () => {
    expect(generateHistogramSlotKeys('month', new Date('2026-06-01T12:00:00'))).toHaveLength(30);
  });

  it('fills empty buckets from grouped data', () => {
    const entries = buildHistogramChartEntries(
      'week',
      { '2026-05-26': [{ id: 1 }] as unknown as never[] },
      new Date('2026-06-01T12:00:00'),
    );
    expect(entries).toHaveLength(7);
    expect(entries.filter(([, data]) => data.length === 0).length).toBeGreaterThan(0);
  });

  it('thins axis labels for dense timelines', () => {
    expect(shouldShowHistogramAxisLabel(0, 30, 'month')).toBe(true);
    expect(shouldShowHistogramAxisLabel(1, 30, 'month')).toBe(false);
    expect(shouldShowHistogramAxisLabel(2, 30, 'month')).toBe(true);
  });

  it('uses compact numeric labels for dense month timelines', () => {
    expect(formatHistogramAxisLabel('2026-05-19', 'month', 30)).toBe('5/19');
  });
});
