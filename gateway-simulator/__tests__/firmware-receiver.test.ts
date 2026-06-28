import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { FirmwareReceiver } from '../src/main/firmware/FirmwareReceiver';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';

describe('FirmwareReceiver', () => {
  it('ACKs chunks and completes push with full lifecycle status updates', async () => {
    const sent: unknown[] = [];
    const transport = {
      send: (msg: unknown) => sent.push(msg),
    };
    const proxy = {
      stateSync: vi.fn().mockResolvedValue({ type: 'PROXY_RESPONSE', id: '1', status: 200 }),
    };
    const registry = new DeviceRegistry();
    const receiver = new FirmwareReceiver();
    const behavior = { ...DEFAULT_BEHAVIOR, firmwareVerifyDelayMs: 0 };
    let gatewayFirmwareVersion: string | undefined;
    const ctx = {
      transport: transport as never,
      proxy: proxy as never,
      registry,
      behavior,
      facilityId: 'fac-1',
      onPersist: vi.fn(),
      applyGatewayFirmware: (version: string) => {
        gatewayFirmwareVersion = version;
      },
    };

    const chunkBytes = Buffer.from('firmware-bytes');
    const chunkSha = createHash('sha256').update(chunkBytes).digest('hex');

    await receiver.handleJwtPayload(
      {
        cmd_type: 'FIRMWARE_MANIFEST',
        push_id: 'push-1',
        target_type: 'gateway',
        filename: 'gw.bin',
        version: '2.0.0',
        sha256: 'abc',
        size: chunkBytes.length,
        chunk_count: 1,
        chunk_size: chunkBytes.length,
        nonce: 'nonce-1',
      },
      ctx,
    );

    await receiver.handleJwtPayload(
      {
        cmd_type: 'FIRMWARE_CHUNK',
        target_type: 'gateway',
        nonce: 'nonce-1',
        chunk_index: 0,
        chunk_sha256: chunkSha,
        data: chunkBytes.toString('base64'),
      },
      ctx,
    );

    const statusMessages = sent.filter(
      (msg) => (msg as { type?: string }).type === 'FIRMWARE_UPDATE_STATUS',
    ) as Array<{ status: string }>;

    expect(sent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'FIRMWARE_CHUNK_ACK', chunkIndex: 0, status: 'ok' }),
      ]),
    );
    expect(statusMessages.map((msg) => msg.status)).toEqual(['verifying', 'applying', 'success']);

    expect(gatewayFirmwareVersion).toBe('2.0.0');
  });
});
