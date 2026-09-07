import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { COMMAND_TYPES } from '../src/protocol/commands';
import { GATEWAY_INBOUND_MESSAGE_TYPES, GATEWAY_OUTBOUND_MESSAGE_TYPES } from '../src/protocol/messages';
import { GATEWAY_INVENTORY_KINDS } from '../src/protocol/device-kinds';
import { FIRMWARE_CHUNK_SIZE_BYTES, GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT } from '../src/protocol/constants';

const BACKEND_ROOT = join(__dirname, '../../backend/src');

function readBackend(rel: string): string {
  return readFileSync(join(BACKEND_ROOT, rel), 'utf8');
}

describe('protocol contract parity with backend', () => {
  it('matches firmware chunk size constant', () => {
    const backend = readBackend('constants/firmware-chunk.constants.ts');
    expect(backend).toContain('FIRMWARE_CHUNK_SIZE_BYTES = 2_356_320');
    expect(FIRMWARE_CHUNK_SIZE_BYTES).toBe(2_356_320);
  });

  it('matches gateway WS max message default', () => {
    const backend = readBackend('constants/firmware-chunk.constants.ts');
    expect(backend).toContain('GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT = 5 * 1024 * 1024');
    expect(GATEWAY_WS_MAX_MESSAGE_BYTES_DEFAULT).toBe(5 * 1024 * 1024);
  });

  it('includes all backend inventory kinds', () => {
    const backend = readBackend('config/gateway-device-kinds.ts');
    for (const kind of ['lock', 'access_control', 'bridge', 'friend_node', 'gateway'] as const) {
      expect(backend).toContain(`kind: '${kind}'`);
      expect(GATEWAY_INVENTORY_KINDS).toContain(kind);
    }
  });

  it('includes core WS message types from backend message-types', () => {
    const backend = readBackend('services/gateway/message-types.ts');
    for (const t of ['AUTH', 'AUTH_OK', 'PING', 'PONG', 'PROXY_REQUEST', 'PROXY_RESPONSE', 'FIRMWARE_MANIFEST', 'FIRMWARE_CHUNK']) {
      expect(backend).toContain(`'${t}'`);
    }
    expect(GATEWAY_INBOUND_MESSAGE_TYPES).toContain('AUTH');
    expect(GATEWAY_OUTBOUND_MESSAGE_TYPES).toContain('AUTH_OK');
  });

  it('includes command types used by gateway WS JWT payloads', () => {
    const backendDenylist = readBackend('services/denylist.service.ts');
    expect(backendDenylist).toContain('DENYLIST_ADD');
    expect(backendDenylist).toContain('DENYLIST_REMOVE');
    for (const cmd of ['LOCK', 'UNLOCK', 'DENYLIST_ADD', 'DENYLIST_REMOVE', 'ACCESS_CODE_UPDATE', 'DEVICE_DELETED', 'FIRMWARE_MANIFEST', 'FIRMWARE_CHUNK']) {
      expect(COMMAND_TYPES as readonly string[]).toContain(cmd);
    }
  });
});
