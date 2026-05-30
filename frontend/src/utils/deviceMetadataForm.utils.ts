/** Shared helpers for add/edit device forms — maps gateway inventory fields to admin API shapes. */

export const ACCESS_CONTROLLER_TYPES = [
  { value: 'gate' as const, label: 'Gate' },
  { value: 'elevator' as const, label: 'Elevator' },
  { value: 'door' as const, label: 'Door' },
];

export function readLockNumber(settings?: Record<string, unknown> | null): string {
  const raw = settings?.lockNumber ?? settings?.lock_number;
  if (raw === undefined || raw === null || raw === '') return '';
  return String(raw);
}

export function readDisplayName(settings?: Record<string, unknown> | null): string {
  const raw = settings?.displayName ?? settings?.display_name;
  return typeof raw === 'string' ? raw : '';
}

export function readLocationDescription(settings?: Record<string, unknown> | null): string {
  const raw = settings?.locationDescription ?? settings?.location_description;
  return typeof raw === 'string' ? raw : '';
}

export function buildBluLokDeviceSettings(
  existing: Record<string, unknown> | null | undefined,
  patch: {
    lockNumber?: string;
    displayName?: string;
    locationDescription?: string;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(existing ?? {}) };

  const lockTrim = patch.lockNumber?.trim() ?? '';
  if (lockTrim) {
    const parsed = Number(lockTrim);
    if (Number.isFinite(parsed)) next.lockNumber = parsed;
  } else if (patch.lockNumber !== undefined) {
    delete next.lockNumber;
    delete next.lock_number;
  }

  const displayTrim = patch.displayName?.trim() ?? '';
  if (displayTrim) next.displayName = displayTrim;
  else if (patch.displayName !== undefined) delete next.displayName;

  const locationTrim = patch.locationDescription?.trim() ?? '';
  if (locationTrim) next.locationDescription = locationTrim;
  else if (patch.locationDescription !== undefined) delete next.locationDescription;

  return next;
}
