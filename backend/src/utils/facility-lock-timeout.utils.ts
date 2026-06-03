import {
  DEFAULT_LOCK_COMMAND_TIMEOUT_SEC,
  MAX_LOCK_COMMAND_TIMEOUT_SEC,
  MIN_LOCK_COMMAND_TIMEOUT_SEC,
} from '@/constants/lock-command.constants';

/**
 * Normalize a facility lock-command timeout (seconds) into an allowed range.
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
  return Math.min(MAX_LOCK_COMMAND_TIMEOUT_SEC, Math.max(MIN_LOCK_COMMAND_TIMEOUT_SEC, rounded));
}

export function lockCommandTimeoutMs(timeoutSec: unknown): number {
  return normalizeLockCommandTimeoutSec(timeoutSec) * 1000;
}
