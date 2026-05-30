export type BluLokDeviceDisplayFields = {
  id?: string;
  device_serial?: string;
  serial?: string;
  firmware_version?: string;
  device_settings?: Record<string, unknown> | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLikelyUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_RE.test(value.trim());
}

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
  return undefined;
}

export function formatBluLokLockNumberLabel(device: BluLokDeviceDisplayFields): string {
  const lockNumber = getBluLokLockNumber(device);
  if (lockNumber != null) return `Lock #${lockNumber}`;

  const serial = getBluLokHardwareSerial(device);
  if (serial) return serial;

  return 'Unknown lock';
}

export function formatBluLokDeviceSubtitle(device: BluLokDeviceDisplayFields): string {
  const parts: string[] = [];
  const serial = getBluLokHardwareSerial(device);
  const lockNumber = getBluLokLockNumber(device);

  if (serial) {
    parts.push(`Serial ${serial}`);
  } else if (lockNumber == null && device.device_serial) {
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

  const lockNumber = getBluLokLockNumber(device);
  if (lockNumber != null && String(lockNumber).includes(norm)) return true;
  if ((device.device_serial || '').toLowerCase().includes(norm)) return true;
  if ((device.serial || '').toLowerCase().includes(norm)) return true;
  if ((device.firmware_version || '').toLowerCase().includes(norm)) return true;
  return false;
}

export function bluLokDeviceAvatarLabel(device: BluLokDeviceDisplayFields): string {
  const lockNumber = getBluLokLockNumber(device);
  if (lockNumber != null) {
    const digits = String(lockNumber);
    return digits.length >= 2 ? digits.slice(-2) : digits;
  }
  const serial = getBluLokHardwareSerial(device) || device.device_serial || '?';
  return serial.slice(-2);
}
