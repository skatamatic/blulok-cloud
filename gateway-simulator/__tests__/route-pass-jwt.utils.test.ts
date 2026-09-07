import { describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import {
  applyRoutePassTamper,
  audienceGrantsDevice,
  audienceMatchesAccessControl,
  audienceMatchesSharedLock,
  parseRoutePassExpiry,
} from '../src/main/users/route-pass-jwt.utils';

describe('route-pass-jwt.utils extended', () => {
  it('matches shared_key audience', () => {
    expect(audienceMatchesSharedLock(['shared_key:primary:L1'], 'L1', 'primary')).toBe(true);
    expect(audienceMatchesSharedLock(['shared_key:other:L1'], 'L1', 'primary')).toBe(false);
  });

  it('matches access_control audience', () => {
    expect(audienceMatchesAccessControl(['access_control:uuid-1'], 'uuid-1')).toBe(true);
  });

  it('grants access_control device when cloud id matches', () => {
    expect(
      audienceGrantsDevice(['access_control:ac-1'], {
        deviceKind: 'access_control',
        lockSerial: 'x',
        accessControlCloudId: 'ac-1',
      }),
    ).toBe(true);
  });

  it('force_expired tamper rewrites payload exp', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', exp: 9999999999 })).toString('base64url');
    const jwt = `h.${payload}.sig`;
    const tampered = applyRoutePassTamper(jwt, 'force_expired', 1000);
    expect(tampered).not.toBe(jwt);
    expect(parseRoutePassExpiry(tampered)).toBeLessThan(1000);
  });

  it('returns original jwt for unknown tamper', () => {
    const jwt = 'a.b.c';
    expect(applyRoutePassTamper(jwt, 'none' as 'none', 1)).toBe(jwt);
  });
});

describe('parseRoutePassExpiry', () => {
  it('returns undefined for malformed jwt', async () => {
    expect(parseRoutePassExpiry('bad')).toBeUndefined();
    const { privateKey } = await generateKeyPair('EdDSA');
    const jwt = await new SignJWT({ sub: 'u' })
      .setProtectedHeader({ alg: 'EdDSA' })
      .setExpirationTime('2h')
      .sign(privateKey);
    expect(parseRoutePassExpiry(jwt)).toBeTypeOf('number');
  });
});
