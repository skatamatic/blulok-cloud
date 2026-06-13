import type { DeviceModel } from '@/models/device.model';

/** Non-identity lock fields supplied on gateway inventory sync. */
export type GatewayLockInventoryProperties = {
  name?: string;
  lock_number?: number;
  location_description?: string;
};

export type BluLokPropertyDbUpdate = Parameters<DeviceModel['updateBluLokDevice']>[1];

function readSettingString(
  settings: Record<string, unknown>,
  camel: string,
  snake: string
): string {
  const raw = settings[camel] ?? settings[snake];
  return typeof raw === 'string' ? raw.trim() : '';
}

function readLockNumber(settings: Record<string, unknown>): number | undefined {
  const raw = settings.lockNumber ?? settings.lock_number;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/**
 * Map gateway inventory property fields to BluLok metadata updates.
 * Identity (`lock_id` / device_serial) is handled separately and never changed here.
 */
export function mapGatewayLockInventoryPropertiesToDbUpdate(
  item: GatewayLockInventoryProperties,
  existing: { device_settings?: Record<string, unknown> | null }
): BluLokPropertyDbUpdate | null {
  const update: BluLokPropertyDbUpdate = {};
  const base =
    existing.device_settings && typeof existing.device_settings === 'object'
      ? { ...existing.device_settings }
      : {};
  let settingsChanged = false;

  if (item.lock_number !== undefined) {
    const next = Number(item.lock_number);
    const current = readLockNumber(base);
    if (current !== next) {
      base.lockNumber = next;
      delete base.lock_number;
      settingsChanged = true;
    }
  }

  if (item.name !== undefined) {
    const trimmed = item.name.trim();
    const current = readSettingString(base, 'displayName', 'display_name');
    if (trimmed !== current) {
      if (trimmed) base.displayName = trimmed;
      else delete base.displayName;
      delete base.display_name;
      settingsChanged = true;
    }
  }

  if (item.location_description !== undefined) {
    const trimmed = item.location_description.trim();
    const current = readSettingString(base, 'locationDescription', 'location_description');
    if (trimmed !== current) {
      if (trimmed) base.locationDescription = trimmed;
      else delete base.locationDescription;
      delete base.location_description;
      settingsChanged = true;
    }
  }

  if (settingsChanged) {
    update.device_settings = base;
  }

  return Object.keys(update).length > 0 ? update : null;
}

export function readBluLokDisplayName(device: {
  device_settings?: Record<string, unknown> | null;
}): string | undefined {
  if (!device.device_settings || typeof device.device_settings !== 'object') {
    return undefined;
  }
  const name = readSettingString(device.device_settings, 'displayName', 'display_name');
  return name || undefined;
}
