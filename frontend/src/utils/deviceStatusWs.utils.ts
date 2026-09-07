/**
 * Normalized row from a `device_status_update` payload.
 * Gateways push lock/telemetry through the cloud → same shape for all clients.
 *
 * Handlers may receive either:
 * - `{ devices: [...] }` (already unwrapped `message.data`), or
 * - the full WS envelope `{ type: 'device_status_update', data: { devices: [...] } }`
 *   (see `websocket.service` `handleDeviceStatusUpdate`).
 */
export interface LockDeviceSnapshot {
  device_id?: string;
  unit_id?: string;
  /** BluLok display name or access-control device name */
  name?: string;
  location_description?: string;
  device_settings?: Record<string, unknown>;
  lock_status?: string;
  device_status?: string;
  reported_device_status?: string;
  status_unreachable_reason?: string | null;
  battery_level?: number;
  signal_strength?: number;
  temperature?: number;
  error_code?: string | null;
  error_message?: string | null;
  firmware_version?: string;
  last_activity?: string;
  last_seen?: string;
}

/** Unwrap full WS envelopes so callers can pass either shape. */
export function unwrapDeviceStatusPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const outer = raw as Record<string, unknown>;

  if (
    Array.isArray(outer.devices) ||
    typeof outer.updatedDeviceId === 'string' ||
    outer.source === 'units_update'
  ) {
    return outer;
  }

  if (outer.data && typeof outer.data === 'object') {
    return outer.data as Record<string, unknown>;
  }

  return outer;
}

/**
 * Parse server `device_status_update` data: `{ devices: [...] }`.
 */
export function normalizeDeviceStatusWsPayload(data: unknown): LockDeviceSnapshot[] {
  const d = unwrapDeviceStatusPayload(data);
  if (!d || !Array.isArray(d.devices)) return [];

  return (d.devices as Record<string, unknown>[]).map((device) => ({
      device_id: typeof device.id === 'string' ? device.id : undefined,
      unit_id: typeof device.unit_id === 'string' ? device.unit_id : undefined,
      name: typeof device.name === 'string' ? device.name : undefined,
      location_description:
        typeof device.location_description === 'string' ? device.location_description : undefined,
      device_settings:
        device.device_settings && typeof device.device_settings === 'object'
          ? (device.device_settings as Record<string, unknown>)
          : undefined,
      lock_status: typeof device.lock_status === 'string' ? device.lock_status : undefined,
      device_status: typeof device.device_status === 'string' ? device.device_status : undefined,
      reported_device_status:
        typeof device.reported_device_status === 'string' ? device.reported_device_status : undefined,
      status_unreachable_reason:
        device.status_unreachable_reason === null || typeof device.status_unreachable_reason === 'string'
          ? device.status_unreachable_reason
          : undefined,
      battery_level: typeof device.battery_level === 'number' ? device.battery_level : undefined,
      signal_strength:
        typeof device.signal_strength === 'number'
          ? device.signal_strength
          : device.signal_strength != null
            ? Number(device.signal_strength)
            : undefined,
      temperature:
        typeof device.temperature === 'number'
          ? device.temperature
          : device.temperature != null
            ? Number(device.temperature)
            : undefined,
      error_code: device.error_code === null || typeof device.error_code === 'string' ? device.error_code : undefined,
      error_message:
        device.error_message === null || typeof device.error_message === 'string'
          ? device.error_message
          : undefined,
      firmware_version: typeof device.firmware_version === 'string' ? device.firmware_version : undefined,
      last_activity: typeof device.last_activity === 'string' ? device.last_activity : undefined,
      last_seen: typeof device.last_seen === 'string' ? device.last_seen : undefined,
    }));
}

/**
 * Decide whether a device_status WebSocket payload should trigger a full devices list reload.
 * Prefer refreshing when the payload identifies any device change — including devices not
 * yet present in the current id index (gateway inventory add, pagination, filters).
 */
export function shouldRefreshDeviceListForPayload(
  payload: unknown,
  relevantIds: ReadonlySet<string>
): boolean {
  if (relevantIds.size === 0) return true;

  const p = unwrapDeviceStatusPayload(payload);
  if (!p) return true;

  if (p.source === 'units_update') return true;

  const updated = p.updatedDeviceId;
  if (typeof updated === 'string' && updated) {
    return relevantIds.has(updated);
  }

  const devices = p.devices;
  if (Array.isArray(devices) && devices.length > 0) {
    return devices.some((device) => {
      if (!device || typeof device !== 'object') return false;
      const id = (device as { id?: unknown }).id;
      return typeof id === 'string' && id.length > 0 && relevantIds.has(id);
    });
  }

  return relevantIds.size === 0;
}

/** Minimal unit row fields updated from live lock telemetry. */
export type UnitLockRealtimeFields = {
  id: string;
  lock_status?: string | null;
  battery_level?: number | null;
  signal_strength?: number | null;
  last_activity?: string | null;
  last_seen?: string | null;
  device_status?: string | null;
  blulok_device?: {
    id?: string;
    lock_status?: string;
    device_status?: string | null;
    battery_level?: number | null;
    signal_strength?: number | null;
    last_activity?: string | null;
    last_seen?: string | null;
    firmware_version?: string | null;
  } | null;
};

/**
 * Merge device_status snapshots into unit rows (Units Manager / units lists).
 * Returns the same array reference when nothing changed.
 */
export function mergeUnitRowsFromDeviceSnapshots<T extends UnitLockRealtimeFields>(
  units: T[],
  rows: LockDeviceSnapshot[],
): T[] {
  if (!rows.length || !units.length) return units;

  let changed = false;
  const next = units.map((unit) => {
    const deviceId = unit.blulok_device?.id;
    const snap =
      (deviceId ? rows.find((r) => r.device_id === deviceId) : undefined)
      ?? rows.find((r) => r.unit_id === unit.id);
    if (!snap) return unit;

    const nextLock = snap.lock_status ?? unit.lock_status ?? unit.blulok_device?.lock_status;
    const nextDeviceStatus =
      snap.device_status ?? unit.device_status ?? unit.blulok_device?.device_status;
    const nextBattery =
      snap.battery_level !== undefined
        ? snap.battery_level
        : (unit.blulok_device?.battery_level ?? unit.battery_level);
    const nextSignal =
      snap.signal_strength !== undefined
        ? snap.signal_strength
        : (unit.blulok_device?.signal_strength ?? unit.signal_strength);
    const nextActivity = snap.last_activity ?? unit.last_activity ?? unit.blulok_device?.last_activity;
    const nextSeen = snap.last_seen ?? unit.blulok_device?.last_seen;
    const nextFirmware =
      snap.firmware_version ?? unit.blulok_device?.firmware_version ?? undefined;

    const same =
      nextLock === (unit.lock_status ?? unit.blulok_device?.lock_status)
      && nextDeviceStatus === (unit.device_status ?? unit.blulok_device?.device_status)
      && nextBattery === (unit.blulok_device?.battery_level ?? unit.battery_level)
      && nextSignal === (unit.blulok_device?.signal_strength ?? unit.signal_strength)
      && nextActivity === (unit.last_activity ?? unit.blulok_device?.last_activity)
      && nextSeen === unit.blulok_device?.last_seen
      && nextFirmware === unit.blulok_device?.firmware_version;

    if (same) return unit;
    changed = true;

    return {
      ...unit,
      ...(nextLock !== undefined ? { lock_status: nextLock } : {}),
      ...(nextDeviceStatus !== undefined ? { device_status: nextDeviceStatus } : {}),
      ...(nextBattery !== undefined ? { battery_level: nextBattery } : {}),
      ...(nextSignal !== undefined ? { signal_strength: nextSignal } : {}),
      ...(nextActivity !== undefined ? { last_activity: nextActivity } : {}),
      blulok_device: unit.blulok_device
        ? {
            ...unit.blulok_device,
            ...(nextLock !== undefined ? { lock_status: nextLock } : {}),
            ...(nextDeviceStatus !== undefined ? { device_status: nextDeviceStatus } : {}),
            ...(nextBattery !== undefined ? { battery_level: nextBattery } : {}),
            ...(nextSignal !== undefined ? { signal_strength: nextSignal } : {}),
            ...(nextActivity !== undefined ? { last_activity: nextActivity } : {}),
            ...(nextSeen !== undefined ? { last_seen: nextSeen } : {}),
            ...(nextFirmware !== undefined ? { firmware_version: nextFirmware } : {}),
          }
        : unit.blulok_device,
    };
  });

  return changed ? next : units;
}
