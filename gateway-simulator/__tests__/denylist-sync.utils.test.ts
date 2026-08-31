import { describe, expect, it } from 'vitest';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { applyOperationalDenylistSync } from '../src/main/devices/denylist-sync.utils';

describe('denylist-sync.utils', () => {
  it('replaces local denylist from inventory sync rows', () => {
    const registry = new DeviceRegistry();
    registry.setCreateContext({ facilityId: 'fac-1' });
    registry.addDefault('lock', 'abc');

    const applied = applyOperationalDenylistSync(registry, [{
      cloud_device_id: 'cloud-lock-1',
      kind: 'lock',
      serial: registry.list()[0]!.lock_id!,
      denylist: [{ sub: 'tenant-1', exp: 9999999999 }],
    }]);

    expect(applied).toBe(1);
    const lock = registry.list()[0] as import('@protocol/device-kinds').LockInventoryItem;
    expect(lock.cloud_device_id).toBe('cloud-lock-1');
    const key = `lock:${lock.lock_id}`;
    expect(registry.getSimState(key)?.denylist).toEqual(
      expect.arrayContaining([expect.objectContaining({ sub: 'tenant-1', exp: 9999999999 })]),
    );
  });

  it('matches operational sync rows by cloud_device_id', () => {
    const registry = new DeviceRegistry();
    registry.setCreateContext({ facilityId: 'fac-1' });
    registry.addDefault('access_control', 'gate');
    const ac = registry.list()[0] as import('@protocol/device-kinds').AccessControlInventoryItem;
    const key = `access_control:${ac.access_id}:${ac.relay_channel ?? 1}`;
    registry.update(key, { cloud_device_id: 'cloud-ac-1' });

    const applied = applyOperationalDenylistSync(registry, [{
      cloud_device_id: 'cloud-ac-1',
      kind: 'access_control',
      serial: 'wrong-serial',
      relay_channel: 99,
      denylist: [{ sub: 'tenant-2', exp: 1234 }],
    }]);

    expect(applied).toBe(1);
    expect(registry.getSimState(key)?.denylist).toHaveLength(1);
  });
});
