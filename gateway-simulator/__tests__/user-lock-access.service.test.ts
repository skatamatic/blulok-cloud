import { describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { tryOpenLockWithUserDevice } from '../src/main/users/user-lock-access.service';
import { emptyUserProfile } from '../src/main/persistence/user-profile.utils';
import { createUserDevice, upsertCachedPass } from '../src/main/users/user-device.utils';
import type { LockInventoryItem } from '../src/protocol/device-kinds';

async function signedPass(lockSerial: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwk = await exportJWK(publicKey);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ sub: 'user-1', aud: [`lock:${lockSerial}`] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  return { jwt, opsKey: String(jwk.x) };
}

describe('user-lock-access.service', () => {
  it('unlocks lock when route pass is valid', async () => {
    const { jwt, opsKey } = await signedPass('L100');
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
      cloudUserId: 'user-1',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt,
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];

    const item: LockInventoryItem = { kind: 'lock', lock_id: 'L100', locked: true, state: 'CLOSED' };
    let unlocked = false;
    const emitAccessEvent = vi.fn().mockResolvedValue(undefined);

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L100',
      inventoryItem: item,
      opsPublicKeyB64: opsKey,
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => {
        unlocked = true;
      },
      emitAccessEvent,
    });

    expect(result.granted).toBe(true);
    expect(unlocked).toBe(true);
    expect(emitAccessEvent).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('denies when route pass is missing', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
    });
    profile.devices = [createUserDevice('d1', { appDeviceId: 'phone-1' })];

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L100',
      inventoryItem: { kind: 'lock', lock_id: 'L100' },
      opsPublicKeyB64: 'key',
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => undefined,
      emitAccessEvent: vi.fn(),
    });

    expect(result.granted).toBe(false);
    expect(result.denial_reason).toBe('invalid_credential');
  });

  it('denies unsupported device kind', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
    });
    profile.devices = [createUserDevice('d1', { appDeviceId: 'phone-1' })];

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'bridge:B1',
      inventoryItem: { kind: 'bridge', serial: 'B1' },
      opsPublicKeyB64: 'key',
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => undefined,
      emitAccessEvent: vi.fn(),
    });

    expect(result.granted).toBe(false);
  });

  it('denies when user device not found', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
    });
    profile.devices = [createUserDevice('d1', { appDeviceId: 'phone-1' })];

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L1',
      inventoryItem: { kind: 'lock', lock_id: 'L1' },
      opsPublicKeyB64: 'key',
      userProfile: profile,
      appDeviceId: 'missing-phone',
      applyUnlock: () => undefined,
      emitAccessEvent: vi.fn(),
    });

    expect(result.granted).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('denies when route pass fails verification and emits access event', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
      cloudUserId: 'user-1',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: 'bad.jwt.token',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];
    const emitAccessEvent = vi.fn().mockResolvedValue(undefined);

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L1',
      inventoryItem: { kind: 'lock', lock_id: 'L1' },
      opsPublicKeyB64: 'not-a-valid-key',
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => undefined,
      emitAccessEvent,
    });

    expect(result.granted).toBe(false);
    expect(emitAccessEvent).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('grants access_control when cloud id matches aud', async () => {
    const acJwt = await (async () => {
      const { privateKey, publicKey } = await generateKeyPair('EdDSA');
      const jwk = await exportJWK(publicKey);
      const now = Math.floor(Date.now() / 1000);
      const token = await new SignJWT({ sub: 'user-1', aud: ['access_control:cloud-ac-1'] })
        .setProtectedHeader({ alg: 'EdDSA' })
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(privateKey);
      return { jwt: token, opsKey: String(jwk.x) };
    })();

    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
      cloudUserId: 'user-1',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: acJwt.jwt,
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];

    let unlocked = false;
    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'access_control:AC1',
      inventoryItem: { kind: 'access_control', access_id: 'AC1' },
      opsPublicKeyB64: acJwt.opsKey,
      userProfile: profile,
      appDeviceId: 'phone-1',
      resolveCloudDeviceId: async () => 'cloud-ac-1',
      applyUnlock: () => {
        unlocked = true;
      },
      emitAccessEvent: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.granted).toBe(true);
    expect(unlocked).toBe(true);
  });

  it('denies when ops key missing', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'T',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];

    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L1',
      inventoryItem: { kind: 'lock', lock_id: 'L1' },
      opsPublicKeyB64: '',
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => undefined,
      emitAccessEvent: vi.fn(),
    });

    expect(result.denial_reason).toBe('internal_error');
  });

  it('returns granted when unlock succeeds but access event fails', async () => {
    const { jwt, opsKey } = await signedPass('L100');
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://localhost',
      email: 't@t.com',
      password: 'x',
      cloudUserId: 'user-1',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt,
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];

    let unlocked = false;
    const result = await tryOpenLockWithUserDevice({
      facilityId: 'fac-1',
      gatewayId: 'gw-1',
      deviceKey: 'lock:L100',
      inventoryItem: { kind: 'lock', lock_id: 'L100', locked: true, state: 'CLOSED' },
      opsPublicKeyB64: opsKey,
      userProfile: profile,
      appDeviceId: 'phone-1',
      applyUnlock: () => {
        unlocked = true;
      },
      emitAccessEvent: vi.fn().mockRejectedValue(new Error('Device not found in cloud')),
    });

    expect(result.granted).toBe(true);
    expect(result.lockUpdated).toBe(true);
    expect(unlocked).toBe(true);
    expect(result.message).toContain('failed to report access event');
  });
});
