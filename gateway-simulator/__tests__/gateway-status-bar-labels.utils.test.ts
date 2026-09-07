import { describe, expect, it } from 'vitest';
import {
  decodeJwtCommandType,
  humanizeCommandType,
  parseHttpStatus,
  proxyPathLabel,
  readInboundCommandLabel,
  readPayloadType,
} from '../src/renderer/utils/gateway-status-bar-labels.utils';

describe('gateway-status-bar-labels.utils', () => {
  it('readPayloadType extracts type field', () => {
    expect(readPayloadType({ type: 'COMMAND' })).toBe('COMMAND');
    expect(readPayloadType(null)).toBeNull();
  });

  it('decodeJwtCommandType reads commandType or JWT payload', () => {
    expect(decodeJwtCommandType({ commandType: 'LOCK' })).toBe('LOCK');
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ cmd_type: 'UNLOCK' })).toString('base64url');
    expect(decodeJwtCommandType({ type: 'COMMAND', jwt: `${header}.${payload}.sig` })).toBe('UNLOCK');
    expect(decodeJwtCommandType({ type: 'COMMAND', jwt: 'bad' })).toBeNull();
  });

  it('readInboundCommandLabel prefers decoded command type', () => {
    expect(readInboundCommandLabel({ commandType: 'FIRMWARE_MANIFEST' })).toBe('Firmware Manifest');
    expect(readInboundCommandLabel({ type: 'PONG' })).toBe('Pong');
  });

  it('parseHttpStatus extracts status code from summary', () => {
    expect(parseHttpStatus('Live state sync HTTP 503 (lock:1)')).toBe(503);
    expect(parseHttpStatus('no status here')).toBeNull();
  });

  it('proxyPathLabel falls back to method and path', () => {
    expect(proxyPathLabel('/unknown', 'GET')).toBe('GET /unknown');
    expect(humanizeCommandType('access_code_update')).toBe('Access Code Update');
  });
});
