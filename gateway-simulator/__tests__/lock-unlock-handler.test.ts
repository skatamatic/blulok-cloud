import { describe, expect, it, vi } from 'vitest';
import { LockUnlockHandler } from '../src/main/commands/handlers';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';

describe('LockUnlockHandler edge cases', () => {
  it('ignores expired commands', async () => {
    const registry = new DeviceRegistry();
    registry.addDefault('lock', 'abc');
    const lock = registry.list()[0] as import('@protocol/device-kinds').LockInventoryItem;
    const stateSync = vi.fn();
    const notifications: string[] = [];

    await new LockUnlockHandler().handle(
      { cmd_type: 'UNLOCK', device_id: lock.lock_id, expires_at: 1 },
      {
        transport: { send: vi.fn(), isConnected: () => true, connect: async () => undefined, disconnect: () => undefined, onMessage: () => undefined, onClose: () => undefined, onOpen: () => undefined },
        proxy: { request: vi.fn(), inventorySync: vi.fn(), stateSync, addLog: vi.fn(), attach: () => undefined, dispose: () => undefined },
        registry,
        behavior: DEFAULT_BEHAVIOR,
        facilityId: 'fac-1',
        onNotify: (e) => notifications.push(e.summary),
      },
    );

    expect(stateSync).not.toHaveBeenCalled();
    expect(notifications.some((n) => n.includes('expired'))).toBe(true);
  });
});
