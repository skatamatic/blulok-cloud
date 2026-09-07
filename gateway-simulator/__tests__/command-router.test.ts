import { describe, expect, it, vi } from 'vitest';
import { CommandRouter } from '../src/main/commands/CommandRouter';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { FirmwareReceiver } from '../src/main/firmware/FirmwareReceiver';
import { InventorySnapshotReceiver } from '../src/main/inventory/InventorySnapshotReceiver';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';
import { deviceKey } from '../src/main/devices/IDeviceModel';
import type { LockInventoryItem } from '../src/protocol/device-kinds';

function makeCommandJwt(payload: Record<string, unknown>): { type: 'COMMAND'; jwt: string } {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { type: 'COMMAND', jwt: `${header}.${body}.` };
}

describe('CommandRouter', () => {
  function buildCtx(opts?: { lockUnlockMode?: typeof DEFAULT_BEHAVIOR.lockUnlockMode }) {
    const sent: unknown[] = [];
    const notifications: string[] = [];
    const transport = {
      send: (msg: unknown) => sent.push(msg),
      isConnected: () => true,
      connect: async () => undefined,
      disconnect: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onOpen: () => undefined,
    };
    const stateSync = vi.fn().mockResolvedValue({ type: 'PROXY_RESPONSE', id: '1', status: 200, body: {} });
    const proxy = {
      request: vi.fn(),
      inventorySync: vi.fn(),
      stateSync,
      addLog: vi.fn(),
      attach: () => undefined,
      dispose: () => undefined,
    };
    const registry = new DeviceRegistry();
    registry.addDefault('lock', 'abc');
    const lock = registry.list()[0] as LockInventoryItem;
    const router = new CommandRouter(new FirmwareReceiver(), new InventorySnapshotReceiver());
    const behavior = { ...DEFAULT_BEHAVIOR, ...(opts?.lockUnlockMode ? { lockUnlockMode: opts.lockUnlockMode } : {}) };

    return {
      sent,
      notifications,
      stateSync,
      registry,
      router,
      lock,
      ctx: {
        transport: transport as never,
        proxy: proxy as never,
        registry,
        behavior,
        facilityId: 'fac-1',
        onNotify: (event: { summary: string }) => notifications.push(event.summary),
        onDevicesChanged: vi.fn(),
        onPersist: vi.fn(),
      },
    };
  }

  it('auto-ACKs ACCESS_CODE_UPDATE when mode is accept', async () => {
    const { sent, router, ctx } = buildCtx();
    await router.route(
      makeCommandJwt({
        cmd_type: 'ACCESS_CODE_UPDATE',
        nonce: 'nonce-1',
        facility_id: 'fac-1',
        codes: [],
      }),
      ctx,
    );

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ACCESS_CODE_UPDATE_ACK', nonce: 'nonce-1', accepted: true }),
      ]),
    );
  });

  it('applies UNLOCK and state-syncs when lockUnlockMode is accept', async () => {
    const { router, ctx, lock, stateSync, registry, notifications } = buildCtx({ lockUnlockMode: 'accept' });
    const key = deviceKey(lock);

    await router.route(
      makeCommandJwt({
        cmd_type: 'UNLOCK',
        device_id: lock.lock_id,
        expires_at: Math.floor(Date.now() / 1000) + 120,
      }),
      ctx,
    );

    const updated = registry.get(key)!.toInventoryItem() as LockInventoryItem;
    expect(updated.locked).toBe(false);
    expect(updated.state).toBe('OPENED');
    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(notifications.some((n) => n.includes('Applied UNLOCK'))).toBe(true);
  });

  it('applies LOCK locally without state sync when lockUnlockMode is apply-only', async () => {
    const { router, ctx, lock, stateSync, registry } = buildCtx({ lockUnlockMode: 'apply-only' });
    const key = deviceKey(lock);

    await router.route(
      makeCommandJwt({
        cmd_type: 'LOCK',
        device_id: lock.lock_id.toLowerCase(),
        expires_at: 0,
      }),
      ctx,
    );

    const updated = registry.get(key)!.toInventoryItem() as LockInventoryItem;
    expect(updated.locked).toBe(true);
    expect(stateSync).not.toHaveBeenCalled();
  });

  it('ignores LOCK when lockUnlockMode is ignore', async () => {
    const { router, ctx, lock, stateSync, registry } = buildCtx({ lockUnlockMode: 'ignore' });
    const key = deviceKey(lock);

    await router.route(
      makeCommandJwt({
        cmd_type: 'LOCK',
        device_id: lock.lock_id,
        expires_at: 0,
      }),
      ctx,
    );

    const updated = registry.get(key)!.toInventoryItem() as LockInventoryItem;
    expect(updated.locked).toBe(true);
    expect(stateSync).not.toHaveBeenCalled();
  });
});
