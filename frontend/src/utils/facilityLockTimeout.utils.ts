import {
  DEFAULT_LOCK_COMMAND_TIMEOUT_SEC,
  MAX_LOCK_COMMAND_TIMEOUT_SEC,
  MIN_LOCK_COMMAND_TIMEOUT_SEC,
} from '@/constants/lock-command.constants';

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

export function resolveLockCommandTimeoutMs(timeoutSec?: number | null): number {
  return normalizeLockCommandTimeoutSec(timeoutSec) * 1000;
}

type FacilityTimeoutSource = {
  id?: string;
  lock_command_timeout_sec?: number | null;
};

type UnitLockTimeoutSource = {
  facility_lock_command_timeout_sec?: number | null;
  facility_id?: string;
};

/** Resolve hardware-ack timeout from unit list/detail row or optional facility catalog. */
export function resolveLockTimeoutMsForUnit(
  unit: UnitLockTimeoutSource,
  facilities?: FacilityTimeoutSource[] | null,
  fallbackFacility?: FacilityTimeoutSource | null,
): number {
  if (unit.facility_lock_command_timeout_sec != null) {
    return resolveLockCommandTimeoutMs(unit.facility_lock_command_timeout_sec);
  }
  if (fallbackFacility?.lock_command_timeout_sec != null) {
    return resolveLockCommandTimeoutMs(fallbackFacility.lock_command_timeout_sec);
  }
  if (unit.facility_id && facilities?.length) {
    const match = facilities.find((f) => f.id === unit.facility_id);
    if (match?.lock_command_timeout_sec != null) {
      return resolveLockCommandTimeoutMs(match.lock_command_timeout_sec);
    }
  }
  return resolveLockCommandTimeoutMs();
}

export function resolveLockTimeoutMsForFacility(
  facility?: FacilityTimeoutSource | null,
): number {
  return resolveLockCommandTimeoutMs(facility?.lock_command_timeout_sec);
}
