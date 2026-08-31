import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, normalizeInboundCommand } from '../src/main/crypto/JwtCodec';

function jwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.`;
}

describe('JwtCodec', () => {
  it('decodeJwtPayload parses base64url body', () => {
    const payload = decodeJwtPayload(jwt({ cmd_type: 'LOCK', device_id: 'L1' }));
    expect(payload.cmd_type).toBe('LOCK');
    expect(payload.device_id).toBe('L1');
  });

  it('decodeJwtPayload rejects malformed tokens', () => {
    expect(() => decodeJwtPayload('not-a-jwt')).toThrow(/Invalid JWT/);
  });

  it('normalizeInboundCommand handles COMMAND envelope', () => {
    const result = normalizeInboundCommand({ type: 'COMMAND', jwt: jwt({ cmd_type: 'UNLOCK' }) });
    expect(result?.cmd_type).toBe('UNLOCK');
  });

  it('normalizeInboundCommand handles raw cmd_type objects', () => {
    expect(normalizeInboundCommand({ cmd_type: 'ACCESS_CODE_UPDATE', nonce: 'n1' })?.nonce).toBe('n1');
  });

  it('normalizeInboundCommand handles array payloads', () => {
    expect(normalizeInboundCommand([{ cmd_type: 'DENYLIST_ADD' }])?.cmd_type).toBe('DENYLIST_ADD');
  });

  it('normalizeInboundCommand returns null for invalid input', () => {
    expect(normalizeInboundCommand(null)).toBeNull();
    expect(normalizeInboundCommand({ type: 'COMMAND', jwt: 'bad' })).toBeNull();
    expect(normalizeInboundCommand({ type: 'PING' })).toBeNull();
  });
});
