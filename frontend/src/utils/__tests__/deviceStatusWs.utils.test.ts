import {
  mergeUnitRowsFromDeviceSnapshots,
  normalizeDeviceStatusWsPayload,
  shouldRefreshDeviceListForPayload,
} from '@/utils/deviceStatusWs.utils';

describe('shouldRefreshDeviceListForPayload', () => {
  const ids = new Set(['a', 'b']);

  it('returns true when relevantIds is empty (initial / unknown)', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, new Set())).toBe(true);
  });

  it('matches updatedDeviceId only when in relevantIds', () => {
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'a' }, ids)).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ updatedDeviceId: 'z' }, ids)).toBe(false);
  });

  it('matches devices array when any id is in relevantIds', () => {
    expect(
      shouldRefreshDeviceListForPayload({ devices: [{ id: 'b' }, { id: 'z' }] }, ids)
    ).toBe(true);
    expect(shouldRefreshDeviceListForPayload({ devices: [{ id: 'z' }] }, ids)).toBe(false);
  });

  it('unwraps WS envelopes before matching device ids', () => {
    expect(
      shouldRefreshDeviceListForPayload(
        { type: 'device_status_update', data: { devices: [{ id: 'a' }] } },
        ids,
      ),
    ).toBe(true);
    expect(
      shouldRefreshDeviceListForPayload(
        { type: 'device_status_update', data: { devices: [{ id: 'z' }] } },
        ids,
      ),
    ).toBe(false);
  });

  it('refreshes on units_update coarse signal', () => {
    expect(shouldRefreshDeviceListForPayload({ source: 'units_update' }, ids)).toBe(true);
  });

  it('returns false when payload has no id hints and relevantIds is populated', () => {
    expect(shouldRefreshDeviceListForPayload({}, ids)).toBe(false);
  });
});

describe('mergeUnitRowsFromDeviceSnapshots', () => {
  const units = [
    {
      id: 'unit-1',
      lock_status: 'locked',
      device_status: 'online',
      battery_level: 80,
      signal_strength: -50,
      blulok_device: {
        id: 'dev-1',
        lock_status: 'locked',
        device_status: 'online',
        battery_level: 80,
        signal_strength: -50,
      },
    },
  ];

  it('returns same reference when snapshots do not match', () => {
    const result = mergeUnitRowsFromDeviceSnapshots(units, [
      { device_id: 'other', lock_status: 'unlocked' },
    ]);
    expect(result).toBe(units);
  });

  it('patches lock and telemetry on matching blulok device id', () => {
    const result = mergeUnitRowsFromDeviceSnapshots(units, [
      {
        device_id: 'dev-1',
        lock_status: 'unlocked',
        battery_level: 55,
        signal_strength: -70,
        last_seen: '2026-07-22T16:00:00Z',
      },
    ]);
    expect(result).not.toBe(units);
    expect(result[0].lock_status).toBe('unlocked');
    expect(result[0].battery_level).toBe(55);
    expect(result[0].blulok_device?.lock_status).toBe('unlocked');
    expect(result[0].blulok_device?.battery_level).toBe(55);
    expect(result[0].blulok_device?.last_seen).toBe('2026-07-22T16:00:00Z');
  });

  it('matches by unit_id when blulok_device id is absent', () => {
    const bare = [
      {
        id: 'unit-1',
        lock_status: 'locked' as const,
        device_status: 'online' as const,
        blulok_device: null,
      },
    ];
    const result = mergeUnitRowsFromDeviceSnapshots(bare, [
      { unit_id: 'unit-1', lock_status: 'unlocked', battery_level: 40 },
    ]);
    expect(result[0].lock_status).toBe('unlocked');
    expect(result[0].battery_level).toBe(40);
    expect(result[0].blulok_device).toBeNull();
  });

  it('returns same reference when snapshot values are unchanged', () => {
    const result = mergeUnitRowsFromDeviceSnapshots(units, [
      {
        device_id: 'dev-1',
        lock_status: 'locked',
        device_status: 'online',
        battery_level: 80,
        signal_strength: -50,
      },
    ]);
    expect(result).toBe(units);
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
            name: 'Front lock',
            location_description: 'North door',
            device_settings: { displayName: 'Front lock', lockNumber: 12 },
          },
        ],
      })
    ).toEqual([
      {
        device_id: 'dev-1',
        unit_id: 'u1',
        name: 'Front lock',
        location_description: 'North door',
        device_settings: { displayName: 'Front lock', lockNumber: 12 },
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

  it('unwraps full device_status_update WS envelopes', () => {
    const [row] = normalizeDeviceStatusWsPayload({
      type: 'device_status_update',
      data: {
        devices: [{ id: 'dev-9', lock_status: 'unlocked', last_seen: '2026-07-22T16:00:00Z' }],
      },
    });
    expect(row).toEqual(
      expect.objectContaining({
        device_id: 'dev-9',
        lock_status: 'unlocked',
        last_seen: '2026-07-22T16:00:00Z',
      }),
    );
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
