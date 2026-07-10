import { WIDGET_TIMED_OPEN_MAX_MINUTES } from '@/constants/access-control-open.constants';

/** Normalize DB/API booleans for supports_widget_timed_open. */
export function isSupportsWidgetTimedOpenEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

/** Wall-clock unix timestamp (UTC seconds) when a timed open should end. */
export function computeOpenUntilUnixSec(durationMinutes: number, nowMs = Date.now()): number {
  const minutes = Math.max(1, Math.min(WIDGET_TIMED_OPEN_MAX_MINUTES, Math.floor(durationMinutes)));
  return Math.floor(nowMs / 1000) + minutes * 60;
}

export { WIDGET_TIMED_OPEN_MAX_MINUTES };
