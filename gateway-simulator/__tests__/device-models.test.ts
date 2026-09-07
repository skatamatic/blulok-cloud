import { describe, expect, it } from 'vitest';
import { DeviceFactory, DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import type { GatewayInventoryKind } from '../src/protocol/device-kinds';

const ADDABLE_KINDS: GatewayInventoryKind[] = ['lock', 'access_control', 'bridge', 'friend_node'];

describe('device model surface', () => {
  for (const kind of ADDABLE_KINDS) {
    it(`${kind} model exposes inventory + clone`, () => {
      const model = DeviceFactory.createDefaultModel(kind, 'test');
      expect(model.kind).toBe(kind);
      expect(model.id).toBeTruthy();
      const item = model.toInventoryItem();
      expect(item.kind).toBe(kind);
      expect(item.last_seen).toMatch(/^\d{4}-/);
      expect(model.toStateUpdate()).toMatchObject({ kind: item.kind });
      const cloned = model.clone();
      expect(cloned.toInventoryItem()).toMatchObject(
        kind === 'lock'
          ? { lock_id: (item as { lock_id: string }).lock_id }
          : kind === 'access_control'
            ? { access_id: (item as { access_id: string }).access_id }
            : { serial: (item as { serial: string }).serial },
      );
      model.applyFirmware('9.9.9');
      expect(model.toInventoryItem().firmware_version).toBe('9.9.9');
    });
  }

  it('gateway model still exists for legacy rows via create()', () => {
    const model = DeviceFactory.create({
      kind: 'gateway',
      serial: 'GW-1',
      state: 'healthy',
      last_seen: new Date().toISOString(),
    });
    model.applyFirmware('9.9.9');
    expect(model.toInventoryItem()).toMatchObject({ kind: 'gateway', firmware_version: '9.9.9' });
  });
});

describe('LockDevice cloud sync payloads', () => {
  it('toStateUpdate omits simulator-only fields', () => {
    const model = DeviceFactory.create({
      kind: 'lock',
      lock_id: 'L-1',
      lock_number: 2,
      state: 'CLOSED',
      locked: true,
      battery_level: 3400,
      battery_unit: 'mV',
      signal_strength: -55,
      firmware_version: '2.1.0',
      cloud_device_id: 'cloud-uuid',
      online: true,
      last_seen: new Date().toISOString(),
    });

    const state = model.toStateUpdate();
    expect(state).toMatchObject({
      kind: 'lock',
      lock_id: 'L-1',
      lock_number: 2,
      state: 'CLOSED',
      locked: true,
      online: true,
      battery_level: 3400,
      signal_strength: -55,
      firmware_version: '2.1.0',
    });
    expect(state).not.toHaveProperty('cloud_device_id');
  });

  it('toInventorySyncItem omits cloud binding fields', () => {
    const model = DeviceFactory.create({
      kind: 'lock',
      lock_id: 'L-2',
      cloud_device_id: 'cloud-uuid',
      error_code: 'E1',
      error_message: 'jam',
      online: true,
      locked: true,
      last_seen: new Date().toISOString(),
    });

    const sync = model.toInventorySyncItem();
    expect(sync).toMatchObject({ kind: 'lock', lock_id: 'L-2', online: true });
    expect(sync).not.toHaveProperty('cloud_device_id');
    expect(sync).not.toHaveProperty('error_code');
    expect(sync).not.toHaveProperty('error_message');
  });
});

describe('AccessControlDevice commands', () => {
  it('applyCommand toggles lock state', () => {
    const model = DeviceFactory.createDefaultModel('access_control', 'ac');
    expect(model.applyCommand({ cmd_type: 'LOCK' })).toBe(true);
    expect(model.toInventoryItem().locked).toBe(true);
    expect(model.applyCommand({ cmd_type: 'UNLOCK' })).toBe(true);
    expect(model.toInventoryItem().locked).toBe(false);
  });

  it('toStateUpdate sends only cloud state fields', () => {
    const model = DeviceFactory.createDefaultModel('access_control', 'ac');
    model.applyFirmware('2.1.0');
    const item = model.toInventoryItem();
    expect(item.firmware_version).toBe('2.1.0');

    const state = model.toStateUpdate();
    expect(state).toEqual({
      kind: 'access_control',
      access_id: item.access_id,
      relay_channel: item.relay_channel ?? 1,
      online: item.online,
      locked: item.locked,
      last_seen: expect.stringMatching(/^\d{4}-/),
    });
    expect(state).not.toHaveProperty('firmware_version');
    expect(state).not.toHaveProperty('cloud_device_id');
  });

  it('toInventorySyncItem omits simulator-only fields', () => {
    const model = DeviceFactory.create({
      kind: 'access_control',
      access_id: 'AC-1',
      relay_channel: 1,
      device_type: 'gate',
      locked: true,
      firmware_version: '2.1.0',
      state: 'OPENED',
      cloud_device_id: 'cloud-uuid',
      error_code: 'E1',
      online: true,
      last_seen: new Date().toISOString(),
    });

    const sync = model.toInventorySyncItem();
    expect(sync).toMatchObject({
      kind: 'access_control',
      access_id: 'AC-1',
      relay_channel: 1,
      device_type: 'gate',
      online: true,
      locked: true,
    });
    expect(sync).not.toHaveProperty('firmware_version');
    expect(sync).not.toHaveProperty('cloud_device_id');
    expect(sync).not.toHaveProperty('state');
    expect(sync).not.toHaveProperty('error_code');
  });
});

describe('DeviceRegistry firmware targeting', () => {
  it('applyFirmware targets device kinds', () => {
    const registry = new DeviceRegistry();
    registry.addDefault('lock', '1');
    registry.addDefault('bridge', 'br1');
    registry.addDefault('friend_node', 'fn1');
    registry.add(DeviceFactory.create({
      kind: 'gateway',
      serial: 'gw-self',
      state: 'healthy',
      last_seen: new Date().toISOString(),
    }));
    registry.applyFirmware('gateway', '2.0.0');
    const lockItem = registry.list().find((d) => d.kind === 'lock') as { lock_id: string };
    registry.applyFirmware('lock', '3.0.0', lockItem.lock_id);
    registry.applyFirmware('bridge', '4.0.0');
    registry.applyFirmware('friend_node', '5.0.0');
    const items = registry.list();
    expect(items.find((d) => d.kind === 'gateway')?.firmware_version).toBe('2.0.0');
    expect(items.find((d) => d.kind === 'lock')?.firmware_version).toBe('3.0.0');
    expect(items.find((d) => d.kind === 'bridge')?.firmware_version).toBe('4.0.0');
    expect(items.find((d) => d.kind === 'friend_node')?.firmware_version).toBe('5.0.0');
  });
});
