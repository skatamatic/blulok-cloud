import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { InventorySnapshotReceiver } from '../src/main/inventory/InventorySnapshotReceiver';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';

describe('InventorySnapshotReceiver', () => {
  it('ACKs chunks and reports success when snapshot is complete', async () => {
    const sent: unknown[] = [];
    const transport = {
      send: (msg: unknown) => sent.push(msg),
    };
    const registry = new DeviceRegistry();
    const receiver = new InventorySnapshotReceiver();
    const ctx = {
      transport: transport as never,
      proxy: { stateSync: vi.fn() } as never,
      registry,
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
      onNotify: vi.fn(),
      onPersist: vi.fn(),
      onDevicesChanged: vi.fn(),
    };

    const snapshotJson = JSON.stringify({
      schema_version: 2,
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      generated_at: new Date().toISOString(),
      devices: [],
    });
    const binary = Buffer.from(snapshotJson, 'utf8');
    const sha256 = createHash('sha256').update(binary).digest('hex');

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST',
        recovery_id: 'rec-1',
        snapshot_id: 'snap-1',
        sha256,
        size_bytes: binary.length,
        device_count: 0,
        chunk_count: 1,
        chunk_size: binary.length,
        nonce: 'nonce-inv',
      },
      ctx,
    );

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_CHUNK',
        nonce: 'nonce-inv',
        chunk_index: 0,
        chunk_sha256: sha256,
        data: binary.toString('base64'),
      },
      ctx,
    );

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'INVENTORY_SNAPSHOT_CHUNK_ACK', chunkIndex: 0, status: 'ok' }),
        expect.objectContaining({
          type: 'INVENTORY_SNAPSHOT_STATUS',
          recovery_id: 'rec-1',
          snapshot_id: 'snap-1',
          status: 'success',
        }),
      ]),
    );
    expect(ctx.onPersist).toHaveBeenCalled();
    expect(ctx.onDevicesChanged).toHaveBeenCalled();
    expect(registry.list()).toHaveLength(0);
  });

  it('loads lock devices from snapshot into the registry', async () => {
    const sent: unknown[] = [];
    const transport = { send: (msg: unknown) => sent.push(msg) };
    const registry = new DeviceRegistry();
    const receiver = new InventorySnapshotReceiver();
    const stateSync = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      transport: transport as never,
      proxy: { stateSync } as never,
      registry,
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
      onNotify: vi.fn(),
      onPersist: vi.fn(),
      onDevicesChanged: vi.fn(),
    };

    const snapshotJson = JSON.stringify({
      schema_version: 2,
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      generated_at: new Date().toISOString(),
      devices: [
        {
          kind: 'lock',
          lock_id: 'L-001',
          lock_number: 12,
          state: 'CLOSED',
          firmware_version: '2.1.0',
        },
        {
          kind: 'access_control',
          access_id: 'AC-001',
          relay_channel: 2,
          firmware_version: '1.4.0',
        },
      ],
    });
    const binary = Buffer.from(snapshotJson, 'utf8');
    const sha256 = createHash('sha256').update(binary).digest('hex');

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST',
        recovery_id: 'rec-1',
        snapshot_id: 'snap-1',
        sha256,
        size_bytes: binary.length,
        device_count: 2,
        chunk_count: 1,
        chunk_size: binary.length,
        nonce: 'nonce-inv-2',
      },
      ctx,
    );

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_CHUNK',
        nonce: 'nonce-inv-2',
        chunk_index: 0,
        chunk_sha256: sha256,
        data: binary.toString('base64'),
      },
      ctx,
    );

    const devices = registry.list();
    expect(devices).toHaveLength(2);
    expect(devices.find((d) => d.kind === 'gateway')).toBeUndefined();
    expect(devices.find((d) => d.kind === 'lock')).toMatchObject({
      kind: 'lock',
      lock_id: 'L-001',
      lock_number: 12,
      firmware_version: '2.1.0',
    });
    expect(devices.find((d) => d.kind === 'access_control')).toMatchObject({
      kind: 'access_control',
      access_id: 'AC-001',
      relay_channel: 2,
      firmware_version: '1.4.0',
    });
    expect(stateSync).toHaveBeenCalled();
  });

  it('applies cloud denylist rows from recovery snapshot onto device sim state', async () => {
    const transport = { send: vi.fn() };
    const registry = new DeviceRegistry();
    registry.setCreateContext({ facilityId: 'fac-1' });
    const receiver = new InventorySnapshotReceiver();
    const ctx = {
      transport: transport as never,
      proxy: { stateSync: vi.fn().mockResolvedValue(undefined) } as never,
      registry,
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
      onNotify: vi.fn(),
      onPersist: vi.fn(),
      onDevicesChanged: vi.fn(),
    };

    const snapshotJson = JSON.stringify({
      schema_version: 2,
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      generated_at: new Date().toISOString(),
      devices: [{
        kind: 'lock',
        lock_id: 'L-001',
        denylist: [{ sub: 'tenant-snap', exp: 9999999999 }],
      }],
    });
    const binary = Buffer.from(snapshotJson, 'utf8');
    const sha256 = createHash('sha256').update(binary).digest('hex');

    await receiver.handleJwtPayload({
      cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST',
      recovery_id: 'rec-deny',
      snapshot_id: 'snap-deny',
      sha256,
      size_bytes: binary.length,
      device_count: 1,
      chunk_count: 1,
      chunk_size: binary.length,
      nonce: 'nonce-deny',
    }, ctx);

    await receiver.handleJwtPayload({
      cmd_type: 'INVENTORY_SNAPSHOT_CHUNK',
      nonce: 'nonce-deny',
      chunk_index: 0,
      chunk_sha256: sha256,
      data: binary.toString('base64'),
    }, ctx);

    const lock = registry.list()[0] as import('@protocol/device-kinds').LockInventoryItem;
    expect(lock.lock_id).toBe('L-001');
    expect(lock.cloud_device_id).toBeUndefined();
    expect(registry.getSimState(`lock:${lock.lock_id}`)?.denylist).toEqual(
      expect.arrayContaining([expect.objectContaining({ sub: 'tenant-snap' })]),
    );
  });

  it('applies snapshot even when firmwareMode is fail (inventory is independent of firmware test mode)', async () => {
    const sent: unknown[] = [];
    const transport = { send: (msg: unknown) => sent.push(msg) };
    const registry = new DeviceRegistry();
    const receiver = new InventorySnapshotReceiver();
    const ctx = {
      transport: transport as never,
      proxy: { stateSync: vi.fn().mockResolvedValue(undefined) } as never,
      registry,
      behavior: { ...DEFAULT_BEHAVIOR, firmwareMode: 'fail' as const },
      facilityId: 'fac-1',
      onNotify: vi.fn(),
      onPersist: vi.fn(),
      onDevicesChanged: vi.fn(),
    };

    const snapshotJson = JSON.stringify({
      schema_version: 2,
      facility_id: 'fac-1',
      gateway_id: 'gw-new',
      generated_at: new Date().toISOString(),
      devices: [{ kind: 'lock', lock_id: 'L-99' }],
    });
    const binary = Buffer.from(snapshotJson, 'utf8');
    const sha256 = createHash('sha256').update(binary).digest('hex');

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST',
        recovery_id: 'rec-fw-fail',
        snapshot_id: 'snap-fw-fail',
        sha256,
        size_bytes: binary.length,
        device_count: 1,
        chunk_count: 1,
        chunk_size: binary.length,
        nonce: 'nonce-fw-fail',
      },
      ctx,
    );

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_CHUNK',
        nonce: 'nonce-fw-fail',
        chunk_index: 0,
        chunk_sha256: sha256,
        data: binary.toString('base64'),
      },
      ctx,
    );

    expect(registry.list()).toHaveLength(1);
    expect(registry.list()[0]).toMatchObject({ kind: 'lock', lock_id: 'L-99' });
    expect(ctx.onDevicesChanged).toHaveBeenCalled();
  });

  it('ACKs chunk verification failure without applying snapshot', async () => {
    const sent: unknown[] = [];
    const transport = { send: (msg: unknown) => sent.push(msg) };
    const registry = new DeviceRegistry();
    const receiver = new InventorySnapshotReceiver();
    const ctx = {
      transport: transport as never,
      proxy: { stateSync: vi.fn() } as never,
      registry,
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
      onNotify: vi.fn(),
      onPersist: vi.fn(),
      onDevicesChanged: vi.fn(),
    };

    const binary = Buffer.from('snapshot', 'utf8');
    const sha256 = createHash('sha256').update(binary).digest('hex');

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST',
        recovery_id: 'rec-bad',
        snapshot_id: 'snap-bad',
        sha256,
        size_bytes: binary.length,
        device_count: 0,
        chunk_count: 1,
        chunk_size: binary.length,
        nonce: 'nonce-bad',
      },
      ctx,
    );

    await receiver.handleJwtPayload(
      {
        cmd_type: 'INVENTORY_SNAPSHOT_CHUNK',
        nonce: 'nonce-bad',
        chunk_index: 0,
        chunk_sha256: 'deadbeef',
        data: binary.toString('base64'),
      },
      ctx,
    );

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'INVENTORY_SNAPSHOT_CHUNK_ACK',
          chunkIndex: 0,
          status: 'error',
        }),
      ]),
    );
    expect(ctx.onPersist).not.toHaveBeenCalled();
    expect(registry.list()).toHaveLength(0);
  });
});
