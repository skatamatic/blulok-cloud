import { readBluLokDisplayName } from '@/utils/gateway-lock-inventory-map.utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLikelyUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

function readLockNumber(settings?: Record<string, unknown> | null): number | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = settings.lockNumber ?? settings.lock_number;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Same human-facing label order as the device details page title. */
export function resolveBluLokDeviceDisplayName(device: {
  device_settings?: Record<string, unknown> | null;
  device_serial?: string | null;
}): string {
  const displayName = readBluLokDisplayName(device);
  if (displayName) return displayName;

  const lockNumber = readLockNumber(device.device_settings);
  if (lockNumber != null) return `Lock #${lockNumber}`;

  const serial = device.device_serial?.trim();
  if (serial && !isLikelyUuid(serial)) return serial;

  return 'Unknown lock';
}
