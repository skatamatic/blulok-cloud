/** Curated IANA zones for facility setup. Any valid IANA name is accepted by the API. */
export const FACILITY_TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'America/Vancouver', label: 'Pacific — Vancouver' },
  { value: 'America/Los_Angeles', label: 'Pacific — Los Angeles' },
  { value: 'America/Edmonton', label: 'Mountain — Edmonton / Calgary' },
  { value: 'America/Denver', label: 'Mountain — Denver' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Winnipeg', label: 'Central — Winnipeg' },
  { value: 'America/Chicago', label: 'Central — Chicago' },
  { value: 'America/Regina', label: 'Saskatchewan (no DST)' },
  { value: 'America/Toronto', label: 'Eastern — Toronto' },
  { value: 'America/New_York', label: 'Eastern — New York' },
  { value: 'America/Halifax', label: 'Atlantic — Halifax' },
  { value: 'America/St_Johns', label: 'Newfoundland' },
  { value: 'UTC', label: 'UTC' },
];

/** British Columbia (Pacific, observes DST). Used when a facility has no timezone. */
export const DEFAULT_FACILITY_TIMEZONE = 'America/Vancouver';

export function isValidIanaTimeZone(value: string | null | undefined): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

export function resolveFacilityTimeZone(value?: string | null): string {
  return isValidIanaTimeZone(value) ? String(value).trim() : DEFAULT_FACILITY_TIMEZONE;
}
