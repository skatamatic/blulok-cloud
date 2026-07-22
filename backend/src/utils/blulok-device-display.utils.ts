import { readBluLokDisplayName } from '@/utils/gateway-lock-inventory-map.utils';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep in sync with frontend/src/utils/blulokDeviceDisplay.utils.ts */
export const BLULOK_UNASSIGNED_LABEL_PREFIX = 'Unassigned - ';

export function isLikelyUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

/**
 * First 5 digit characters of a serial; falls back to first 5 alphanumeric chars.
 * Keep in sync with frontend getBluLokSerialIdentityPrefix.
 */
export function getBluLokSerialIdentityPrefix(serial: string | undefined | null): string {
  const trimmed = serial?.trim() ?? '';
  if (!trimmed) return '?????';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length > 0) return digits.slice(0, 5);
  const alnum = trimmed.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length > 0) return alnum.slice(0, 5);
  return trimmed.slice(0, 5);
}

export function formatBluLokUnassignedLabel(serial: string | undefined | null): string {
  return `${BLULOK_UNASSIGNED_LABEL_PREFIX}${getBluLokSerialIdentityPrefix(serial)}`;
}

function resolveHardwareSerial(device: {
  device_serial?: string | null;
  serial?: string | null;
}): string | undefined {
  const serial = device.serial?.trim();
  const deviceSerial = device.device_serial?.trim();
  if (serial && !isLikelyUuid(serial)) return serial;
  if (deviceSerial && !isLikelyUuid(deviceSerial)) return deviceSerial;
  if (serial) return serial;
  if (deviceSerial) return deviceSerial;
  return undefined;
}

export type BluLokDisplayDevice = {
  device_settings?: Record<string, unknown> | null;
  device_serial?: string | null;
  serial?: string | null;
  unit_number?: string | null;
  unit_id?: string | null;
};

/**
 * User-facing BluLok identity — never shows gateway lock number.
 * Assigned → unit number; unassigned → `Unassigned - {first 5 digits of serial}`.
 * Keep in sync with frontend formatBluLokUserFacingLabel.
 */
export function formatBluLokUserFacingLabel(device: BluLokDisplayDevice): string {
  const unitNumber = device.unit_number?.trim();
  if (unitNumber && !isLikelyUuid(unitNumber)) return unitNumber;
  return formatBluLokUnassignedLabel(resolveHardwareSerial(device));
}

/**
 * Access history / exports display name: optional admin displayName, then user-facing identity.
 * Keep in sync with frontend formatBluLokDevicePageTitle (without falling back to stale `name`).
 */
export function resolveBluLokDeviceDisplayName(device: BluLokDisplayDevice): string {
  const displayName = readBluLokDisplayName(device);
  if (displayName) return displayName;
  return formatBluLokUserFacingLabel(device);
}
