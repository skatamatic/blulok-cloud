import { describe, expect, it } from 'vitest';
import { isJwtFresh, parseJwtExpiry } from '../src/main/auth/session-jwt.utils';

describe('session-jwt.utils', () => {
  it('parseJwtExpiry reads exp claim', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1700000000 })).toString('base64url');
    expect(parseJwtExpiry(`h.${payload}.s`)).toBe(1700000000);
  });

  it('isJwtFresh respects buffer', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ exp: future })).toString('base64url');
    const token = `h.${payload}.s`;
    expect(isJwtFresh(token)).toBe(true);
    expect(isJwtFresh(undefined)).toBe(false);
  });
});
