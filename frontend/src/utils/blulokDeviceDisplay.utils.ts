import { readDisplayName } from '@/utils/deviceMetadataForm.utils';

export type BluLokDeviceDisplayFields = {
  id?: string;
  name?: string;
  unit_id?: string | null;
  unit_number?: string | null;
  device_serial?: string;
  serial?: string;
  firmware_version?: string;
  device_settings?: Record<string, unknown> | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep in sync with backend/src/utils/blulok-device-display.utils.ts */
export const BLULOK_UNASSIGNED_LABEL_PREFIX = 'Unassigned - ';

export function isLikelyUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

/** Still used for admin metadata forms / gateway inventory — not for user-facing labels. */
export function getBluLokLockNumber(device: BluLokDeviceDisplayFields): number | null {
  const settings = device.device_settings;
  if (!settings || typeof settings !== 'object') return null;

  const raw = settings.lockNumber ?? settings.lock_number;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Best human-readable hardware serial (avoids showing lock_id UUID when possible). */
export function getBluLokHardwareSerial(device: BluLokDeviceDisplayFields): string | undefined {
  const serial = device.serial?.trim();
  const deviceSerial = device.device_serial?.trim();

  if (serial && !isLikelyUuid(serial)) return serial;
  if (deviceSerial && !isLikelyUuid(deviceSerial)) return deviceSerial;
  if (serial) return serial;
  if (deviceSerial) return deviceSerial;
  return undefined;
}

/**
 * First 5 digit characters of a serial; falls back to first 5 alphanumeric chars.
 * Keep in sync with backend getBluLokSerialIdentityPrefix.
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

function resolvedUnitNumber(device: BluLokDeviceDisplayFields): string | null {
  const raw = device.unit_number?.trim();
  if (raw && !isLikelyUuid(raw)) return raw;
  return null;
}

/**
 * User-facing BluLok identity — never shows gateway lock number.
 * Assigned → unit number; unassigned → `Unassigned - {first 5 digits of serial}`.
 * Keep in sync with backend formatBluLokUserFacingLabel.
 */
export function formatBluLokUserFacingLabel(device: BluLokDeviceDisplayFields): string {
  const unitNumber = resolvedUnitNumber(device);
  if (unitNumber) return unitNumber;
  return formatBluLokUnassignedLabel(getBluLokHardwareSerial(device));
}

/** Page header title — display name / name, then unit or Unassigned identity. */
export function formatBluLokDevicePageTitle(device: BluLokDeviceDisplayFields): string {
  const displayName = readDisplayName(device.device_settings);
  if (displayName) return displayName;

  const name = device.name?.trim();
  if (name) return name;

  return formatBluLokUserFacingLabel(device);
}

export function formatBluLokDeviceSubtitle(device: BluLokDeviceDisplayFields): string {
  const parts: string[] = [];
  const serial = getBluLokHardwareSerial(device);

  if (serial) {
    parts.push(`Serial ${serial}`);
  } else if (device.device_serial) {
    parts.push(`Serial ${device.device_serial}`);
  }

  if (device.firmware_version) {
    parts.push(`FW ${device.firmware_version}`);
  }

  return parts.join(' · ') || 'Firmware unknown';
}

export function bluLokDeviceMatchesSearch(device: BluLokDeviceDisplayFields, searchTerm: string): boolean {
  const norm = searchTerm.trim().toLowerCase();
  if (!norm) return true;

  if (formatBluLokUserFacingLabel(device).toLowerCase().includes(norm)) return true;

  const unitNumber = resolvedUnitNumber(device);
  if (unitNumber && unitNumber.toLowerCase().includes(norm)) return true;

  const lockNumber = getBluLokLockNumber(device);
  if (lockNumber != null && String(lockNumber).includes(norm)) return true;
  if ((device.device_serial || '').toLowerCase().includes(norm)) return true;
  if ((device.serial || '').toLowerCase().includes(norm)) return true;
  if ((device.firmware_version || '').toLowerCase().includes(norm)) return true;
  return false;
}

export function bluLokDeviceAvatarLabel(device: BluLokDeviceDisplayFields): string {
  const unitNumber = resolvedUnitNumber(device);
  if (unitNumber) {
    const compact = unitNumber.replace(/\s+/g, '');
    return compact.length >= 2 ? compact.slice(-2) : compact;
  }
  const serial = getBluLokHardwareSerial(device) || device.device_serial || '';
  return getBluLokSerialIdentityPrefix(serial).slice(-2);
}
