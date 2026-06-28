import { describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { GatewayManager } from '../src/main/core/GatewayManager';
import { createMockStore, sampleProfile } from './helpers/mock-store';
import { createUserDevice, upsertCachedPass } from '../src/main/users/user-device.utils';
import { emptyUserProfile } from '../src/main/persistence/user-profile.utils';
import type { SimulatedGateway } from '../src/main/core/SimulatedGateway';

async function routePassFixture(lockSerial: string) {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const jwk = await exportJWK(publicKey);
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ sub: 'cloud-u1', aud: [`lock:${lockSerial}`] })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  return { jwt, opsKey: String(jwk.x) };
}

function buildMockGateway(overrides: Partial<SimulatedGateway> = {}) {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    persist: vi.fn(),
    importProfile: vi.fn(),
    getState: vi.fn().mockReturnValue({
      id: 'gw-1',
      facilityId: 'fac-1',
      gatewayId: 'cloud-gw',
      opsPublicKey: 'from-gateway',
      devices: [{ kind: 'lock', lock_id: 'L1', locked: true }],
      deviceSimByKey: {},
      behavior: {},
      events: [],
      connectionStatus: 'connected',
    }),
    toProfile: vi.fn(),
    getDeviceRecord: vi.fn().mockReturnValue({
      item: { kind: 'lock', lock_id: 'L1', locked: true, state: 'CLOSED' },
      sim: { denylist: [], facilityId: 'fac-1' },
    }),
    unlockDevice: vi.fn(),
    resolveCloudDeviceId: vi.fn().mockResolvedValue(null),
    simulateAccessEvent: vi.fn().mockResolvedValue(undefined),
    syncLiveAfterProfileRestore: vi.fn(),
    ...overrides,
  } as unknown as SimulatedGateway;
}

describe('GatewayManager user integration', () => {
  it('tryOpenWithUserDevice unlocks when route pass valid', async () => {
    const { jwt, opsKey } = await routePassFixture('L1');
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'Tenant',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@t.com',
      password: 'x',
      cloudUserId: 'cloud-u1',
    });
    const device = createUserDevice('d1', { appDeviceId: 'phone-1' });
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt,
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];
    profile.opsPublicKeyB64 = opsKey;

    const store = createMockStore([sampleProfile({ id: 'gw-1' })], [profile]);
    const mockGw = buildMockGateway({
      getState: vi.fn().mockReturnValue({
        id: 'gw-1',
        facilityId: 'fac-1',
        gatewayId: 'cloud-gw',
        opsPublicKey: opsKey,
        devices: [],
        deviceSimByKey: {},
        behavior: {},
        events: [],
        connectionStatus: 'connected',
      }),
    });

    const manager = new GatewayManager({
      store,
      generateId: () => 'id',
      createGateway: () => mockGw,
    });
    await manager.hydrateFromDisk();

    const result = await manager.tryOpenWithUserDevice('gw-1', {
      deviceKey: 'lock:L1',
      userId: 'u1',
      appDeviceId: 'phone-1',
    });

    expect(result.granted).toBe(true);
    expect(mockGw.unlockDevice).toHaveBeenCalledWith('lock:L1');
    expect(mockGw.simulateAccessEvent).toHaveBeenCalled();
  });

  it('tryOpenWithAccessCode unlocks when code valid and in schedule', async () => {
    const mockGw = buildMockGateway({
      getDeviceRecord: vi.fn().mockReturnValue({
        item: { kind: 'access_control', access_id: 'AC1', relay_channel: 1, locked: true, state: 'CLOSED' },
        sim: {
          denylist: [],
          facilityId: 'fac-1',
          accessCodes: [
            {
              code: '5678',
              valid_from: '2020-01-01T00:00:00.000Z',
              valid_until: '2030-01-01T00:00:00.000Z',
              schedule_name: 'Always',
            },
          ],
        },
      }),
    });

    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const manager = new GatewayManager({
      store,
      generateId: () => 'id',
      createGateway: () => mockGw,
    });
    await manager.hydrateFromDisk();

    const result = await manager.tryOpenWithAccessCode('gw-1', {
      deviceKey: 'access_control:AC1',
      code: '5678',
    });

    expect(result.granted).toBe(true);
    expect(result.schedule_name).toBe('Always');
    expect(mockGw.unlockDevice).toHaveBeenCalledWith('access_control:AC1');
    expect(mockGw.simulateAccessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'keypad',
        action: 'keypad_attempt',
        success: true,
        keypad: expect.objectContaining({ entered_code: '5678' }),
      }),
    );
  });

  it('tryOpenWithAccessCode denies out-of-schedule codes', async () => {
    const sunday = new Date('2025-06-15T12:00:00');
    vi.useFakeTimers();
    vi.setSystemTime(sunday);

    const mockGw = buildMockGateway({
      getDeviceRecord: vi.fn().mockReturnValue({
        item: { kind: 'access_control', access_id: 'AC1', relay_channel: 1, locked: true, state: 'CLOSED' },
        sim: {
          denylist: [],
          facilityId: 'fac-1',
          accessCodes: [
            {
              code: '5678',
              valid_from: '2020-01-01T00:00:00.000Z',
              valid_until: '2030-01-01T00:00:00.000Z',
              time_windows: [{ day_of_week: 1, start_time: '09:00:00', end_time: '17:00:00' }],
            },
          ],
        },
      }),
    });

    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const manager = new GatewayManager({
      store,
      generateId: () => 'id',
      createGateway: () => mockGw,
    });
    await manager.hydrateFromDisk();

    const result = await manager.tryOpenWithAccessCode('gw-1', {
      deviceKey: 'access_control:AC1',
      code: '5678',
    });

    expect(result.granted).toBe(false);
    expect(result.denial_reason).toBe('out_of_schedule');
    expect(mockGw.unlockDevice).not.toHaveBeenCalled();
    expect(mockGw.simulateAccessEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'keypad',
        action: 'access_denied',
        success: false,
        denial_reason: 'out_of_schedule',
      }),
    );

    vi.useRealTimers();
  });

  it('updateUser and regenerate device keys are undoable', async () => {
    const store = createMockStore();
    const manager = new GatewayManager({ store, generateId: () => 'user-1' });
    await manager.hydrateFromDisk();
    await manager.createUser({
      label: 'T',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@t.com',
      password: 'secret',
    });
    await manager.addUserDevice('user-1');
    const deviceId = manager.getUser('user-1')!.devices[0]!.id;

    await manager.updateUser('user-1', { label: 'Renamed' });
    expect(manager.getUser('user-1')?.label).toBe('Renamed');

    await manager.regenerateUserDeviceKeys('user-1', deviceId);
    expect(manager.getUser('user-1')?.devices[0]?.registered).toBe(false);

    await manager.undo();
    expect(manager.getUser('user-1')?.devices[0]?.publicKeyB64).toBeTruthy();
  });

  it('setActiveUser and setSidebarCatalog persist app state', async () => {
    const store = createMockStore();
    const manager = new GatewayManager({ store, generateId: () => 'x' });
    await manager.hydrateFromDisk();
    await manager.setActiveUser('user-abc');
    await manager.setSidebarCatalog('users');
    const state = await manager.getAppStateAsync();
    expect(state.activeUserId).toBe('user-abc');
    expect(state.sidebarCatalog).toBe('users');
  });

  it('delegates login, register, and fetch route pass to UserManager', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'T',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@t.com',
      password: 'x',
    });
    const store = createMockStore([], [profile]);
    const mobileApi = {
      login: vi.fn().mockResolvedValue({
        token: 'tok',
        userId: 'cloud-u1',
        email: 't@t.com',
        role: 'tenant',
        opsPublicKeyB64: 'ops',
      }),
      registerKey: vi.fn().mockResolvedValue({
        deviceId: 'backend-d1',
        appDeviceId: 'phone-1',
        publicKey: 'pk',
      }),
      requestRoutePass: vi.fn().mockResolvedValue({ routePass: 'h.p.s', expiresAt: 999 }),
    };
    const manager = new GatewayManager({
      store,
      generateId: () => 'dev-1',
      mobileApi: mobileApi as never,
    });
    await manager.hydrateFromDisk();
    await manager.addUserDevice('u1', { appDeviceId: 'phone-1' });
    const deviceId = manager.getUser('u1')!.devices[0]!.id;

    await manager.loginUser('u1', 'phone-1');
    await manager.registerUserDevice('u1', deviceId);
    await manager.fetchUserRoutePass('u1', deviceId, 'fac-1');

    expect(mobileApi.login).toHaveBeenCalled();
    expect(mobileApi.registerKey).toHaveBeenCalled();
    expect(mobileApi.requestRoutePass).toHaveBeenCalled();
    expect(manager.listUsers()).toHaveLength(1);
    expect(manager.getUser('missing')).toBeNull();
  });

  it('setUserRoutePassTamper is undoable', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'T',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@t.com',
      password: 'x',
    });
    const device = createUserDevice('d1');
    device.cachedRoutePasses = [{
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    }];
    profile.devices = [device];
    const store = createMockStore([], [profile]);
    const manager = new GatewayManager({ store, generateId: () => 'x' });
    await manager.hydrateFromDisk();

    await manager.setUserRoutePassTamper('u1', 'd1', { facilityId: 'fac-1', tamper: 'force_expired' });
    expect(manager.getUser('u1')?.devices[0]?.cachedRoutePasses[0]?.tamper).toBe('force_expired');
    await manager.undo();
    expect(manager.getUser('u1')?.devices[0]?.cachedRoutePasses[0]?.tamper).toBe('none');
  });

  it('tryOpen throws when user or device missing', async () => {
    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const mockGw = buildMockGateway();
    const manager = new GatewayManager({
      store,
      generateId: () => 'x',
      createGateway: () => mockGw,
    });
    await manager.hydrateFromDisk();
    await expect(
      manager.tryOpenWithUserDevice('gw-1', {
        deviceKey: 'lock:L1',
        userId: 'missing',
        appDeviceId: 'phone',
      }),
    ).rejects.toThrow('User not found');
  });

  it('clearUserRoutePass removes cached pass', async () => {
    const profile = emptyUserProfile({
      id: 'u1',
      label: 'T',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@t.com',
      password: 'x',
    });
    const device = createUserDevice('d1');
    upsertCachedPass(device, {
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    });
    profile.devices = [device];
    const store = createMockStore([], [profile]);
    const manager = new GatewayManager({ store, generateId: () => 'x' });
    await manager.hydrateFromDisk();

    await manager.clearUserRoutePass('u1', 'd1', 'fac-1');
    expect(manager.getUser('u1')?.devices[0]?.cachedRoutePasses).toHaveLength(0);
  });
});
