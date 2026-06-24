/**
 * Central date/time utilities for the BluLok frontend.
 *
 * Wire format: ISO-8601 UTC strings from the API.
 * Display: user's local timezone via Intl / toLocale*.
 */

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface FormatRelativeOptions {
  compact?: boolean;
  fallback?: string;
  /** Show second-level granularity for very recent times (default true). */
  includeSeconds?: boolean;
  /** After this many calendar days, switch to absolute (default 7). Ignored when neverAbsolute is true. */
  absoluteAfterDays?: number;
  /**
   * Hours-based relative window before absolute. Converted to days when absoluteAfterDays is omitted.
   * ActivityMonitor uses 24 for date-only absolute after ~1 day.
   */
  absoluteAfterHours?: number;
  /** Keep showing "Nd ago" indefinitely (device last-seen widgets). */
  neverAbsolute?: boolean;
  /** Absolute format style once relative window expires (default datetime). */
  absoluteStyle?: 'date' | 'datetime';
}

/** Lock/Battery last-seen: minutes, hours, then days without switching to absolute. */
export const RELATIVE_LAST_SEEN_OPTS: FormatRelativeOptions = {
  neverAbsolute: true,
  includeSeconds: false,
  fallback: 'Never',
};

/** Units manager activity: relative up to 30 days, then date-only absolute. */
export const RELATIVE_UNITS_ACTIVITY_OPTS: FormatRelativeOptions = {
  absoluteAfterDays: 30,
  absoluteStyle: 'date',
};

export function parseInstant(input: string | Date | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const parsed = new Date(input);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `YYYY-MM-DD` in the user's local calendar (for `<input type="date">`). */
export function toLocalDateInputValue(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar day start → ISO UTC (for API query lower bound). */
export function localDateInputToUtcStartIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** Local calendar day end → ISO UTC (for API query upper bound). */
export function localDateInputToUtcEndIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function localDateInputStartMs(dateStr: string): number {
  return new Date(localDateInputToUtcStartIso(dateStr)).getTime();
}

export function localDateInputEndMs(dateStr: string): number {
  return new Date(localDateInputToUtcEndIso(dateStr)).getTime();
}

/** Map UI `YYYY-MM-DD` filters to UTC ISO bounds for API requests. */
export function buildLocalDateRangeQuery(
  dateFrom?: string,
  dateTo?: string,
): { date_from?: string; date_to?: string } {
  return {
    ...(dateFrom && DATE_ONLY_RE.test(dateFrom)
      ? { date_from: localDateInputToUtcStartIso(dateFrom) }
      : dateFrom
        ? { date_from: dateFrom }
        : {}),
    ...(dateTo && DATE_ONLY_RE.test(dateTo)
      ? { date_to: localDateInputToUtcEndIso(dateTo) }
      : dateTo
        ? { date_to: dateTo }
        : {}),
  };
}

/** Lower bound ms for client-side filtering (local calendar day or ISO). Null when invalid. */
export function queryDateFromMs(value: string): number | null {
  if (DATE_ONLY_RE.test(value)) return localDateInputStartMs(value);
  const parsed = parseInstant(value);
  if (!parsed) return null;
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Upper bound ms for client-side filtering (local calendar day or ISO). Null when invalid. */
export function queryDateToMs(value: string): number | null {
  if (DATE_ONLY_RE.test(value)) return localDateInputEndMs(value);
  const parsed = parseInstant(value);
  if (!parsed) return null;
  const ms = parsed.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Convert `<input type="datetime-local">` value to ISO UTC for the API. */
export function datetimeLocalToIso(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/** Populate `<input type="datetime-local">` from an ISO UTC string. */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  const date = parseInstant(iso ?? undefined);
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

export function formatDateTime(
  input: string | Date | number | null | undefined,
  fallback = '—',
): string {
  const date = parseInstant(input);
  if (!date) return fallback;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(
  input: string | Date | number | null | undefined,
  fallback = '—',
): string {
  const date = parseInstant(input);
  if (!date) return fallback;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function formatTime(
  input: string | Date | number | null | undefined,
  fallback = '—',
): string {
  const date = parseInstant(input);
  if (!date) return fallback;
  return date.toLocaleTimeString(undefined, { timeStyle: 'short' });
}

export function formatDateTimeParts(
  input: string | Date | number | null | undefined,
): { date: string; time: string } | null {
  const date = parseInstant(input);
  if (!date) return null;
  return {
    date: date.toLocaleDateString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}

/** Explicit UTC display for security-sensitive timestamps (e.g. signed JWT commands). */
export function formatUtcDateTime(
  input: string | Date | number | null | undefined,
  fallback = '—',
): string {
  let date: Date | null = null;
  if (typeof input === 'number') {
    date = new Date(input);
  } else {
    date = parseInstant(input ?? undefined);
  }
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return `${date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  })} UTC`;
}

export function formatRelativeTime(
  input: string | Date | null | undefined,
  opts: FormatRelativeOptions = {},
): string {
  const {
    compact = false,
    fallback = '—',
    includeSeconds = true,
    absoluteAfterDays,
    absoluteAfterHours,
    neverAbsolute = false,
    absoluteStyle = 'datetime',
  } = opts;

  const date = parseInstant(input);
  if (!date) return fallback;

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return compact ? 'Now' : 'Just now';

  const sec = Math.floor(diffMs / 1000);
  if (includeSeconds && sec < 60) {
    return compact ? (sec < 5 ? 'Now' : `${sec}s`) : sec < 5 ? 'Just now' : `${sec}s ago`;
  }

  const min = Math.floor(sec / 60);
  if (min < 1) return compact ? 'Now' : 'Just now';
  if (min < 60) return compact ? `${min}m` : `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) {
    return compact ? `${hr}h` : `${hr}h ago`;
  }

  const days = Math.floor(hr / 24);
  const maxRelativeDays = neverAbsolute
    ? Number.POSITIVE_INFINITY
    : absoluteAfterDays ??
      (absoluteAfterHours !== undefined
        ? Math.max(1, Math.floor(absoluteAfterHours / 24))
        : 7);

  if (days < maxRelativeDays) {
    return compact ? `${days}d` : `${days}d ago`;
  }

  if (absoluteStyle === 'date') return formatDate(date);
  return formatDateTime(date);
}

export function formatRelativeWithExact(
  input: string | Date | null | undefined,
  opts: FormatRelativeOptions = {},
): { display: string; title: string } {
  const date = parseInstant(input);
  return {
    display: formatRelativeTime(input, opts),
    title: date ? formatDateTime(date) : '—',
  };
}

/** Notification widget: relative under 24h, then locale date + time. */
export function formatNotificationTimestamp(timestamp: Date, compact = false): string {
  const diffMs = Date.now() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) return compact ? 'Now' : 'Just now';
  if (diffMins < 60) return compact ? `${diffMins}m` : `${diffMins}m ago`;
  if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return compact ? `${hours}h` : `${hours}h ago`;
  }

  if (compact) {
    return timestamp.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  return timestamp.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
