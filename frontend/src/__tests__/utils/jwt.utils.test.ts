import { getJwtExpirationMs, isJwtExpired } from '@/utils/jwt.utils';

function tokenWithPayload(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.sig`;
}

describe('jwt.utils', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null for malformed tokens', () => {
    expect(getJwtExpirationMs('not-a-jwt')).toBeNull();
    expect(getJwtExpirationMs('only.one')).toBeNull();
    expect(getJwtExpirationMs('a.%%%invalid%%%.c')).toBeNull();
  });

  it('reads exp in milliseconds', () => {
    const expSec = 1_700_000_000;
    expect(getJwtExpirationMs(tokenWithPayload({ exp: expSec }))).toBe(expSec * 1000);
    expect(getJwtExpirationMs(tokenWithPayload({ sub: 'x' }))).toBeNull();
  });

  it('treats missing exp as not expired and honors skew', () => {
    expect(isJwtExpired('bad')).toBe(false);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-12T12:00:00.000Z'));
    const soon = Math.floor(Date.now() / 1000) + 10;
    const later = Math.floor(Date.now() / 1000) + 120;
    expect(isJwtExpired(tokenWithPayload({ exp: soon }), 30_000)).toBe(true);
    expect(isJwtExpired(tokenWithPayload({ exp: later }), 30_000)).toBe(false);
  });
});
