import {
  DEFAULT_LOCK_COMMAND_TIMEOUT_SEC,
  MAX_LOCK_COMMAND_TIMEOUT_SEC,
  MIN_LOCK_COMMAND_TIMEOUT_SEC,
} from '@/constants/lock-command.constants';

/**
 * Normalize a facility lock-command timeout (seconds) into an allowed range.
 * 0 = one-shot (no confirmation wait / transitional state).
 */
export function normalizeLockCommandTimeoutSec(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LOCK_COMMAND_TIMEOUT_SEC;
  }

  const rounded = Math.round(parsed);
  if (rounded <= MIN_LOCK_COMMAND_TIMEOUT_SEC) {
    return MIN_LOCK_COMMAND_TIMEOUT_SEC;
  }

  return Math.min(MAX_LOCK_COMMAND_TIMEOUT_SEC, rounded);
}

export function isOneShotLockCommandTimeout(value?: number | null): boolean {
  if (value === 0) return true;
  if (value == null) return false;
  return normalizeLockCommandTimeoutSec(value) === 0;
}

export function lockCommandTimeoutMs(timeoutSec: unknown): number {
  if (timeoutSec === 0) return 0;
  return normalizeLockCommandTimeoutSec(timeoutSec) * 1000;
}
