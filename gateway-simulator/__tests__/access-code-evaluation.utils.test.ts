import { describe, expect, it } from 'vitest';
import {
  evaluateAccessCodeEntry,
  getCodeTimeWindows,
  isCodeWithinValidity,
  isWithinAnyTimeWindow,
  resolveDeviceClock,
} from '../src/main/access/access-code-evaluation.utils';
import type { StoredAccessCode } from '../src/protocol/device-simulator-state';

const baseCode = (overrides: Partial<StoredAccessCode> = {}): StoredAccessCode => ({
  code: '1234',
  valid_from: '2020-01-01T00:00:00.000Z',
  valid_until: '2030-01-01T00:00:00.000Z',
  ...overrides,
});

describe('access-code-evaluation.utils', () => {
  it('uses secure time sync when present', () => {
    const sim = { lastSecureTimeSyncTs: 1_700_000_000 } as import('../src/protocol/device-simulator-state').DeviceSimulatorState;
    const clock = resolveDeviceClock(sim);
    expect(clock.toISOString()).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('denies unknown codes', () => {
    const result = evaluateAccessCodeEntry('9999', [baseCode()], undefined, new Date('2025-06-15T12:00:00'));
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.denial_reason).toBe('invalid_credential');
  });

  it('denies expired codes', () => {
    const result = evaluateAccessCodeEntry(
      '1234',
      [baseCode({ valid_until: '2024-01-01T00:00:00.000Z' })],
      undefined,
      new Date('2025-06-15T12:00:00'),
    );
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.denial_reason).toBe('invalid_credential');
  });

  it('grants when no schedule windows (24/7 within validity)', () => {
    const result = evaluateAccessCodeEntry('1234', [baseCode()], undefined, new Date('2025-06-15T12:00:00'));
    expect(result.granted).toBe(true);
  });

  it('denies when outside schedule window', () => {
    const sundayNoon = new Date('2025-06-15T12:00:00'); // Sunday
    expect(sundayNoon.getDay()).toBe(0);
    const code = baseCode({
      schedule_name: 'Weekday 9-5',
      time_windows: [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
    });
    const result = evaluateAccessCodeEntry('1234', [code], undefined, sundayNoon);
    expect(result.granted).toBe(false);
    if (!result.granted) {
      expect(result.denial_reason).toBe('out_of_schedule');
      expect(result.message).toContain('Weekday 9-5');
    }
  });

  it('grants when inside schedule window', () => {
    const mondayTen = new Date('2025-06-16T10:30:00'); // Monday
    expect(mondayTen.getDay()).toBe(1);
    const code = baseCode({
      time_windows: [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
    });
    const result = evaluateAccessCodeEntry('1234', [code], undefined, mondayTen);
    expect(result.granted).toBe(true);
  });

  it('reads nested schedule.time_windows when top-level empty', () => {
    const code = baseCode({
      time_windows: [],
      schedule: {
        facility_id: 'fac-1',
        time_windows: [{ day_of_week: 2, start_time: '08:00:00', end_time: '18:00:00' }],
      },
    });
    expect(getCodeTimeWindows(code)).toHaveLength(1);
  });

  it('isWithinAnyTimeWindow respects end boundary', () => {
    const at = new Date('2025-06-16T17:00:00');
    expect(at.getDay()).toBe(1);
    expect(
      isWithinAnyTimeWindow(at, [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }]),
    ).toBe(true);
  });

  it('isCodeWithinValidity rejects before valid_from', () => {
    const code = baseCode({ valid_from: '2026-01-01T00:00:00.000Z' });
    expect(isCodeWithinValidity(code, new Date('2025-06-15T12:00:00'))).toBe(false);
  });
});
