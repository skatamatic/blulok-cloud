import {
  blulokStateValuesEqual,
  diffBluLokStateUpdate,
} from '@/utils/blulok-state-update.utils';

describe('blulok-state-update.utils', () => {
  describe('blulokStateValuesEqual', () => {
    it('treats nullish as equal', () => {
      expect(blulokStateValuesEqual(null, null)).toBe(true);
      expect(blulokStateValuesEqual(undefined, null)).toBe(true);
      expect(blulokStateValuesEqual(0, null)).toBe(false);
    });

    it('compares numeric strings to numbers', () => {
      expect(blulokStateValuesEqual(0, '0')).toBe(true);
      expect(blulokStateValuesEqual(42, '42')).toBe(true);
    });

    it('compares Date and ISO strings', () => {
      const iso = '2026-07-22T16:07:46.000Z';
      expect(blulokStateValuesEqual(new Date(iso), iso)).toBe(true);
      expect(blulokStateValuesEqual(new Date(iso), new Date(iso))).toBe(true);
    });

    it('does not treat firmware versions as dates', () => {
      expect(blulokStateValuesEqual('3.6.0.9', '3.6.0.9')).toBe(true);
      expect(blulokStateValuesEqual('3.6.0.9', '3.6.0.10')).toBe(false);
    });
  });

  describe('diffBluLokStateUpdate', () => {
    const current = {
      lock_status: 'locked',
      device_status: 'online',
      battery_level: null,
      signal_strength: 0,
      temperature: null,
      error_code: null,
      error_message: null,
      firmware_version: '3.6.0.9',
      last_seen: new Date('2026-07-22T15:09:46.000Z'),
      device_serial: 'abc',
    };

    it('returns empty changedFields when gateway re-reports identical telemetry', () => {
      const diff = diffBluLokStateUpdate(current, {
        lock_status: 'locked',
        device_status: 'online',
        signal_strength: 0,
        firmware_version: '3.6.0.9',
        last_seen: new Date('2026-07-22T15:09:46.000Z'),
      });

      expect(diff.changedFields).toEqual({});
      expect(diff.lockStatusChanged).toBe(false);
      expect(diff.deviceStatusChanged).toBe(false);
      expect(diff.telemetryChanged).toBe(false);
      expect(diff.lastSeenChanged).toBe(false);
    });

    it('flags last_seen heartbeats as a real change that should broadcast', () => {
      const diff = diffBluLokStateUpdate(current, {
        last_seen: new Date('2026-07-22T16:10:00.000Z'),
      });

      expect(diff.changedFields).toEqual({
        last_seen: new Date('2026-07-22T16:10:00.000Z'),
      });
      expect(diff.lastSeenChanged).toBe(true);
      expect(diff.telemetryChanged).toBe(false);
    });

    it('flags only fields that actually change', () => {
      const diff = diffBluLokStateUpdate(current, {
        lock_status: 'unlocked',
        signal_strength: 0,
        battery_level: 55,
      });

      expect(diff.changedFields).toEqual({
        lock_status: 'unlocked',
        battery_level: 55,
      });
      expect(diff.lockStatusChanged).toBe(true);
      expect(diff.batteryChanged).toBe(true);
      expect(diff.telemetryChanged).toBe(true);
    });
  });
});
