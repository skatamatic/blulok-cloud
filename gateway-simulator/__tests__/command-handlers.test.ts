import { describe, expect, it, vi } from 'vitest';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';
import {
  AccessCodeHandler,
  DenylistHandler,
  DeviceDeletedHandler,
  RotateOperationsKeyHandler,
} from '../src/main/commands/handlers';
import type { CommandContext } from '../src/main/commands/ICommandHandler';

function buildCtx(overrides?: Partial<typeof DEFAULT_BEHAVIOR>) {
  const sent: unknown[] = [];
  const registry = new DeviceRegistry();
  registry.setCreateContext({ facilityId: 'fac-1' });
  registry.addDefault('lock', 'abc');
  registry.addDefault('access_control', 'ac1');
  registry.addDefault('bridge', 'br1');
  const onPersist = vi.fn();
  const onDevicesChanged = vi.fn();
  const ctx: CommandContext = {
    transport: {
      send: (msg) => sent.push(msg),
      isConnected: () => true,
      connect: async () => undefined,
      disconnect: () => undefined,
      onMessage: () => undefined,
      onClose: () => undefined,
      onOpen: () => undefined,
    },
    proxy: {
      request: vi.fn(),
      inventorySync: vi.fn(),
      stateSync: vi.fn().mockResolvedValue({ type: 'PROXY_RESPONSE', id: '1', status: 200, body: {} }),
      addLog: vi.fn(),
      attach: () => undefined,
      dispose: () => undefined,
    },
    registry,
    behavior: { ...DEFAULT_BEHAVIOR, ...overrides },
    facilityId: 'fac-1',
    onPersist,
    onDevicesChanged,
    onNotify: vi.fn(),
  };
  return { ctx, sent, registry, onPersist, onDevicesChanged };
}

describe('AccessCodeHandler', () => {
  it('ACKs when mode is accept', async () => {
    const { ctx, sent } = buildCtx({ accessCodeAckMode: 'accept' });
    await new AccessCodeHandler().handle({ cmd_type: 'ACCESS_CODE_UPDATE', nonce: 'n-1', codes: [] }, ctx);
    expect(sent).toEqual([expect.objectContaining({ type: 'ACCESS_CODE_UPDATE_ACK', nonce: 'n-1', accepted: true })]);
  });

  it('stores access codes on matching access_control device', async () => {
    const { ctx, registry, onPersist } = buildCtx({ accessCodeAckMode: 'accept' });
    const ac = registry.list().find((d) => d.kind === 'access_control')!;
    await new AccessCodeHandler().handle({
      cmd_type: 'ACCESS_CODE_UPDATE',
      nonce: 'n-codes',
      facility_id: 'fac-1',
      codes: [{
        device_id: ac.access_id!,
        access_id: ac.access_id!,
        relay_channel: ac.relay_channel ?? 1,
        valid_codes: [{ code: '4321', valid_until: '2099-01-01T00:00:00Z' }],
      }],
    }, ctx);
    const key = `access_control:${ac.access_id}:${ac.relay_channel ?? 1}`;
    expect(registry.getSimState(key)?.accessCodes).toHaveLength(1);
    expect(onPersist).toHaveBeenCalled();
  });

  it('rejects when mode is reject', async () => {
    const { ctx, sent } = buildCtx({ accessCodeAckMode: 'reject' });
    await new AccessCodeHandler().handle({ cmd_type: 'ACCESS_CODE_UPDATE', nonce: 'n-2', codes: [] }, ctx);
    expect(sent[0]).toMatchObject({ accepted: false });
  });

  it('ignores when mode is ignore', async () => {
    const { ctx, sent } = buildCtx({ accessCodeAckMode: 'ignore' });
    await new AccessCodeHandler().handle({ cmd_type: 'ACCESS_CODE_UPDATE', nonce: 'n-3', codes: [] }, ctx);
    expect(sent).toHaveLength(0);
  });
});

describe('DenylistHandler', () => {
  it('adds and removes denylist entries on target devices', async () => {
    const { ctx, registry, onPersist } = buildCtx();
    const lock = registry.list().find((d) => d.kind === 'lock')!;
    const lockKey = `lock:${(lock as import('@protocol/device-kinds').LockInventoryItem).lock_id}`;

    await new DenylistHandler().handle({
      cmd_type: 'DENYLIST_ADD',
      denylist_add: [{ sub: 'tenant-1', exp: 9999999999 }],
      target: [(lock as import('@protocol/device-kinds').LockInventoryItem).lock_id],
    }, ctx);
    expect(registry.getSimState(lockKey)?.denylist).toHaveLength(1);

    await new DenylistHandler().handle({
      cmd_type: 'DENYLIST_REMOVE',
      denylist_remove: [{ sub: 'tenant-1' }],
      target: [(lock as import('@protocol/device-kinds').LockInventoryItem).lock_id],
    }, ctx);
    expect(registry.getSimState(lockKey)?.denylist).toHaveLength(0);
    expect(onPersist).toHaveBeenCalled();
  });

  it('matches cloud device UUID targets from JWT commands', async () => {
    const { ctx, registry, onPersist } = buildCtx();
    const lock = registry.list().find((d) => d.kind === 'lock')!;
    const lockItem = lock as import('@protocol/device-kinds').LockInventoryItem;
    const lockKey = `lock:${lockItem.lock_id}`;
    registry.update(lockKey, { cloud_device_id: 'cloud-uuid-lock-1' });

    await new DenylistHandler().handle({
      cmd_type: 'DENYLIST_ADD',
      denylist_add: [{ sub: 'tenant-cloud', exp: 9999999999 }],
      target: ['cloud-uuid-lock-1'],
    }, ctx);

    expect(registry.getSimState(lockKey)?.denylist).toEqual(
      expect.arrayContaining([expect.objectContaining({ sub: 'tenant-cloud' })]),
    );
    expect(onPersist).toHaveBeenCalled();
  });
});

describe('RotateOperationsKeyHandler', () => {
  it('rotates operations key on all devices', async () => {
    const { ctx, registry, onPersist } = buildCtx();
    let rotated = false;
    ctx.applyOperationsKeyRotation = (key) => {
      rotated = true;
      registry.forEachSimState((_k, sim) => {
        sim.operationsKeyPublicB64 = key;
      });
    };
    await new RotateOperationsKeyHandler().handle({
      cmd_type: 'ROTATE_OPERATIONS_KEY',
      new_ops_pubkey: 'rotated-key',
      ts: 1_700_000_000,
    }, ctx);
    expect(rotated).toBe(true);
    expect(onPersist).toHaveBeenCalled();
  });
});

describe('DeviceDeletedHandler', () => {
  it('removes lock and ACKs when accepted', async () => {
    const { ctx, sent, registry, onPersist, onDevicesChanged } = buildCtx({ deviceDeletionAckMode: 'accept' });
    const lock = registry.list().find((d) => d.kind === 'lock')!;
    await new DeviceDeletedHandler().handle(
      {
        cmd_type: 'DEVICE_DELETED',
        nonce: 'del-1',
        device_kind: 'lock',
        lock_id: (lock as import('@protocol/device-kinds').LockInventoryItem).lock_id,
      },
      ctx,
    );
    expect(registry.list().some((d) => d.kind === 'lock')).toBe(false);
    expect(onPersist).toHaveBeenCalled();
    expect(onDevicesChanged).toHaveBeenCalled();
    expect(sent[0]).toMatchObject({ type: 'DEVICE_DELETED_ACK', success: true });
  });

  it('removes lock by cloud serial after recovery snapshot applied lock_id', async () => {
    const { ctx, registry, onDevicesChanged } = buildCtx({ deviceDeletionAckMode: 'accept' });
    registry.clear();
    registry.loadInventorySnapshot([
      {
        kind: 'lock',
        lock_id: 'A-001',
        lock_number: 1,
        state: 'CLOSED',
        locked: true,
        online: true,
      },
    ]);
    await new DeviceDeletedHandler().handle({
      cmd_type: 'DEVICE_DELETED',
      nonce: 'del-serial',
      device_kind: 'lock',
      lock_id: 'A-001',
    }, ctx);
    expect(registry.list()).toHaveLength(0);
    expect(onDevicesChanged).toHaveBeenCalled();
  });

  it('removes bridge by serial when accepted', async () => {
    const { ctx, registry } = buildCtx({ deviceDeletionAckMode: 'accept' });
    const bridge = registry.list().find((d) => d.kind === 'bridge')! as import('@protocol/device-kinds').BridgeInventoryItem;
    await new DeviceDeletedHandler().handle(
      { cmd_type: 'DEVICE_DELETED', nonce: 'del-2', device_kind: 'bridge', serial: bridge.serial },
      ctx,
    );
    expect(registry.list().some((d) => d.kind === 'bridge')).toBe(false);
  });

  it('holds without ACK when mode is hold', async () => {
    const { ctx, sent } = buildCtx({ deviceDeletionAckMode: 'hold' });
    await new DeviceDeletedHandler().handle(
      { cmd_type: 'DEVICE_DELETED', nonce: 'del-3', device_kind: 'lock', lock_id: 'missing' },
      ctx,
    );
    expect(sent).toHaveLength(0);
  });
});
