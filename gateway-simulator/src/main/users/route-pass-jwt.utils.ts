import type { RoutePassClaims } from '@protocol/user-simulator-state';

export function decodeJwtPayloadUnsafe(jwt: string): RoutePassClaims | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as RoutePassClaims;
  } catch {
    return null;
  }
}

export function decodeJwtHeaderUnsafe(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 1 || !parts[0]) return null;
  try {
    const json = Buffer.from(parts[0], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function buildRoutePassDetails(
  pass: Pick<
    import('@protocol/user-simulator-state').CachedRoutePass,
    'jwt' | 'tamper' | 'fetchedAt' | 'expiresAt'
  >,
  nowSec = Math.floor(Date.now() / 1000),
): import('@protocol/user-simulator-state').RoutePassDetails {
  const presentableJwt = applyRoutePassTamper(pass.jwt, pass.tamper, nowSec);
  const originalPayload = decodeJwtPayloadUnsafe(pass.jwt) ?? {};
  const payload = decodeJwtPayloadUnsafe(presentableJwt) ?? {};
  const header =
    decodeJwtHeaderUnsafe(presentableJwt) ?? decodeJwtHeaderUnsafe(pass.jwt) ?? {};

  return {
    jwt: pass.jwt,
    presentableJwt,
    header,
    payload,
    originalPayload,
    tamper: pass.tamper,
    fetchedAt: pass.fetchedAt,
    expiresAt: pass.expiresAt ?? payload.exp ?? originalPayload.exp,
  };
}

export function normalizeAudClaim(aud: RoutePassClaims['aud']): string[] {
  if (!aud) return [];
  return Array.isArray(aud) ? aud.map(String) : [String(aud)];
}

/** Roles that receive empty `aud` and are authorized via `user_role` on devices. */
export const ROUTE_PASS_ROLE_GRANTS_ALL = new Set(['admin', 'dev_admin', 'facility_admin']);

export function routePassRoleGrantsAllDevices(userRole: unknown): boolean {
  if (typeof userRole !== 'string') return false;
  return ROUTE_PASS_ROLE_GRANTS_ALL.has(userRole.trim().toLowerCase());
}

export function audienceMatchesLock(audiences: string[], lockSerial: string): boolean {
  const target = `lock:${lockSerial}`;
  return audiences.some((entry) => entry === target);
}

export function audienceMatchesSharedLock(
  audiences: string[],
  lockSerial: string,
  userId: string,
): boolean {
  const prefix = `shared_key:${userId}:${lockSerial}`;
  return audiences.some((entry) => entry === prefix);
}

export function audienceMatchesAccessControl(audiences: string[], cloudDeviceId: string): boolean {
  const target = `access_control:${cloudDeviceId}`;
  return audiences.some((entry) => entry === target);
}

export function audienceGrantsDevice(
  audiences: string[],
  input: {
    deviceKind: 'lock' | 'access_control';
    lockSerial: string;
    accessControlCloudId?: string;
    userId?: string;
  },
): boolean {
  if (input.deviceKind === 'lock') {
    if (audienceMatchesLock(audiences, input.lockSerial)) return true;
    if (input.userId && audienceMatchesSharedLock(audiences, input.lockSerial, input.userId)) {
      return true;
    }
    return false;
  }
  if (!input.accessControlCloudId) return false;
  return audienceMatchesAccessControl(audiences, input.accessControlCloudId);
}

export function applyRoutePassTamper(
  jwt: string,
  tamper: import('@protocol/user-simulator-state').RoutePassTamperMode,
  nowSec: number,
): string {
  if (tamper === 'none') return jwt;
  if (tamper === 'corrupt_signature') {
    const parts = jwt.split('.');
    if (parts.length !== 3) return jwt;
    return `${parts[0]}.${parts[1]}.corrupted-signature-bytes`;
  }
  if (tamper === 'force_expired') {
    const parts = jwt.split('.');
    if (parts.length !== 3) return jwt;
    const payload = decodeJwtPayloadUnsafe(jwt);
    if (!payload) return jwt;
    const expired = { ...payload, exp: nowSec - 60, iat: nowSec - 3600 };
    const encoded = Buffer.from(JSON.stringify(expired)).toString('base64url');
    return `${parts[0]}.${encoded}.${parts[2]}`;
  }
  return jwt;
}

export function parseRoutePassExpiry(jwt: string): number | undefined {
  return decodeJwtPayloadUnsafe(jwt)?.exp;
}
