import { describe, expect, it } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import {
  applyRoutePassTamper,
  audienceGrantsDevice,
  audienceMatchesLock,
  decodeJwtPayloadUnsafe,
} from '../src/main/users/route-pass-jwt.utils';
import { evaluateRoutePassForDevice, verifyRoutePassSignature } from '../src/main/users/route-pass-verification.utils';

async function signTestRoutePass(payload: Record<string, unknown>, expOffsetSec = 3600) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwk = await exportJWK(publicKey);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expOffsetSec)
    .sign(privateKey);
  return { jwt, opsPublicKeyB64Url: String(jwk.x) };
}

describe('route-pass-jwt.utils', () => {
  it('matches lock audience', () => {
    expect(audienceMatchesLock(['lock:ABC123'], 'ABC123')).toBe(true);
    expect(audienceMatchesLock(['lock:OTHER'], 'ABC123')).toBe(false);
  });

  it('grants lock when aud contains lock serial', () => {
    expect(
      audienceGrantsDevice(['lock:L1'], {
        deviceKind: 'lock',
        lockSerial: 'L1',
      }),
    ).toBe(true);
  });

  it('corrupts signature for tamper mode', () => {
    const jwt = 'header.payload.signatureZ';
    const corrupted = applyRoutePassTamper(jwt, 'corrupt_signature', 1000);
    expect(corrupted).not.toBe(jwt);
    expect(corrupted.endsWith('corrupted-signature-bytes')).toBe(true);
  });

  it('decodes payload without verification', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'user-1', aud: ['lock:L1'] })).toString('base64url');
    const claims = decodeJwtPayloadUnsafe(`h.${payload}.s`);
    expect(claims?.sub).toBe('user-1');
  });
});

describe('route-pass-verification.utils', () => {
  it('grants access for valid route pass', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass({
      iss: 'BluCloud:Root',
      sub: 'user-1',
      aud: ['lock:LOCK-001'],
    });
    const verified = await verifyRoutePassSignature(jwt, opsPublicKeyB64Url);
    expect(verified.ok).toBe(true);

    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'LOCK-001',
      deviceKind: 'lock',
    });
    expect(result.granted).toBe(true);
  });

  it('denies wrong lock', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass({
      sub: 'user-1',
      aud: ['lock:OTHER'],
    });
    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'LOCK-001',
      deviceKind: 'lock',
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('route_pass_wrong_lock');
  });

  it('denies expired pass', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass(
      { sub: 'user-1', aud: ['lock:L1'] },
      -120,
    );
    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'L1',
      deviceKind: 'lock',
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('route_pass_expired');
  });

  it('denies denylisted user', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass({
      sub: 'blocked-user',
      aud: ['lock:L1'],
    });
    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'L1',
      deviceKind: 'lock',
      denylistSubs: ['blocked-user'],
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('denylist_blocked');
  });

  it('denies corrupt signature tamper', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass({
      sub: 'user-1',
      aud: ['lock:L1'],
    });
    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'L1',
      deviceKind: 'lock',
      tamper: 'corrupt_signature',
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('route_pass_invalid_signature');
  });

  it('denies force_expired tamper even when jwt not expired', async () => {
    const { jwt, opsPublicKeyB64Url } = await signTestRoutePass({
      sub: 'user-1',
      aud: ['lock:L1'],
    });
    const result = await evaluateRoutePassForDevice({
      routePassJwt: jwt,
      opsPublicKeyB64: opsPublicKeyB64Url,
      lockSerial: 'L1',
      deviceKind: 'lock',
      tamper: 'force_expired',
    });
    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe('route_pass_expired');
  });
});
