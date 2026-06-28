import { describe, expect, it } from 'vitest';
import { summarizeGatewayMessage } from '../src/main/net/gateway-message.utils';

describe('summarizeGatewayMessage', () => {
  it('summarizes known message types', () => {
    expect(summarizeGatewayMessage({ type: 'PING' })).toBe('PING');
    expect(summarizeGatewayMessage({ type: 'FIRMWARE_CHUNK' })).toBe('FIRMWARE_CHUNK');
    expect(summarizeGatewayMessage({ type: 'PROXY_RESPONSE', status: 200 })).toBe('PROXY_RESPONSE 200');
  });

  it('decodes COMMAND jwt cmd_type when present', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ cmd_type: 'LOCK' })).toString('base64url');
    const jwt = `${header}.${body}.`;
    expect(summarizeGatewayMessage({ type: 'COMMAND', jwt })).toBe('COMMAND LOCK');
  });

  it('falls back for non-object input', () => {
    expect(summarizeGatewayMessage('raw')).toBe('raw');
  });
});
