/**
 * Normalized row from a `device_status_update` payload (after context unwraps `message.data`).
 * Gateways push lock/telemetry through the cloud → same shape for all clients.
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
  battery_level?: number;
  signal_strength?: number;
  temperature?: number;
  error_code?: string | null;
  error_message?: string | null;
  firmware_version?: string;
  last_activity?: string;
  last_seen?: string;
}

/**
 * Parse server `device_status_update` data: `{ devices: [...] }`.
 */
export function normalizeDeviceStatusWsPayload(data: unknown): LockDeviceSnapshot[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.devices)) return [];

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
 * device_status WebSocket payloads (after WebSocketContext unwraps `data`) typically include
 * `updatedDeviceId` and/or a `devices` array. Used to avoid full list refresh on unrelated devices.
 */
export function shouldRefreshDeviceListForPayload(
  payload: unknown,
  relevantIds: ReadonlySet<string>
): boolean {
  if (relevantIds.size === 0) return true;
  if (!payload || typeof payload !== 'object') return true;

  const p = payload as Record<string, unknown>;
  const updated = p.updatedDeviceId;
  if (typeof updated === 'string' && updated) {
    return relevantIds.has(updated);
  }

  const devices = p.devices;
  if (Array.isArray(devices) && devices.length > 0) {
    return devices.some((d) => {
      if (!d || typeof d !== 'object') return false;
      const id = (d as { id?: string }).id;
      return typeof id === 'string' && relevantIds.has(id);
    });
  }

  return true;
}
