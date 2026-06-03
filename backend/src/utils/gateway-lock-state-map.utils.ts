import type { DeviceModel } from '@/models/device.model';
import { parseGatewayLastSeen } from '@/utils/gateway-timestamp.utils';

/** Partial gateway lock telemetry fields shared by inventory items and state updates. */
export type GatewayLockStateFields = {
  state?: 'CLOSED' | 'OPENED' | 'ERROR' | 'UNKNOWN';
  locked?: boolean;
  online?: boolean;
  battery_level?: number;
  signal_strength?: number;
  temperature?: number;
  temperature_value?: number;
  firmware_version?: string;
  error_code?: string | null;
  error_message?: string | null;
  last_seen?: string | Date;
  serial?: string;
};

export type BluLokStateDbUpdate = Parameters<DeviceModel['updateBluLokDeviceState']>[1];

/**
 * Map gateway PROXY lock fields (inventory or state payload) to BluLok DB columns.
 * Only provided fields are included in the result.
 */
export function mapGatewayLockStateFieldsToDbUpdate(fields: GatewayLockStateFields): BluLokStateDbUpdate {
  const dbUpdates: BluLokStateDbUpdate = {};

  if (fields.state) {
    const stateMap: Record<string, 'locked' | 'unlocked' | 'error' | 'unknown'> = {
      CLOSED: 'locked',
      OPENED: 'unlocked',
      ERROR: 'error',
      UNKNOWN: 'unknown',
    };
    dbUpdates.lock_status = stateMap[fields.state] || 'unknown';
  }

  if (!dbUpdates.lock_status && fields.locked !== undefined) {
    dbUpdates.lock_status = fields.locked ? 'locked' : 'unlocked';
  }

  if (fields.online !== undefined) {
    dbUpdates.device_status = fields.online ? 'online' : 'offline';
  }
  if (fields.battery_level !== undefined) {
    dbUpdates.battery_level = fields.battery_level;
  }
  if (fields.signal_strength !== undefined) {
    dbUpdates.signal_strength = fields.signal_strength;
  }
  if (fields.temperature !== undefined) {
    dbUpdates.temperature = fields.temperature;
  } else if (fields.temperature_value !== undefined) {
    dbUpdates.temperature = fields.temperature_value;
  }
  if (fields.firmware_version !== undefined) {
    dbUpdates.firmware_version = fields.firmware_version;
  }
  if (fields.error_code !== undefined) {
    dbUpdates.error_code = fields.error_code;
  }
  if (fields.error_message !== undefined) {
    dbUpdates.error_message = fields.error_message;
  }
  if (fields.last_seen !== undefined) {
    const lastSeen = parseGatewayLastSeen(fields.last_seen);
    if (lastSeen !== undefined) {
      dbUpdates.last_seen = lastSeen;
    }
  }
  if (fields.serial !== undefined) {
    dbUpdates.serial = fields.serial;
  }

  return dbUpdates;
}

/** Resolve lock number from outbound HTTP gateway device payloads (camelCase). */
export function resolveOutboundGatewayLockNumber(gatewayDevice: Record<string, unknown>): number | undefined {
  const raw = gatewayDevice.lockNumber ?? gatewayDevice.lock_number;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}
