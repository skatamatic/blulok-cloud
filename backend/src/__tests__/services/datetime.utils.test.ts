import {
  formatNotificationDate,
  formatNotificationDateTime,
  formatNotificationTime,
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

  describe('notification date formatting', () => {
    const instant = new Date('2026-09-06T17:05:00.000Z');

    it('defaults omitted timezone to America/Vancouver', () => {
      expect(formatNotificationDate(instant)).toBe('September 6, 2026');
      expect(formatNotificationTime(instant)).toMatch(/^10:05 AM /);
      expect(formatNotificationDateTime(instant)).toMatch(/^September 6, 2026 at 10:05 AM /);
    });

    it('formats explicit UTC', () => {
      expect(formatNotificationTime(instant, 'UTC')).toBe('5:05 PM UTC');
      expect(formatNotificationDateTime(instant, 'UTC')).toBe('September 6, 2026 at 5:05 PM UTC');
    });

    it('formats in a facility timezone', () => {
      expect(formatNotificationTime(instant, 'America/Edmonton')).toMatch(/^11:05 AM /);
    });
  });
});
