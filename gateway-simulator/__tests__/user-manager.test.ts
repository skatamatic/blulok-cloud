import { describe, expect, it, vi } from 'vitest';
import { UserManager } from '../src/main/core/UserManager';
import { createMockStore, sampleUserProfile } from './helpers/mock-store';
import { createUserDevice, createLinkedUserDevice } from '../src/main/users/user-device.utils';

describe('UserManager', () => {
  it('creates user and persists profile', async () => {
    const store = createMockStore();
    const manager = new UserManager({ store, generateId: () => 'user-1' });
    const state = manager.createUser({
      label: 'Tenant',
      backendUrl: 'http://127.0.0.1:3000',
      email: 'tenant@test.com',
      password: 'secret',
    });
    expect(state.id).toBe('user-1');
    expect(store.saveUserProfile).toHaveBeenCalled();
  });

  it('adds device with generated keys', async () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const manager = new UserManager({ store, generateId: () => 'dev-1' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1' })]);
    const state = manager.addDevice('u1');
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]?.publicKeyB64).toBeTruthy();
  });

  it('imports cloud user with devices and cached session', async () => {
    const store = createMockStore();
    const sessionProvider = {
      getBackendUrl: () => 'http://127.0.0.1:3000',
      fetchCloudUser: vi.fn().mockResolvedValue({
        id: 'cloud-u1',
        email: 'tenant@test.com',
        firstName: 'Test',
        lastName: 'Tenant',
        role: 'tenant',
        isActive: true,
        devices: [{
          id: 'dev-backend-1',
          app_device_id: 'app-1',
          platform: 'ios',
          device_name: 'iPhone',
          public_key: Buffer.from('abc').toString('base64'),
          status: 'active',
        }],
      }),
      mintUserSession: vi.fn().mockResolvedValue({
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
        expiresAt: 9999999999,
        user: { id: 'cloud-u1', email: 'tenant@test.com', firstName: 'Test', lastName: 'Tenant', role: 'tenant' },
        opsPublicKeyB64: 'ops-key',
      }),
    };
    const manager = new UserManager({ store, generateId: () => 'user-1', sessionProvider });
    const state = await manager.importCloudUser({ cloudUserId: 'cloud-u1' });
    expect(state.loggedIn).toBe(true);
    expect(state.devices).toHaveLength(1);
    expect(state.devices[0]?.linkedFromBackend).toBe(true);
    expect(sessionProvider.mintUserSession).toHaveBeenCalledWith('cloud-u1');
  });

  it('login stores session via mobile api', async () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const mobileApi = {
      login: vi.fn().mockResolvedValue({
        token: 'tok',
        userId: 'cloud-u1',
        email: 'tenant@test.com',
        role: 'tenant',
        opsPublicKeyB64: 'ops-key',
      }),
      registerKey: vi.fn(),
      requestRoutePass: vi.fn(),
    };
    const manager = new UserManager({ store, generateId: () => 'x', mobileApi: mobileApi as never });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1' })]);
    manager.addDevice('u1');
    const state = await manager.loginUser('u1');
    expect(state.loggedIn).toBe(true);
    expect(state.cloudUserId).toBe('cloud-u1');
    expect(mobileApi.login).toHaveBeenCalled();
  });

  it('fetchRoutePass caches jwt on device', async () => {
    const profile = sampleUserProfile({ id: 'u1' });
    const device = createUserDevice('d1');
    device.backendDeviceId = 'backend-dev';
    device.registeredAt = new Date().toISOString();
    profile.devices = [device];
    profile.sessionToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig';

    const store = createMockStore([], [profile]);
    const mobileApi = {
      login: vi.fn(),
      registerKey: vi.fn(),
      requestRoutePass: vi.fn().mockResolvedValue({
        routePass: 'header.payload.sig',
        expiresAt: 9999999999,
      }),
    };
    const manager = new UserManager({ store, generateId: () => 'x', mobileApi: mobileApi as never });
    manager.loadFromProfiles([structuredClone(profile)]);

    const state = await manager.fetchRoutePass('u1', 'd1', 'fac-1', 'Site A');
    expect(state.devices[0]?.cachedRoutePasses).toHaveLength(1);
    expect(state.devices[0]?.cachedRoutePasses[0]?.facilityId).toBe('fac-1');
  });

  it('setRoutePassTamper updates cached pass', () => {
    const profile = sampleUserProfile({ id: 'u1' });
    const device = createUserDevice('d1');
    device.cachedRoutePasses = [{
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    }];
    profile.devices = [device];
    const store = createMockStore([], [profile]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([profile]);
    const state = manager.setRoutePassTamper('u1', 'd1', { facilityId: 'fac-1', tamper: 'force_expired' });
    expect(state.devices[0]?.cachedRoutePasses[0]?.tamper).toBe('force_expired');
  });

  it('regenerateDeviceKeys clears registration and passes', () => {
    const profile = sampleUserProfile({ id: 'u1' });
    const device = createUserDevice('d1');
    device.backendDeviceId = 'backend-1';
    device.registeredAt = new Date().toISOString();
    device.cachedRoutePasses = [{
      facilityId: 'fac-1',
      jwt: 'a.b.c',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    }];
    profile.devices = [device];
    const store = createMockStore([], [profile]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([profile]);
    const state = manager.regenerateDeviceKeys('u1', 'd1');
    expect(state.devices[0]?.registered).toBe(false);
    expect(state.devices[0]?.cachedRoutePasses).toHaveLength(0);
  });

  it('registerDevice throws when not logged in', async () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1', password: undefined, sessionToken: undefined })]);
    manager.addDevice('u1');
    const deviceId = manager.getState('u1')!.devices[0]!.id;
    await expect(manager.registerDevice('u1', deviceId)).rejects.toThrow('Session expired');
  });

  it('updateUser mutates profile fields', () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1' })]);
    const state = manager.updateUser('u1', { label: 'New Label', password: 'newpass' });
    expect(state.label).toBe('New Label');
  });

  it('removeUser deletes profile', () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1' })]);
    manager.removeUser('u1');
    expect(manager.getState('u1')).toBeNull();
  });

  it('refreshes imported cloud user session when jwt expired', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sig';
    const profile = sampleUserProfile({
      id: 'u1',
      importedFromCloud: true,
      cloudUserId: 'cloud-u1',
      sessionToken: expiredToken,
      sessionTokenExpiresAt: 1,
    });
    const store = createMockStore([], [profile]);
    const sessionProvider = {
      getBackendUrl: () => 'http://127.0.0.1:3000',
      fetchCloudUser: vi.fn(),
      mintUserSession: vi.fn().mockResolvedValue({
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
        expiresAt: 9999999999,
        user: { id: 'cloud-u1', email: 'tenant@test.com', firstName: 'Test', lastName: 'User', role: 'tenant' },
        opsPublicKeyB64: 'ops-key',
      }),
    };
    const manager = new UserManager({ store, generateId: () => 'x', sessionProvider });
    manager.loadFromProfiles([structuredClone(profile)]);
    manager.addDevice('u1');

    const state = await manager.loginUser('u1');

    expect(sessionProvider.mintUserSession).toHaveBeenCalledWith('cloud-u1');
    expect(state.loggedIn).toBe(true);
    expect(state.opsPublicKeyB64).toBe('ops-key');
  });

  it('re-logs in with password when jwt expired for manual users', async () => {
    const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.sig';
    const profile = sampleUserProfile({
      id: 'u1',
      password: 'secret',
      sessionToken: expiredToken,
      sessionTokenExpiresAt: 1,
    });
    const store = createMockStore([], [profile]);
    const mobileApi = {
      login: vi.fn().mockResolvedValue({
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
        userId: 'cloud-u1',
        email: 'tenant@test.com',
        role: 'tenant',
        keyGenerationRequired: false,
        isDeviceRegistered: true,
        opsPublicKeyB64: 'ops-key',
      }),
      registerKey: vi.fn(),
      requestRoutePass: vi.fn(),
    };
    const manager = new UserManager({ store, generateId: () => 'x', mobileApi: mobileApi as never });
    manager.loadFromProfiles([structuredClone(profile)]);
    const device = manager.addDevice('u1').devices[0]!;

    const state = await manager.loginUser('u1', device.appDeviceId);

    expect(mobileApi.login).toHaveBeenCalledWith(
      profile.backendUrl,
      profile.email,
      profile.password,
      device.appDeviceId,
      device.platform,
    );
    expect(state.loggedIn).toBe(true);
  });

  it('clears route pass and returns route pass details', async () => {
    const profile = sampleUserProfile({ id: 'u1' });
    const device = createUserDevice('d1');
    device.cachedRoutePasses = [{
      facilityId: 'fac-1',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
      fetchedAt: new Date().toISOString(),
      tamper: 'none',
    }];
    profile.devices = [device];
    const store = createMockStore([], [profile]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([structuredClone(profile)]);

    const details = manager.getRoutePassDetails('u1', 'd1', 'fac-1');
    expect(details.jwt).toBe(device.cachedRoutePasses[0]?.jwt);

    const cleared = manager.clearRoutePass('u1', 'd1', 'fac-1');
    expect(cleared.devices[0]?.cachedRoutePasses).toHaveLength(0);
  });

  it('removeDevice drops device from profile', () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1' })]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1' })]);
    const deviceId = manager.addDevice('u1').devices[0]!.id;
    const state = manager.removeDevice('u1', deviceId);
    expect(state.devices).toHaveLength(0);
  });

  it('registerDevice rejects cloud-linked devices without local keys', async () => {
    const profile = sampleUserProfile({
      id: 'u1',
      sessionToken: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
    });
    profile.devices = [
      createLinkedUserDevice('linked-1', {
        id: 'backend-dev-1',
        app_device_id: 'app-1',
        platform: 'ios',
        device_name: 'Cloud phone',
        public_key: Buffer.from('abc').toString('base64'),
        status: 'active',
      }),
    ];
    const store = createMockStore([], [profile]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([structuredClone(profile)]);

    await expect(manager.registerDevice('u1', 'linked-1')).rejects.toThrow('no local keys');
  });

  it('importProfile replaces in-memory profile', () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1', label: 'Old' })]);
    const manager = new UserManager({ store, generateId: () => 'x' });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1', label: 'Old' })]);
    manager.importProfile(sampleUserProfile({ id: 'u1', label: 'Imported' }));
    expect(manager.getState('u1')?.label).toBe('Imported');
  });

  it('importCloudUser rejects duplicate cloud users', async () => {
    const store = createMockStore([], [sampleUserProfile({ id: 'u1', cloudUserId: 'cloud-u1' })]);
    const sessionProvider = {
      getBackendUrl: () => 'http://127.0.0.1:3000',
      fetchCloudUser: vi.fn(),
      mintUserSession: vi.fn(),
    };
    const manager = new UserManager({ store, generateId: () => 'x', sessionProvider });
    manager.loadFromProfiles([sampleUserProfile({ id: 'u1', cloudUserId: 'cloud-u1' })]);

    await expect(manager.importCloudUser({ cloudUserId: 'cloud-u1' })).rejects.toThrow(
      'already in the simulator',
    );
  });

  it('importCloudUser requires admin session provider', async () => {
    const manager = new UserManager({ store: createMockStore(), generateId: () => 'x' });
    await expect(manager.importCloudUser({ cloudUserId: 'cloud-u1' })).rejects.toThrow(
      /Admin sign-in required/,
    );
  });

  it('importCloudUser requires configured backend URL', async () => {
    const manager = new UserManager({
      store: createMockStore(),
      generateId: () => 'x',
      sessionProvider: { getBackendUrl: () => '', fetchCloudUser: vi.fn(), mintUserSession: vi.fn() },
    });
    await expect(manager.importCloudUser({ cloudUserId: 'cloud-u1' })).rejects.toThrow(
      /Backend URL not configured/,
    );
  });

  it('importCloudUser uses phone and cloud id fallbacks for identity', async () => {
    const store = createMockStore();
    const sessionProvider = {
      getBackendUrl: () => 'http://127.0.0.1:3000',
      fetchCloudUser: vi.fn().mockResolvedValue({
        id: 'cloud-u2',
        phoneNumber: '+15551234567',
        firstName: '',
        lastName: '',
        role: 'tenant',
        isActive: true,
        devices: [],
      }),
      mintUserSession: vi.fn().mockResolvedValue({
        token: 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig',
        expiresAt: 9999999999,
        user: { id: 'cloud-u2', email: '', firstName: '', lastName: '', role: 'tenant' },
      }),
    };
    const manager = new UserManager({ store, generateId: () => 'user-2', sessionProvider });
    const state = await manager.importCloudUser({ cloudUserId: 'cloud-u2' });

    expect(state.email).toBe('+15551234567');
    expect(state.label).toBe('+15551234567');
  });
});
