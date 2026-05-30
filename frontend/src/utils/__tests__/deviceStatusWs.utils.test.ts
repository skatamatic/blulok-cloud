import {
  normalizeDeviceStatusWsPayload,
  shouldRefreshDeviceListForPayload,
} from '@/utils/deviceStatusWs.utils';

describe('shouldRefreshDeviceListForPayload', () => {
  const ids = new Set(['a', 'b']);

  it('returns true when relevantIds is empty (initial / unknown)', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, new Set())).toBe(true);
  });

  it('matches updatedDeviceId', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'a' }, ids)).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, ids)).toBe(false);
  });

  it('matches any id in devices array', () => {
    expect(
      shouldRefreshDeviceListForPayload({ devices: [{ id: 'b' }, { id: 'z' }] }, ids)
    ).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ devices: [{ id: 'z' }] }, ids)).toBe(false);
  });

  it('returns true when payload has no id hints (conservative)', () => {
    expect(shouldRefreshDeviceListForPayload({}, ids)).toBe(true);
  });
});

describe('normalizeDeviceStatusWsPayload', () => {
  it('returns [] for non-objects', () => {
    expect(normalizeDeviceStatusWsPayload(null)).toEqual([]);
    expect(normalizeDeviceStatusWsPayload(undefined)).toEqual([]);
    expect(normalizeDeviceStatusWsPayload('x')).toEqual([]);
  });

  it('maps devices[] including telemetry fields', () => {
    expect(
      normalizeDeviceStatusWsPayload({
        devices: [
          {
            id: 'dev-1',
            unit_id: 'u1',
            lock_status: 'locked',
            device_status: 'online',
            battery_level: 80,
            signal_strength: -72,
            temperature: 21.5,
            error_code: null,
            error_message: null,
            firmware_version: '1.0.0',
            last_activity: '2026-01-01T00:00:00Z',
            last_seen: '2026-01-02T00:00:00Z',
          },
        ],
      })
    ).toEqual([
      {
        device_id: 'dev-1',
        unit_id: 'u1',
        lock_status: 'locked',
        device_status: 'online',
        battery_level: 80,
        signal_strength: -72,
        temperature: 21.5,
        error_code: null,
        error_message: null,
        firmware_version: '1.0.0',
        last_activity: '2026-01-01T00:00:00Z',
        last_seen: '2026-01-02T00:00:00Z',
      },
    ]);
  });

  it('coerces numeric strings for signal and temperature', () => {
    const [row] = normalizeDeviceStatusWsPayload({
      devices: [{ id: 'd', signal_strength: '-65', temperature: '22' }],
    });
    expect(row.signal_strength).toBe(-65);
    expect(row.temperature).toBe(22);
  });

  it('returns [] when devices array is missing', () => {
    expect(normalizeDeviceStatusWsPayload({})).toEqual([]);
    expect(normalizeDeviceStatusWsPayload({ updates: [{ device_id: 'a' }] })).toEqual([]);
  });
});
