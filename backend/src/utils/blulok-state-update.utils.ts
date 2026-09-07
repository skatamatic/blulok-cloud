/**
 * Helpers for applying BluLok state patches without no-op DB writes / WS spam.
 */

export type BluLokStatePatch = Partial<{
  lock_status: 'locked' | 'unlocked' | 'locking' | 'unlocking' | 'error' | 'maintenance' | 'unknown';
  device_status: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level: number;
  signal_strength: number;
  temperature: number;
  error_code: string | null;
  error_message: string | null;
  firmware_version: string;
  last_seen: Date;
  serial: string;
}>;

export type BluLokStateCurrentRow = {
  lock_status?: string | null;
  device_status?: string | null;
  battery_level?: number | string | null;
  signal_strength?: number | string | null;
  temperature?: number | string | null;
  error_code?: string | null;
  error_message?: string | null;
  firmware_version?: string | null;
  last_seen?: Date | string | null;
  serial?: string | null;
  device_serial?: string | null;
};

export type BluLokStateDiffResult = {
  /** Columns to write (excludes updated_at / last_activity). */
  changedFields: Record<string, unknown>;
  lockStatusChanged: boolean;
  deviceStatusChanged: boolean;
  batteryChanged: boolean;
  lastSeenChanged: boolean;
  /** True when any telemetry field (battery/signal/temp/errors/firmware) changed. */
  telemetryChanged: boolean;
};

function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

/** Compare DB/gateway scalars (numbers may arrive as strings; dates as Date or ISO). */
export function blulokStateValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  const aMs = toEpochMs(a);
  const bMs = toEpochMs(b);
  if (aMs != null && bMs != null) return aMs === bMs;

  if (typeof a === 'number' || typeof b === 'number' || typeof a === 'bigint' || typeof b === 'bigint') {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  }

  return String(a) === String(b);
}

/**
 * Diff an incoming state patch against the current row.
 * Does not bump last_activity / updated_at — caller adds those only when writing.
 */
export function diffBluLokStateUpdate(
  current: BluLokStateCurrentRow,
  updates: BluLokStatePatch,
): BluLokStateDiffResult {
  const changedFields: Record<string, unknown> = {};
  let lockStatusChanged = false;
  let deviceStatusChanged = false;
  let batteryChanged = false;
  let lastSeenChanged = false;
  let telemetryChanged = false;

  if (updates.lock_status !== undefined && !blulokStateValuesEqual(updates.lock_status, current.lock_status)) {
    changedFields.lock_status = updates.lock_status;
    lockStatusChanged = true;
  }

  if (
    updates.device_status !== undefined &&
    !blulokStateValuesEqual(updates.device_status, current.device_status)
  ) {
    changedFields.device_status = updates.device_status;
    deviceStatusChanged = true;
  }

  if (
    updates.battery_level !== undefined &&
    !blulokStateValuesEqual(updates.battery_level, current.battery_level)
  ) {
    changedFields.battery_level = updates.battery_level;
    batteryChanged = true;
    telemetryChanged = true;
  }

  if (
    updates.signal_strength !== undefined &&
    !blulokStateValuesEqual(updates.signal_strength, current.signal_strength)
  ) {
    changedFields.signal_strength = updates.signal_strength;
    telemetryChanged = true;
  }

  if (
    updates.temperature !== undefined &&
    !blulokStateValuesEqual(updates.temperature, current.temperature)
  ) {
    changedFields.temperature = updates.temperature;
    telemetryChanged = true;
  }

  if (
    updates.error_code !== undefined &&
    !blulokStateValuesEqual(updates.error_code, current.error_code)
  ) {
    changedFields.error_code = updates.error_code;
    telemetryChanged = true;
  }

  if (
    updates.error_message !== undefined &&
    !blulokStateValuesEqual(updates.error_message, current.error_message)
  ) {
    changedFields.error_message = updates.error_message;
    telemetryChanged = true;
  }

  if (
    updates.firmware_version !== undefined &&
    !blulokStateValuesEqual(updates.firmware_version, current.firmware_version)
  ) {
    changedFields.firmware_version = updates.firmware_version;
    telemetryChanged = true;
  }

  if (updates.last_seen !== undefined && !blulokStateValuesEqual(updates.last_seen, current.last_seen)) {
    changedFields.last_seen = updates.last_seen;
    lastSeenChanged = true;
  }

  if (updates.serial !== undefined) {
    const currentSerial = current.serial ?? current.device_serial;
    if (!blulokStateValuesEqual(updates.serial, currentSerial)) {
      changedFields.serial = updates.serial;
    }
  }

  return {
    changedFields,
    lockStatusChanged,
    deviceStatusChanged,
    batteryChanged,
    lastSeenChanged,
    telemetryChanged,
  };
}
