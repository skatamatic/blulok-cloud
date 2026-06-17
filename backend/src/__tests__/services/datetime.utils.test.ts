import {
  parseQueryDateFrom,
  parseQueryDateTo,
  toIsoString,
  toIsoStringOrEpoch,
} from '@/utils/datetime.utils';

describe('datetime.utils', () => {
  describe('toIsoString', () => {
    it('converts Date to ISO UTC', () => {
      const iso = toIsoString(new Date('2026-06-16T15:30:00.000Z'));
      expect(iso).toBe('2026-06-16T15:30:00.000Z');
    });

    it('returns null for invalid input', () => {
      expect(toIsoString('not-a-date')).toBeNull();
      expect(toIsoString(null)).toBeNull();
    });
  });

  describe('toIsoStringOrEpoch', () => {
    it('falls back to epoch for invalid input', () => {
      expect(toIsoStringOrEpoch('bad')).toBe(new Date(0).toISOString());
    });
  });

  describe('parseQueryDateFrom/To', () => {
    it('parses YYYY-MM-DD as UTC calendar day bounds', () => {
      expect(parseQueryDateFrom('2026-06-16').toISOString()).toBe('2026-06-16T00:00:00.000Z');
      expect(parseQueryDateTo('2026-06-16').toISOString()).toBe('2026-06-16T23:59:59.999Z');
    });

    it('parses full ISO as-is', () => {
      const from = '2026-06-16T04:00:00.000Z';
      expect(parseQueryDateFrom(from).toISOString()).toBe(from);
      const to = '2026-06-17T03:59:59.999Z';
      expect(parseQueryDateTo(to).toISOString()).toBe(to);
    });
  });
});
