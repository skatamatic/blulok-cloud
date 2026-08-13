import type {
  AccessSessionTraceEvent,
  AccessSessionTraceFilterState,
  AccessSessionTraceRow,
} from '@/types/access-session-trace.types';
import { datetimeLocalToIso, formatDateTime, parseInstant } from '@/utils/datetime.utils';

const LIVE_SESSION_STATES = new Set(['pending', 'open']);

export type TraceTimeBound = 'after' | 'before';

export const EMPTY_TRACE_TIME_FILTER: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'> = {
  time_after: '',
  time_before: '',
};

export const TRACE_TIME_DEFAULTS: Record<TraceTimeBound, string> = {
  after: '00:00:00',
  before: '23:59:59',
};

export function splitDatetimeLocal(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date = '', time = ''] = value.split('T');
  return { date, time };
}

export function joinDatetimeLocal(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${time || '00:00:00'}`;
}

export function isTraceTimeFilterActive(
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): boolean {
  return traceTimeBoundsMs(filters) != null;
}

export function isTraceTimeRangeInverted(
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): boolean {
  const bounds = traceTimeBoundsMs(filters);
  if (bounds?.afterMs == null || bounds.beforeMs == null) return false;
  return bounds.afterMs > bounds.beforeMs;
}

function boundMs(value: string): number | undefined {
  const iso = datetimeLocalToIso(value);
  if (!iso) return undefined;
  return parseInstant(iso)?.getTime();
}

/** Inclusive UTC bounds inferred from filled After / Before fields. */
export function traceTimeBoundsMs(
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): { afterMs?: number; beforeMs?: number } | null {
  const afterMs = boundMs(filters.time_after);
  const beforeMs = boundMs(filters.time_before);
  if (afterMs == null && beforeMs == null) return null;
  return {
    ...(afterMs != null ? { afterMs } : {}),
    ...(beforeMs != null ? { beforeMs } : {}),
  };
}

function instantMs(iso: string | undefined | null): number | null {
  if (!iso) return null;
  return parseInstant(iso)?.getTime() ?? null;
}

function overlapsRange(
  startMs: number,
  endMs: number,
  bounds: { afterMs?: number; beforeMs?: number },
): boolean {
  const rangeStart = bounds.afterMs ?? Number.NEGATIVE_INFINITY;
  const rangeEnd = bounds.beforeMs ?? Number.POSITIVE_INFINITY;
  if (rangeStart > rangeEnd) return false;
  return startMs <= rangeEnd && endMs >= rangeStart;
}

export function instantMatchesTraceTimeFilter(
  iso: string | undefined | null,
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): boolean {
  const bounds = traceTimeBoundsMs(filters);
  if (!bounds) return true;
  const ms = instantMs(iso);
  if (ms == null) return false;
  return overlapsRange(ms, ms, bounds);
}

export function eventMatchesTraceTimeFilter(
  event: Pick<AccessSessionTraceEvent, 'at'>,
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): boolean {
  return instantMatchesTraceTimeFilter(event.at, filters);
}

function rowInstant(row: AccessSessionTraceRow): string {
  const value = row.started_at || row.occurred_at || row.created_at;
  return typeof value === 'string' ? value : '';
}

export function rawEventMatchesTraceTimeFilter(
  row: AccessSessionTraceRow,
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): boolean {
  return instantMatchesTraceTimeFilter(rowInstant(row), filters);
}

/**
 * Session stays whole: match if the session interval overlaps the filter.
 * Live pending/open sessions extend to `nowMs`.
 */
export function sessionMatchesTraceTimeFilter(
  row: AccessSessionTraceRow,
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
  nowMs = Date.now(),
): boolean {
  const bounds = traceTimeBoundsMs(filters);
  if (!bounds) return true;
  const start = instantMs(rowInstant(row));
  if (start == null) return false;
  const closed = instantMs(typeof row.closed_at === 'string' ? row.closed_at : null);
  const opened = instantMs(typeof row.opened_at === 'string' ? row.opened_at : null);
  const live = LIVE_SESSION_STATES.has(String(row.state || ''));
  const end = closed ?? (live ? nowMs : opened ?? start);
  return overlapsRange(start, Math.max(end, start), bounds);
}

export function formatTraceTimeFilterChip(
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): string | null {
  if (!isTraceTimeFilterActive(filters)) return null;
  const afterLabel = filters.time_after ? formatDateTime(datetimeLocalToIso(filters.time_after)) : '';
  const beforeLabel = filters.time_before ? formatDateTime(datetimeLocalToIso(filters.time_before)) : '';
  if (afterLabel && beforeLabel) return `Between: ${afterLabel} – ${beforeLabel}`;
  if (afterLabel) return `After: ${afterLabel}`;
  return `Before: ${beforeLabel}`;
}

export function formatTraceTimeFilterSummary(
  filters: Pick<AccessSessionTraceFilterState, 'time_after' | 'time_before'>,
): string {
  return formatTraceTimeFilterChip(filters) || 'Anytime';
}
