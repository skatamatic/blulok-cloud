import {
  OPEN_UNTIL_MAX_FUTURE_SEC,
  WIDGET_TIMED_OPEN_MAX_MINUTES,
} from '@/constants/access-control-open.constants';

export function isSupportsWidgetTimedOpenEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

export function computeOpenUntilUnixSec(durationMinutes: number, nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + durationMinutes * 60;
}

export type OpenUntilValidationResult =
  | { ok: true; openUntil: number }
  | { ok: false; message: string };

/**
 * Validate optional open_until for access-control unlock commands.
 */
export function validateAccessControlOpenUntil(
  openUntil: unknown,
  options: {
    lockStatus: string;
    supportsWidgetTimedOpen: unknown;
    nowUnixSec?: number;
  },
): OpenUntilValidationResult {
  if (openUntil === undefined || openUntil === null) {
    return { ok: true, openUntil: 0 };
  }

  if (options.lockStatus !== 'unlocked') {
    return { ok: false, message: 'open_until is only allowed when lock_status is unlocked' };
  }

  if (!isSupportsWidgetTimedOpenEnabled(options.supportsWidgetTimedOpen)) {
    return {
      ok: false,
      message: 'Timed open is not enabled for this device; enable it in device setup.',
    };
  }

  if (typeof openUntil !== 'number' || !Number.isInteger(openUntil) || openUntil <= 0) {
    return { ok: false, message: 'open_until must be a positive integer unix timestamp (UTC seconds)' };
  }

  const now = options.nowUnixSec ?? Math.floor(Date.now() / 1000);
  if (openUntil <= now) {
    return { ok: false, message: 'open_until must be a future unix timestamp (UTC seconds)' };
  }

  if (openUntil > now + OPEN_UNTIL_MAX_FUTURE_SEC) {
    return {
      ok: false,
      message: `open_until must be within ${WIDGET_TIMED_OPEN_MAX_MINUTES} minutes`,
    };
  }

  return { ok: true, openUntil };
}
