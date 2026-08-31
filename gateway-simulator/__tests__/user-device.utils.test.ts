import { describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'crypto';
import {
  createUserDevice,
  extractRawEd25519PublicKey,
  generateUserDeviceKeyPair,
  normalizeOpsPublicKeyB64,
  toUserDeviceState,
  upsertCachedPass,
} from '../src/main/users/user-device.utils';
import { emptyUserProfile } from '../src/main/persistence/user-profile.utils';

describe('user-device.utils', () => {
  it('generates distinct Ed25519 keypairs', () => {
    const a = generateUserDeviceKeyPair();
    const b = generateUserDeviceKeyPair();
    expect(a.publicKeyB64).not.toBe(b.publicKeyB64);
    expect(a.publicKeyB64Url).not.toBe(b.publicKeyB64Url);
  });

  it('extracts raw public key from SPKI', () => {
    const { publicKey } = generateKeyPairSync('ed25519');
    const der = publicKey.export({ type: 'spki', format: 'der' });
    const raw = extractRawEd25519PublicKey(der);
    expect(raw.length).toBe(32);
  });

  it('creates user device with cached passes array', () => {
    const device = createUserDevice('dev-1', { appDeviceId: 'phone-1', deviceName: 'Phone' });
    expect(device.appDeviceId).toBe('phone-1');
    expect(device.cachedRoutePasses).toEqual([]);
  });

  it('normalizes ops public key to base64url', () => {
    const raw = Buffer.alloc(32, 7);
    const b64 = raw.toString('base64');
    expect(normalizeOpsPublicKeyB64(b64)).toBe(raw.toString('base64url'));
  });

  it('upserts cached route pass by facility', () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'U',
      backendUrl: 'http://localhost',
      email: 'a@b.c',
      password: 'x',
    });
    profile.devices.push(createUserDevice('d1'));
    const device = profile.devices[0]!;
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: 'x.y.z',
      fetchedAt: new Date().toISOString(),
      tamper: 'corrupt_signature',
    });
    expect(device.cachedRoutePasses).toHaveLength(1);
    expect(device.cachedRoutePasses[0]?.jwt).toBe('x.y.z');
    expect(toUserDeviceState(device).cachedRoutePasses[0]?.tamper).toBe('corrupt_signature');
  });
});
