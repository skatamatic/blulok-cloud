import { describe, expect, it } from 'vitest';
import {
  applyInventorySnapshotBinary,
  mapSnapshotToInventoryItems,
} from '../src/main/inventory/inventory-snapshot-applier';
import {
  buildDenylistByKeyFromSnapshot,
  countDenylistEntriesInMap,
} from '../src/main/devices/denylist-sync.utils';

describe('inventory-snapshot-applier', () => {
  it('applies properties.online from snapshot rows', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [
          {
            kind: 'lock',
            lock_id: 'L-ON',
            properties: { online: true },
          },
          {
            kind: 'lock',
            lock_id: 'L-OFF',
            properties: { online: false },
          },
          {
            kind: 'access_control',
            access_id: 'AC-1',
            properties: { online: true },
          },
        ],
      },
      [],
    );

    expect(mapped.find((row) => row.item.kind === 'lock' && row.item.lock_id === 'L-ON')?.item).toMatchObject({
      online: true,
    });
    expect(mapped.find((row) => row.item.kind === 'lock' && row.item.lock_id === 'L-OFF')?.item).toMatchObject({
      online: false,
    });
    expect(mapped.find((row) => row.item.kind === 'access_control')?.item).toMatchObject({ online: true });
  });

  it('defaults online to false when snapshot properties omit online', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [{ kind: 'lock', lock_id: 'L-001' }],
      },
      [],
    );

    expect(mapped[0]?.item).toMatchObject({ kind: 'lock', online: false });
  });

  it('maps cloud snapshot devices to simulator inventory items', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [
          {
            kind: 'lock',
            lock_id: 'L-001',
            lock_number: 3,
            state: 'CLOSED',
            firmware_version: '2.0.0',
          },
          {
            kind: 'bridge',
            serial: 'BR-001',
            state: 'healthy',
          },
        ],
      },
      [],
    );

    expect(mapped).toHaveLength(2);
    expect(mapped[0]?.item).toMatchObject({ kind: 'lock', lock_id: 'L-001', lock_number: 3 });
    expect(mapped[0]?.item).not.toHaveProperty('cloud_device_id');
    expect(mapped[1]?.item).toMatchObject({ kind: 'bridge', serial: 'BR-001' });
  });

  it('uses lock_id and access_id from snapshot rows', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [
          {
            kind: 'lock',
            lock_id: 'A-001',
            lock_number: 5,
          },
          {
            kind: 'access_control',
            access_id: 'AC-001',
            relay_channel: 2,
          },
        ],
      },
      [],
    );

    expect(mapped).toHaveLength(2);
    expect(mapped.find((row) => row.item.kind === 'lock')?.item).toMatchObject({
      lock_id: 'A-001',
      lock_number: 5,
    });
    expect(mapped.find((row) => row.item.kind === 'access_control')?.item).toMatchObject({
      access_id: 'AC-001',
      relay_channel: 2,
    });
  });

  it('carries denylist rows from snapshot onto mapped devices', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [
          {
            kind: 'lock',
            lock_id: 'A-001',
            denylist: [{ sub: 'tenant-1', exp: 9999999999 }],
          },
        ],
      },
      [],
    );

    expect(mapped[0]?.denylist).toEqual([{ sub: 'tenant-1', exp: 9999999999 }]);
    const denylistByKey = buildDenylistByKeyFromSnapshot(mapped);
    expect(countDenylistEntriesInMap(denylistByKey)).toBe(1);
  });

  it('returns undefined denylist map when snapshot rows omit denylist', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [{ kind: 'lock', lock_id: 'L-001' }],
      },
      [],
    );

    expect(buildDenylistByKeyFromSnapshot(mapped)).toBeUndefined();
  });

  it('ignores gateway rows in cloud snapshot payloads', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [
          { kind: 'gateway', serial: 'gw-new', state: 'healthy' } as never,
          { kind: 'lock', lock_id: 'L-001' },
        ],
      },
      [],
    );

    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.item.kind).toBe('lock');
  });

  it('does not synthesize a gateway self device when snapshot omits gateway rows', () => {
    const mapped = mapSnapshotToInventoryItems(
      {
        facility_id: 'fac-1',
        gateway_id: 'gw-new',
        devices: [],
      },
      [{ kind: 'gateway', serial: 'gw-old', firmware_version: '9.9.9' }],
    );

    expect(mapped).toHaveLength(0);
  });

  it('parses binary snapshot payloads', () => {
    const json = JSON.stringify({
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      devices: [{ kind: 'lock', lock_id: 'L1' }],
    });
    const { mapped } = applyInventorySnapshotBinary(Buffer.from(json, 'utf8'), []);
    expect(mapped.some((row) => row.item.kind === 'lock')).toBe(true);
  });
});
