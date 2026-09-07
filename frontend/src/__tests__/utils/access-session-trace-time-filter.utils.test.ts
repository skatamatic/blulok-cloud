import {
  eventMatchesTraceTimeFilter,
  formatTraceTimeFilterChip,
  instantMatchesTraceTimeFilter,
  isTraceTimeFilterActive,
  isTraceTimeRangeInverted,
  joinDatetimeLocal,
  rawEventMatchesTraceTimeFilter,
  sessionMatchesTraceTimeFilter,
  splitDatetimeLocal,
} from '@/utils/access-session-trace-time-filter.utils';
import { isoToDatetimeLocal } from '@/utils/datetime.utils';
import type { AccessSessionTraceFilterState } from '@/types/access-session-trace.types';

const AFTER = isoToDatetimeLocal('2026-08-12T19:00:00.000Z');
const BEFORE = isoToDatetimeLocal('2026-08-12T19:20:00.000Z');

function filters(
  patch: Partial<AccessSessionTraceFilterState> = {},
): AccessSessionTraceFilterState {
  return {
    user_id: '',
    unit_id: '',
    time_after: '',
    time_before: '',
    ...patch,
  };
}

describe('access-session-trace-time-filter.utils', () => {
  it('treats empty bounds as inactive and infers after / before / between from filled fields', () => {
    expect(isTraceTimeFilterActive(filters())).toBe(false);
    expect(isTraceTimeFilterActive(filters({ time_after: AFTER }))).toBe(true);
    expect(isTraceTimeFilterActive(filters({ time_before: BEFORE }))).toBe(true);
    expect(isTraceTimeFilterActive(filters({ time_after: AFTER, time_before: BEFORE }))).toBe(true);
  });

  it('filters event instants after / before / between', () => {
    const after = filters({ time_after: AFTER });
    expect(instantMatchesTraceTimeFilter('2026-08-12T18:59:59.000Z', after)).toBe(false);
    expect(instantMatchesTraceTimeFilter('2026-08-12T19:00:00.000Z', after)).toBe(true);
    expect(eventMatchesTraceTimeFilter({ at: '2026-08-12T19:01:00.000Z' }, after)).toBe(true);

    const before = filters({ time_before: BEFORE });
    expect(instantMatchesTraceTimeFilter('2026-08-12T19:20:00.000Z', before)).toBe(true);
    expect(instantMatchesTraceTimeFilter('2026-08-12T19:20:01.000Z', before)).toBe(false);

    const between = filters({ time_after: AFTER, time_before: BEFORE });
    expect(instantMatchesTraceTimeFilter('2026-08-12T18:59:00.000Z', between)).toBe(false);
    expect(instantMatchesTraceTimeFilter('2026-08-12T19:10:00.000Z', between)).toBe(true);
    expect(instantMatchesTraceTimeFilter('2026-08-12T19:21:00.000Z', between)).toBe(false);
    expect(rawEventMatchesTraceTimeFilter({ id: 'a', occurred_at: '2026-08-12T18:00:01.000Z' }, after)).toBe(
      false,
    );
  });

  it('keeps sessions whole when their interval overlaps the range', () => {
    const after = filters({ time_after: AFTER });
    const nowMs = Date.parse('2026-08-12T19:40:00.000Z');

    expect(
      sessionMatchesTraceTimeFilter(
        {
          id: 'closed-overlap',
          state: 'closed',
          started_at: '2026-08-12T18:00:00.000Z',
          closed_at: '2026-08-12T19:30:00.000Z',
        },
        after,
        nowMs,
      ),
    ).toBe(true);
    expect(
      sessionMatchesTraceTimeFilter(
        {
          id: 'ended-before',
          state: 'closed',
          started_at: '2026-08-12T17:00:00.000Z',
          closed_at: '2026-08-12T17:10:00.000Z',
        },
        after,
        nowMs,
      ),
    ).toBe(false);
    expect(
      sessionMatchesTraceTimeFilter(
        {
          id: 'live',
          state: 'pending',
          started_at: '2026-08-12T18:50:00.000Z',
        },
        after,
        nowMs,
      ),
    ).toBe(true);
  });

  it('formats an applied-filter chip from filled bounds', () => {
    expect(formatTraceTimeFilterChip(filters())).toBeNull();
    expect(formatTraceTimeFilterChip(filters({ time_after: AFTER }))).toMatch(/^After:/);
    expect(formatTraceTimeFilterChip(filters({ time_after: AFTER, time_before: BEFORE }))).toMatch(
      /^Between:/,
    );
  });

  it('detects an inverted after/before range', () => {
    expect(isTraceTimeRangeInverted(filters({ time_after: AFTER, time_before: BEFORE }))).toBe(false);
    expect(isTraceTimeRangeInverted(filters({ time_after: BEFORE, time_before: AFTER }))).toBe(true);
    expect(isTraceTimeRangeInverted(filters({ time_after: AFTER }))).toBe(false);
  });

  it('joins and splits local date + time', () => {
    expect(splitDatetimeLocal('2026-08-12T19:00:00')).toEqual({ date: '2026-08-12', time: '19:00:00' });
    expect(joinDatetimeLocal('2026-08-12', '19:00')).toBe('2026-08-12T19:00');
    expect(joinDatetimeLocal('', '19:00')).toBe('');
  });
});
