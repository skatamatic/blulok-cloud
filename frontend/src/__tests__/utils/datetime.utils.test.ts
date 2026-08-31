import {
  buildLocalDateRangeQuery,
  datetimeLocalToIso,
  formatDate,
  formatDateTime,
  formatNotificationTimestamp,
  formatRelativeTime,
  formatRelativeWithExact,
  formatTime,
  formatUtcDateTime,
  isoToDatetimeLocal,
  localDateInputToUtcEndIso,
  localDateInputToUtcStartIso,
  queryDateFromMs,
  queryDateToMs,
  RELATIVE_LAST_SEEN_OPTS,
  RELATIVE_UNITS_ACTIVITY_OPTS,
  toLocalDateInputValue,
} from '@/utils/datetime.utils';

describe('datetime.utils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-16T15:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('toLocalDateInputValue', () => {
    it('returns local calendar YYYY-MM-DD', () => {
      expect(toLocalDateInputValue(new Date('2026-06-16T15:00:00'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('local date to UTC ISO', () => {
    it('converts local day bounds to UTC ISO', () => {
      const start = localDateInputToUtcStartIso('2026-06-16');
      const end = localDateInputToUtcEndIso('2026-06-16');
      expect(new Date(start).getTime()).toBeLessThanOrEqual(new Date(end).getTime());
      expect(start.endsWith('Z')).toBe(true);
      expect(end.endsWith('Z')).toBe(true);
    });

    it('maps a local calendar day to a 24h UTC window', () => {
      const startMs = new Date(localDateInputToUtcStartIso('2026-06-16')).getTime();
      const endMs = new Date(localDateInputToUtcEndIso('2026-06-16')).getTime();
      expect(endMs - startMs).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1);
    });
  });

  describe('buildLocalDateRangeQuery', () => {
    it('maps YYYY-MM-DD UI values to ISO UTC bounds', () => {
      const range = buildLocalDateRangeQuery('2026-06-10', '2026-06-16');
      expect(range.date_from).toMatch(/Z$/);
      expect(range.date_to).toMatch(/Z$/);
    });

    it('passes through full ISO values', () => {
      const iso = '2026-06-16T04:00:00.000Z';
      expect(buildLocalDateRangeQuery(iso, iso)).toEqual({
        date_from: iso,
        date_to: iso,
      });
    });
  });

  describe('queryDateFromMs / queryDateToMs', () => {
    it('uses local calendar day for YYYY-MM-DD', () => {
      const from = queryDateFromMs('2026-06-16');
      const to = queryDateToMs('2026-06-16');
      expect(from).not.toBeNull();
      expect(to).not.toBeNull();
      expect(from!).toBeLessThanOrEqual(to!);
    });
  });

  describe('datetimeLocalToIso / isoToDatetimeLocal', () => {
    it('round-trips datetime-local values', () => {
      const local = '2026-06-16T10:30';
      const iso = datetimeLocalToIso(local);
      expect(iso).toBeDefined();
      expect(isoToDatetimeLocal(iso!)).toBe(local);
    });
  });

  describe('formatRelativeTime', () => {
    it('shows relative labels for recent times', () => {
      const fiveMinAgo = new Date('2026-06-16T14:55:00');
      expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
    });

    it('shows day bucket before switching to absolute', () => {
      const threeDaysAgo = new Date('2026-06-13T15:00:00');
      expect(formatRelativeTime(threeDaysAgo)).toBe('3d ago');
    });

    it('shows absolute datetime after default 7-day window', () => {
      const twoWeeksAgo = new Date('2026-06-02T09:30:00');
      const formatted = formatRelativeTime(twoWeeksAgo);
      expect(formatted).toMatch(/Jun 2, 2026/);
      expect(formatted).toMatch(/9:30/);
    });

    it('RELATIVE_LAST_SEEN_OPTS keeps relative days indefinitely', () => {
      const monthAgo = new Date('2026-05-16T15:00:00');
      expect(formatRelativeTime(monthAgo, RELATIVE_LAST_SEEN_OPTS)).toBe('31d ago');
    });

    it('RELATIVE_UNITS_ACTIVITY_OPTS shows date-only after 30 days', () => {
      const fortyDaysAgo = new Date('2026-05-07T15:00:00');
      expect(formatRelativeTime(fortyDaysAgo, RELATIVE_UNITS_ACTIVITY_OPTS)).toMatch(/May 7, 2026/);
    });
  });

  describe('queryDateFromMs invalid input', () => {
    it('returns null for invalid strings', () => {
      expect(queryDateFromMs('not-a-date')).toBeNull();
      expect(queryDateToMs('')).toBeNull();
    });
  });

  describe('formatRelativeWithExact', () => {
    it('provides exact local time as title', () => {
      const ts = new Date('2026-06-16T14:55:00');
      const { display, title } = formatRelativeWithExact(ts);
      expect(display).toBe('5m ago');
      expect(title).toMatch(/Jun 16, 2026/);
    });
  });

  describe('formatUtcDateTime', () => {
    it('labels UTC explicitly', () => {
      const formatted = formatUtcDateTime(new Date('2026-06-16T15:30:00.000Z'));
      expect(formatted).toContain('UTC');
    });
  });

  describe('formatDate / formatDateTime', () => {
    it('formats invalid input as fallback', () => {
      expect(formatDate('invalid')).toBe('—');
      expect(formatDateTime('invalid')).toBe('—');
    });

    it('formats epoch millisecond timestamps', () => {
      const ts = new Date('2026-06-16T15:30:00.000Z').getTime();
      expect(formatTime(ts)).toMatch(/\d/);
      expect(formatDateTime(ts)).toMatch(/Jun 16, 2026/);
    });
  });

  describe('formatNotificationTimestamp', () => {
    it('shows relative then date+time', () => {
      expect(formatNotificationTimestamp(new Date('2026-06-16T14:55:00'))).toBe('5m ago');
      const older = formatNotificationTimestamp(new Date('2026-06-14T09:30:00'));
      expect(older).toMatch(/Jun 14, 2026/);
      expect(older).toMatch(/9:30/);
    });
  });
});
