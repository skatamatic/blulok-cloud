import { describe, expect, it, vi } from 'vitest';
import {
  isAuthOkMessage,
  isErrorMessage,
  isPingMessage,
  isProxyResponseMessage,
  parseJsonMessage,
} from '../src/protocol/messages';
import { normalizeBehavior } from '../src/protocol/ipc-channels';
import { decodeJwtPayload, normalizeInboundCommand } from '../src/main/crypto/JwtCodec';
import { CommandRouter } from '../src/main/commands/CommandRouter';
import { FirmwareReceiver } from '../src/main/firmware/FirmwareReceiver';
import { InventorySnapshotReceiver } from '../src/main/inventory/InventorySnapshotReceiver';
import { DeviceRegistry } from '../src/main/devices/DeviceRegistry';
import { DEFAULT_BEHAVIOR } from '../src/protocol/ipc-channels';

describe('protocol messages', () => {
  it('type guards identify protocol messages', () => {
    expect(isPingMessage({ type: 'PING' })).toBe(true);
    expect(isPingMessage({ type: 'PONG' })).toBe(false);
    expect(isAuthOkMessage({ type: 'AUTH_OK', facilityId: 'f' })).toBe(true);
    expect(isErrorMessage({ type: 'ERROR', code: 'X', message: 'm' })).toBe(true);
    expect(isProxyResponseMessage({ type: 'PROXY_RESPONSE', id: '1', status: 200 })).toBe(true);
    expect(isProxyResponseMessage({ type: 'PROXY_RESPONSE' })).toBe(false);
  });

  it('parseJsonMessage parses string and buffer input', () => {
    expect(parseJsonMessage('{"type":"PING"}')).toEqual({ type: 'PING' });
    expect(parseJsonMessage(Buffer.from('{"type":"PONG"}'))).toEqual({ type: 'PONG' });
  });
});

describe('normalizeBehavior', () => {
  it('migrates legacy autoLockResponse flag', () => {
    expect(normalizeBehavior({ autoLockResponse: false }).lockUnlockMode).toBe('apply-only');
    expect(normalizeBehavior({ autoLockResponse: true }).lockUnlockMode).toBe('accept');
    expect(normalizeBehavior({ lockUnlockMode: 'ignore', autoLockResponse: true }).lockUnlockMode).toBe('ignore');
  });
});

describe('JwtCodec firmware paths', () => {
  it('normalizes FIRMWARE jwt envelopes', () => {
    const header = Buffer.from('{}').toString('base64url');
    const body = Buffer.from(JSON.stringify({ cmd_type: 'FIRMWARE_MANIFEST', push_id: 'p1' })).toString(
      'base64url',
    );
    const jwt = `${header}.${body}.`;
    expect(normalizeInboundCommand({ type: 'FIRMWARE_MANIFEST', jwt })?.cmd_type).toBe('FIRMWARE_MANIFEST');
    expect(normalizeInboundCommand({ jwt })?.push_id).toBe('p1');
  });

  it('decodeJwtPayload round-trips cmd payload', () => {
    const payload = { cmd_type: 'DEVICE_DELETED', nonce: 'n1' };
    const header = Buffer.from('{}').toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(decodeJwtPayload(`${header}.${body}.`)).toMatchObject(payload);
  });
});

describe('CommandRouter firmware routing', () => {
  it('delegates FIRMWARE_MANIFEST to firmware receiver', async () => {
    const firmware = new FirmwareReceiver();
    const spy = vi.spyOn(firmware, 'handleMessage').mockResolvedValue(undefined);
    const router = new CommandRouter(firmware, new InventorySnapshotReceiver());
    const ctx = {
      transport: { send: vi.fn(), isConnected: () => true, connect: async () => undefined, disconnect: () => undefined, onMessage: () => undefined, onClose: () => undefined, onOpen: () => undefined },
      proxy: { request: vi.fn(), inventorySync: vi.fn(), stateSync: vi.fn(), addLog: vi.fn(), attach: () => undefined, dispose: () => undefined },
      registry: new DeviceRegistry(),
      behavior: DEFAULT_BEHAVIOR,
      facilityId: 'fac-1',
    };
    await router.route({ type: 'FIRMWARE_MANIFEST', jwt: 'x' }, ctx as never);
    expect(spy).toHaveBeenCalled();
  });
});
