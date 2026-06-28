import { importJWK, jwtVerify } from 'jose';
import type { AccessEventDenialReason } from '@protocol/access-events';
import type { EvaluateRoutePassInput, EvaluateRoutePassResult, RoutePassClaims } from '@protocol/user-simulator-state';
import {
  applyRoutePassTamper,
  audienceGrantsDevice,
  decodeJwtPayloadUnsafe,
  normalizeAudClaim,
} from './route-pass-jwt.utils';
import { normalizeOpsPublicKeyB64 } from './user-device.utils';

export async function verifyRoutePassSignature(
  jwt: string,
  opsPublicKeyB64: string,
): Promise<{ ok: true; claims: RoutePassClaims } | { ok: false; message: string }> {
  const x = normalizeOpsPublicKeyB64(opsPublicKeyB64);
  if (!x) {
    return { ok: false, message: 'Missing operations public key' };
  }
  try {
    const key = await importJWK({ kty: 'OKP', crv: 'Ed25519', x }, 'EdDSA');
    const { payload } = await jwtVerify(jwt, key, {
      algorithms: ['EdDSA'],
      // Expiry is evaluated separately so locks can distinguish invalid sig vs expired.
      clockTolerance: 1e12,
    });
    return { ok: true, claims: payload as RoutePassClaims };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    return { ok: false, message };
  }
}

export function isRoutePassExpired(claims: RoutePassClaims, nowSec: number): boolean {
  if (typeof claims.exp !== 'number') return true;
  return nowSec >= claims.exp;
}

export function isUserDenylisted(sub: string | undefined, denylistSubs: string[] | undefined): boolean {
  if (!sub || !denylistSubs?.length) return false;
  return denylistSubs.includes(sub);
}

export async function evaluateRoutePassForDevice(
  input: EvaluateRoutePassInput,
): Promise<EvaluateRoutePassResult> {
  const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
  const tamper = input.tamper ?? 'none';

  if (!input.routePassJwt?.trim()) {
    return { granted: false, reason: 'invalid_credential', message: 'No route pass cached for this facility' };
  }

  const jwt = applyRoutePassTamper(input.routePassJwt, tamper, nowSec);
  const previewClaims = decodeJwtPayloadUnsafe(jwt);

  if (isUserDenylisted(previewClaims?.sub, input.denylistSubs)) {
    return { granted: false, reason: 'denylist_blocked', message: 'User is on device denylist' };
  }

  if (tamper === 'force_expired') {
    return { granted: false, reason: 'route_pass_expired', message: 'Route pass has expired' };
  }

  const verified = await verifyRoutePassSignature(jwt, input.opsPublicKeyB64);
  if (!verified.ok) {
    return {
      granted: false,
      reason: 'route_pass_invalid_signature',
      message: verified.message,
    };
  }

  const claims = verified.claims;

  if (isRoutePassExpired(claims, nowSec)) {
    return { granted: false, reason: 'route_pass_expired', message: 'Route pass has expired' };
  }

  const audiences = normalizeAudClaim(claims.aud);
  const granted = audienceGrantsDevice(audiences, {
    deviceKind: input.deviceKind,
    lockSerial: input.lockSerial,
    accessControlCloudId: input.accessControlCloudId,
    userId: claims.sub,
  });

  if (!granted) {
    return {
      granted: false,
      reason: 'route_pass_wrong_lock',
      message: 'Route pass does not grant access to this device',
    };
  }

  return { granted: true, claims };
}
