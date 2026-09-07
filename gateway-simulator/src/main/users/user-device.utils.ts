import { generateKeyPairSync } from 'crypto';
import { randomUUID } from 'crypto';
import type {
  AddUserDeviceRequest,
  SimulatedUserDevice,
  UserDevicePlatform,
  UserDeviceState,
  UserInstanceState,
  UserProfile,
} from '@protocol/user-simulator-state';

const ED25519_SPKI_PREFIX_LEN = 12;
const ED25519_PKCS8_PREFIX_LEN = 16;

export function extractRawEd25519PublicKey(spkiDer: Buffer): Buffer {
  if (spkiDer.length < ED25519_SPKI_PREFIX_LEN + 32) {
    throw new Error('Invalid Ed25519 SPKI length');
  }
  return spkiDer.subarray(spkiDer.length - 32);
}

export function extractRawEd25519PrivateKey(pkcs8Der: Buffer): Buffer {
  if (pkcs8Der.length < ED25519_PKCS8_PREFIX_LEN + 32) {
    throw new Error('Invalid Ed25519 PKCS8 length');
  }
  return pkcs8Der.subarray(pkcs8Der.length - 32);
}

export function generateUserDeviceKeyPair(): {
  publicKeyB64: string;
  publicKeyB64Url: string;
  privateKeyB64Url: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPub = extractRawEd25519PublicKey(publicKey.export({ type: 'spki', format: 'der' }));
  const rawPriv = extractRawEd25519PrivateKey(privateKey.export({ type: 'pkcs8', format: 'der' }));
  return {
    publicKeyB64: rawPub.toString('base64'),
    publicKeyB64Url: rawPub.toString('base64url'),
    privateKeyB64Url: rawPriv.toString('base64url'),
  };
}

export function createUserDevice(
  deviceId: string,
  req: AddUserDeviceRequest = {},
): SimulatedUserDevice {
  const keys = generateUserDeviceKeyPair();
  return {
    id: deviceId,
    appDeviceId: req.appDeviceId?.trim() || `sim-${deviceId.slice(0, 8)}`,
    platform: req.platform ?? 'ios',
    deviceName: req.deviceName?.trim() || 'Simulator Phone',
    publicKeyB64: keys.publicKeyB64,
    publicKeyB64Url: keys.publicKeyB64Url,
    privateKeyB64Url: keys.privateKeyB64Url,
    linkedFromBackend: false,
    hasLocalKeys: true,
    cachedRoutePasses: [],
  };
}

export type CloudUserDeviceRecord = {
  id: string;
  app_device_id: string;
  platform: UserDevicePlatform;
  device_name?: string | null;
  public_key?: string | null;
  status?: string;
  updated_at?: string;
  created_at?: string;
};

/** Import an existing backend device (public key only — no local private key). */
export function createLinkedUserDevice(deviceId: string, cloud: CloudUserDeviceRecord): SimulatedUserDevice {
  const publicKeyB64 = String(cloud.public_key ?? '').trim();
  let publicKeyB64Url = '';
  if (publicKeyB64) {
    try {
      publicKeyB64Url = Buffer.from(publicKeyB64, 'base64').toString('base64url');
    } catch {
      publicKeyB64Url = publicKeyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
  }
  const active = cloud.status !== 'revoked';
  return {
    id: deviceId,
    appDeviceId: cloud.app_device_id,
    platform: cloud.platform ?? 'ios',
    deviceName: cloud.device_name?.trim() || 'Cloud device',
    publicKeyB64,
    publicKeyB64Url,
    privateKeyB64Url: '',
    backendDeviceId: cloud.id,
    registeredAt: active ? (cloud.updated_at ?? cloud.created_at ?? new Date().toISOString()) : undefined,
    linkedFromBackend: true,
    hasLocalKeys: false,
    cachedRoutePasses: [],
  };
}

export function toUserDeviceState(device: SimulatedUserDevice): UserDeviceState {
  return {
    id: device.id,
    appDeviceId: device.appDeviceId,
    platform: device.platform,
    deviceName: device.deviceName,
    publicKeyB64: device.publicKeyB64,
    registered: Boolean(device.backendDeviceId && device.registeredAt),
    backendDeviceId: device.backendDeviceId,
    registeredAt: device.registeredAt,
    linkedFromBackend: device.linkedFromBackend,
    hasLocalKeys: device.hasLocalKeys !== false,
    cachedRoutePasses: device.cachedRoutePasses.map((pass) => ({
      facilityId: pass.facilityId,
      facilityName: pass.facilityName,
      hasPass: Boolean(pass.jwt),
      jwtPreview: truncateJwt(pass.jwt),
      fetchedAt: pass.fetchedAt,
      expiresAt: pass.expiresAt,
      tamper: pass.tamper,
      aud: parseAudFromJwt(pass.jwt),
      sub: parseSubFromJwt(pass.jwt),
    })),
  };
}

export function toUserInstanceState(profile: UserProfile): UserInstanceState {
  return {
    id: profile.id,
    label: profile.label,
    backendUrl: profile.backendUrl,
    email: profile.email,
    cloudUserId: profile.cloudUserId,
    role: profile.role,
    loggedIn: Boolean(profile.sessionToken && profile.cloudUserId),
    opsPublicKeyB64: profile.opsPublicKeyB64,
    keyGenerationRequired: profile.keyGenerationRequired,
    devices: profile.devices.map(toUserDeviceState),
    appRealtime: { status: 'disconnected', events: [] },
  };
}

export function emptyUserProfile(
  overrides: Partial<UserProfile> & Pick<UserProfile, 'id' | 'label' | 'backendUrl' | 'email'>,
): UserProfile {
  return {
    devices: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function newUserDeviceId(): string {
  return randomUUID();
}

export function normalizeOpsPublicKeyB64(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  try {
    const buf = Buffer.from(trimmed, trimmed.includes('+') || trimmed.includes('/') ? 'base64' : 'base64url');
    return buf.toString('base64url');
  } catch {
    return trimmed.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

function truncateJwt(jwt: string, head = 18, tail = 12): string {
  if (!jwt) return '—';
  if (jwt.length <= head + tail + 1) return jwt;
  return `${jwt.slice(0, head)}…${jwt.slice(-tail)}`;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseAudFromJwt(jwt: string): string[] | undefined {
  const payload = decodeJwtPayload(jwt);
  if (!payload?.aud) return undefined;
  const aud = payload.aud;
  return Array.isArray(aud) ? aud.map(String) : [String(aud)];
}

function parseSubFromJwt(jwt: string): string | undefined {
  const payload = decodeJwtPayload(jwt);
  return payload?.sub ? String(payload.sub) : undefined;
}

export function findUserDevice(profile: UserProfile, appDeviceId: string): SimulatedUserDevice | null {
  return profile.devices.find((d) => d.appDeviceId === appDeviceId) ?? null;
}

export function findCachedPass(
  device: SimulatedUserDevice,
  facilityId: string,
): import('@protocol/user-simulator-state').CachedRoutePass | null {
  return device.cachedRoutePasses.find((p) => p.facilityId === facilityId) ?? null;
}

export function upsertCachedPass(
  device: SimulatedUserDevice,
  pass: import('@protocol/user-simulator-state').CachedRoutePass,
): void {
  const idx = device.cachedRoutePasses.findIndex((p) => p.facilityId === pass.facilityId);
  if (idx >= 0) device.cachedRoutePasses[idx] = pass;
  else device.cachedRoutePasses.push(pass);
}

export function defaultPlatform(platform?: UserDevicePlatform): UserDevicePlatform {
  return platform ?? 'ios';
}
