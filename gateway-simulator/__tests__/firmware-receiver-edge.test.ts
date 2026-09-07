import { describe, expect, it, vi } from 'vitest';
import { FirmwareReceiver } from '../src/main/firmware/FirmwareReceiver';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('FirmwareReceiver edge cases', () => {
  it('handleJwtPayload ignores unknown cmd types', async () => {
    const receiver = new FirmwareReceiver();
    const send = vi.fn();
    await receiver.handleJwtPayload({ cmd_type: 'LOCK' } as never, {
      transport: { send, isConnected: () => true, connect: async () => undefined, disconnect: () => undefined, onMessage: () => undefined, onClose: () => undefined, onOpen: () => undefined },
      proxy: { request: vi.fn(), inventorySync: vi.fn(), stateSync: vi.fn(), addLog: vi.fn(), attach: () => undefined, dispose: () => undefined },
      registry: { list: () => [], applyFirmware: vi.fn() } as never,
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('handleMessage ignores non-firmware types', async () => {
    const receiver = new FirmwareReceiver();
    const spy = vi.spyOn(receiver, 'handleJwtPayload');
    await receiver.handleMessage({ type: 'PING' }, {} as never);
    expect(spy).not.toHaveBeenCalled();
  });

  it('handleMessage routes FIRMWARE_MANIFEST jwt envelope', async () => {
    const receiver = new FirmwareReceiver();
    const spy = vi.spyOn(receiver, 'handleJwtPayload').mockResolvedValue(undefined);
    await receiver.handleMessage({ type: 'FIRMWARE_MANIFEST', jwt: jwt({ cmd_type: 'FIRMWARE_MANIFEST' }) }, {} as never);
    expect(spy).toHaveBeenCalled();
  });
});
