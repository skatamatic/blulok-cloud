import type { AccessEventDenialReason } from '@protocol/access-events';
import type { DeviceSimulatorState, StoredAccessCode } from '@protocol/device-simulator-state';
import type { ScheduleTimeWindow } from '@protocol/schedule.types';

export type AccessCodeEvaluationResult =
  | { granted: true; matchedCode: StoredAccessCode; message: string }
  | { granted: false; denial_reason: AccessEventDenialReason; message: string };

function normalizeWindows(raw: unknown): ScheduleTimeWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: ScheduleTimeWindow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const w = row as Record<string, unknown>;
    const day = Number(w.day_of_week);
    const start = typeof w.start_time === 'string' ? w.start_time : '';
    const end = typeof w.end_time === 'string' ? w.end_time : '';
    if (!Number.isInteger(day) || day < 0 || day > 6 || !start || !end) continue;
    out.push({ day_of_week: day, start_time: start, end_time: end });
  }
  return out;
}

function parseTimeToSeconds(time: string): number {
  const parts = time.trim().split(':').map((part) => parseInt(part, 10));
  const [hours = 0, minutes = 0, seconds = 0] = parts;
  return hours * 3600 + minutes * 60 + seconds;
}

export function resolveDeviceClock(sim?: DeviceSimulatorState, now = new Date()): Date {
  if (sim?.lastSecureTimeSyncTs != null && sim.lastSecureTimeSyncTs > 0) {
    return new Date(sim.lastSecureTimeSyncTs * 1000);
  }
  return now;
}

export function getCodeTimeWindows(code: StoredAccessCode): ScheduleTimeWindow[] {
  const fromTop = normalizeWindows(code.time_windows);
  if (fromTop.length) return fromTop;
  return normalizeWindows(code.schedule?.time_windows);
}

export function isCodeWithinValidity(code: StoredAccessCode, at: Date): boolean {
  if (code.valid_from) {
    const from = new Date(code.valid_from);
    if (Number.isNaN(from.getTime()) || at < from) return false;
  }
  const until = new Date(code.valid_until);
  if (Number.isNaN(until.getTime()) || at >= until) return false;
  return true;
}

export function isWithinAnyTimeWindow(at: Date, windows: ScheduleTimeWindow[]): boolean {
  if (windows.length === 0) return true;
  const day = at.getDay();
  const seconds = at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
  for (const window of windows) {
    if (window.day_of_week !== day) continue;
    const start = parseTimeToSeconds(window.start_time);
    const end = parseTimeToSeconds(window.end_time);
    if (seconds >= start && seconds <= end) return true;
  }
  return false;
}

export function evaluateAccessCodeEntry(
  enteredCode: string,
  storedCodes: StoredAccessCode[],
  sim?: DeviceSimulatorState,
  now?: Date,
): AccessCodeEvaluationResult {
  const trimmed = enteredCode.trim();
  if (!trimmed) {
    return { granted: false, denial_reason: 'invalid_credential', message: 'Enter an access code' };
  }

  const at = resolveDeviceClock(sim, now);
  const match = storedCodes.find((row) => row.code === trimmed);
  if (!match) {
    return { granted: false, denial_reason: 'invalid_credential', message: 'Code not recognized on this device' };
  }

  if (!isCodeWithinValidity(match, at)) {
    return { granted: false, denial_reason: 'invalid_credential', message: 'Code is expired or not yet valid' };
  }

  const windows = getCodeTimeWindows(match);
  if (!isWithinAnyTimeWindow(at, windows)) {
    const scheduleLabel = match.schedule_name ? ` (${match.schedule_name})` : '';
    return {
      granted: false,
      denial_reason: 'out_of_schedule',
      message: `Outside scheduled access window${scheduleLabel}`,
    };
  }

  const scheduleLabel = match.schedule_name ? ` — ${match.schedule_name}` : '';
  return {
    granted: true,
    matchedCode: match,
    message: `Access granted via keypad${scheduleLabel}`,
  };
}
