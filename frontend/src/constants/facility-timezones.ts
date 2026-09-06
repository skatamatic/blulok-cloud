/** Keep in sync with backend/src/constants/facility-timezones.ts */
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

export const DEFAULT_FACILITY_TIMEZONE = 'America/Vancouver';

export function facilityTimezoneLabel(value?: string | null): string {
  const resolved = value?.trim() || DEFAULT_FACILITY_TIMEZONE;
  const match = FACILITY_TIMEZONE_OPTIONS.find((option) => option.value === resolved);
  return match ? match.label : resolved;
}
