import { describe, expect, it } from 'vitest';
import { DeviceFactory, DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { deviceKey } from '../src/main/devices/IDeviceModel';

describe('DeviceRegistry', () => {
  it('adds default devices for addable kinds', () => {
    const registry = new DeviceRegistry();
    const kinds = ['lock', 'access_control', 'bridge', 'friend_node'] as const;
    for (const kind of kinds) {
      registry.addDefault(kind, 'test');
    }
    expect(registry.list()).toHaveLength(4);
  });

  it('rejects gateway kind via addDefault', () => {
    const registry = new DeviceRegistry();
    expect(() => registry.addDefault('gateway', 'gw')).toThrow(/cannot be added/i);
  });

  it('updates lock state via applyCommand', () => {
    const registry = new DeviceRegistry();
    registry.addDefault('lock', 'abc');
    const lock = registry.list()[0];
    const key = deviceKey(lock);
    registry.applyCommandToDevice((lock as import('@protocol/device-kinds').LockInventoryItem).lock_id, {
      cmd_type: 'UNLOCK',
      device_id: (lock as import('@protocol/device-kinds').LockInventoryItem).lock_id,
    });
    const updated = registry.get(key)!;
    expect(updated.toInventoryItem()).toMatchObject({ locked: false, state: 'OPENED' });
  });

  it('clears all devices', () => {
    const registry = new DeviceRegistry();
    registry.addDefault('lock', '1');
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });

  it('updateGatewaySelfSerial patches legacy gateway kind row', () => {
    const registry = new DeviceRegistry();
    registry.add(DeviceFactory.create({
      kind: 'gateway',
      serial: 'gw-old',
      state: 'healthy',
      last_seen: new Date().toISOString(),
    }));
    registry.addDefault('lock', '1');
    expect(registry.updateGatewaySelfSerial('HW-999')).toBe(true);
    const gw = registry.list().find((d) => d.kind === 'gateway') as { serial: string };
    expect(gw.serial).toBe('HW-999');
  });

  it('load strips gateway rows from persisted inventory', () => {
    const registry = new DeviceRegistry();
    registry.loadInventory([
      { kind: 'gateway', serial: 'gw-old', state: 'healthy', last_seen: new Date().toISOString() },
      { kind: 'lock', lock_id: 'L1', locked: true, online: true, last_seen: new Date().toISOString() },
    ]);
    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]?.kind).toBe('lock');
  });
});
