import { describe, expect, it, vi } from 'vitest';
import { GatewayManager } from '../src/main/core/GatewayManager';
import { BackendClient } from '../src/main/auth/BackendClient';
import { createMockStore, sampleProfile, sampleUserProfile } from './helpers/mock-store';

function jsonResponse(body: unknown, status = 200): Response {
  const payload = JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => payload,
  } as Response;
}

describe('GatewayManager', () => {
  it('hydrates profiles from disk once', async () => {
    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const manager = new GatewayManager({ store, generateId: () => 'new-id' });

    const first = await manager.hydrateFromDisk();
    const second = await manager.hydrateFromDisk();

    expect(first.instances).toHaveLength(1);
    expect(first.instances[0].label).toBe('Test GW');
    expect(second.instances).toHaveLength(1);
    expect(store.loadProfiles).toHaveBeenCalledTimes(1);
  });

  it('reconnects on hydrate when connectOnRestore and autoReconnect are set', async () => {
    const profile = sampleProfile({
      id: 'gw-restore',
      connectOnRestore: true,
      behavior: { autoReconnect: true },
    });
    const store = createMockStore([profile]);
    const connect = vi.fn().mockResolvedValue(undefined);
    const getState = vi.fn().mockReturnValue({ id: 'gw-restore', connectionStatus: 'connected' });
    const manager = new GatewayManager({
      store,
      generateId: () => 'x',
      createGateway: () =>
        ({
          connect,
          disconnect: vi.fn(),
          getState,
          persist: vi.fn(),
        }) as never,
    });

    await manager.hydrateFromDisk();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('creates and removes instances', async () => {
    const store = createMockStore();
    const manager = new GatewayManager({ store, generateId: () => 'inst-1' });

    const created = await manager.createInstance({
      label: 'Sim 1',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      token: 'tok',
    });

    expect(created.id).toBe('inst-1');
    expect(manager.listInstances()).toHaveLength(1);

    await manager.removeInstance('inst-1');
    expect(manager.listInstances()).toHaveLength(0);
    expect(store.deleteProfile).toHaveBeenCalledWith('inst-1');
  });

  it('creates instance with name, serial, and stored session token', async () => {
    const store = createMockStore();
    await store.saveSession({
      backendUrl: 'http://127.0.0.1:3000',
      token: 'saved-tok',
      email: 'user@test.com',
      updatedAt: new Date().toISOString(),
    });
    const api = new BackendClient(vi.fn());
    const manager = new GatewayManager({ store, backendClient: api, generateId: () => 'inst-2' });
    await manager.hydrateFromDisk();

    const created = await manager.createInstance({
      label: 'Tab 2',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayName: 'Cloud Name',
      gatewaySerial: 'SIM-GW-ABC12345',
    });

    expect(created.gatewayName).toBe('Cloud Name');
    expect(created.gatewaySerial).toBe('SIM-GW-ABC12345');
    const profile = await store.getProfile('inst-2');
    expect(profile?.token).toBe('saved-tok');
  });

  it('returns saved session summary', async () => {
    const store = createMockStore();
    await store.saveSession({
      backendUrl: 'http://127.0.0.1:3000',
      token: 'tok',
      email: 'dev@test.com',
      updatedAt: new Date().toISOString(),
    });
    const manager = new GatewayManager({ store, generateId: () => 'x' });

    await expect(manager.getSessionSummary()).resolves.toEqual({
      available: true,
      backendUrl: 'http://127.0.0.1:3000',
      email: 'dev@test.com',
    });
  });

  it('fetchGatewayCloud updates cached name and serial', async () => {
    const profile = sampleProfile({ id: 'gw-1', gatewayId: 'cloud-1' });
    const store = createMockStore([profile]);
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ gateway: { id: 'cloud-1', facility_id: 'fac-1', name: 'Cloud GW', mac_address: 'SN-99' } }),
    );
    const api = new BackendClient(fetchFn);
    const manager = new GatewayManager({ store, backendClient: api, generateId: () => 'x' });
    await manager.hydrateFromDisk();

    const state = await manager.fetchGatewayCloud('gw-1');
    expect(state.gatewayName).toBe('Cloud GW');
    expect(state.gatewaySerial).toBe('SN-99');
  });

  it('updateGatewaySettings patches cloud and local label', async () => {
    const profile = sampleProfile({ id: 'gw-1', gatewayId: 'cloud-1' });
    const store = createMockStore([profile]);
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({ gateway: { id: 'cloud-1', facility_id: 'fac-1', name: 'Renamed', mac_address: 'SN-2' } }),
    );
    const api = new BackendClient(fetchFn);
    const manager = new GatewayManager({ store, backendClient: api, generateId: () => 'x' });
    await manager.hydrateFromDisk();

    const state = await manager.updateGatewaySettings('gw-1', {
      label: 'Tab 2',
      gatewayName: 'Renamed',
      gatewaySerial: 'SN-2',
    });

    expect(state.label).toBe('Tab 2');
    expect(state.gatewayName).toBe('Renamed');
    expect(fetchFn.mock.calls[0][1]?.method).toBe('PUT');
  });

  it('updateGatewaySettings rejects empty cloud name', async () => {
    const profile = sampleProfile({ id: 'gw-1' });
    const store = createMockStore([profile]);
    const manager = new GatewayManager({ store, backendClient: new BackendClient(vi.fn()), generateId: () => 'x' });
    await manager.hydrateFromDisk();

    await expect(manager.updateGatewaySettings('gw-1', { gatewayName: '  ' })).rejects.toThrow(/cannot be empty/);
  });

  it('disconnectAll clears connection state on instances', async () => {
    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const manager = new GatewayManager({ store, generateId: () => 'x' });
    await manager.hydrateFromDisk();
    const states = manager.disconnectAll();
    expect(states[0].connectionStatus).toBe('disconnected');
  });

  it('persistSession saves session and restores API client', async () => {
    const store = createMockStore();
    const api = new BackendClient(vi.fn());
    const manager = new GatewayManager({ store, backendClient: api, generateId: () => 'x' });
    await manager.persistSession('http://127.0.0.1:3000', 'tok', 'user@test.com');
    expect(api.getToken()).toBe('tok');
    expect(store.saveSession).toHaveBeenCalled();
  });

  it('broadcasts gateway updates when window is set', async () => {
    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const send = vi.fn();
    const manager = new GatewayManager({ store, generateId: () => 'x' });
    manager.setWindow({ webContents: { send } } as never);
    await manager.hydrateFromDisk();
    await manager.setBehavior('gw-1', { autoReconnect: false });
    expect(send).toHaveBeenCalled();
  });

  it('connect delegates to simulated gateway instance', async () => {
    const profile = sampleProfile({ id: 'gw-1' });
    const store = createMockStore([profile]);
    const connect = vi.fn().mockResolvedValue(undefined);
    const getState = vi.fn().mockReturnValue({ id: 'gw-1', connectionStatus: 'connected' });
    const manager = new GatewayManager({
      store,
      generateId: () => 'x',
      createGateway: () =>
        ({
          connect,
          disconnect: vi.fn(),
          getState,
          persist: vi.fn(),
        }) as never,
    });
    await manager.hydrateFromDisk();
    await manager.connect('gw-1');
    expect(connect).toHaveBeenCalled();
  });

  it('throws when instance id is unknown', async () => {
    const manager = new GatewayManager({ store: createMockStore(), generateId: () => 'x' });
    await expect(manager.addDevice('missing', 'lock')).rejects.toThrow(/not found/);
  });

  it('delegates device and sync operations to gateway instances', async () => {
    const profile = sampleProfile({ id: 'gw-1' });
    const store = createMockStore([profile]);
    const mock = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      getState: vi.fn().mockReturnValue({
        id: 'gw-1',
        label: 'Test',
        backendUrl: 'http://127.0.0.1:3000',
        facilityId: 'fac-1',
        gatewayId: 'cloud-1',
        connectionStatus: 'connected',
        devices: [],
        behavior: { autoReconnect: true },
        events: [],
      }),
      toProfile: vi.fn(() => profile),
      importProfile: vi.fn(),
      persist: vi.fn(),
      addDevice: vi.fn().mockResolvedValue({ kind: 'lock', lock_id: 'L1', online: true, locked: true }),
      updateDevice: vi.fn().mockResolvedValue({ kind: 'lock', lock_id: 'L1', online: false, locked: true }),
      removeDevice: vi.fn().mockResolvedValue(true),
      clearDevices: vi.fn(),
      syncInventory: vi.fn().mockResolvedValue(undefined),
      syncState: vi.fn().mockResolvedValue(undefined),
      simulateAccessEvent: vi.fn().mockResolvedValue(undefined),
      setBehavior: vi.fn(),
      resetState: vi.fn(),
      applySettings: vi.fn(),
    };

    const manager = new GatewayManager({
      store,
      generateId: () => 'x',
      createGateway: () => mock as never,
    });
    await manager.hydrateFromDisk();

    await manager.addDevice('gw-1', 'lock');
    await manager.updateDevice('gw-1', 'lock:L1', { online: false });
    await manager.removeDevice('gw-1', 'lock:L1');
    await manager.clearDevices('gw-1');
    await manager.syncInventory('gw-1');
    await manager.syncState('gw-1');
    await manager.simulateAccessEvent('gw-1', {
      deviceKey: 'lock:L1',
      action: 'access_granted',
      method: 'app',
      success: true,
    });
    await manager.setBehavior('gw-1', { autoReconnect: false });
    await manager.resetState('gw-1');

    expect(mock.addDevice).toHaveBeenCalled();
    expect(mock.syncInventory).toHaveBeenCalled();
    expect(mock.simulateAccessEvent).toHaveBeenCalled();
  });

  it('undo restores prior device state', async () => {
    const store = createMockStore([sampleProfile({ id: 'gw-1' })]);
    const manager = new GatewayManager({ store, generateId: () => 'new-id' });
    await manager.hydrateFromDisk();

    await manager.addDevice('gw-1', 'lock');
    expect(manager.getInstance('gw-1')?.devices).toHaveLength(1);

    const undone = await manager.undo();
    expect(undone.instances[0]?.devices).toHaveLength(0);
    expect(manager.getHistoryState().canRedo).toBe(true);

    const redone = await manager.redo();
    expect(redone.instances[0]?.devices).toHaveLength(1);
  });

  it('undo restores removed gateway instance', async () => {
    const store = createMockStore();
    const manager = new GatewayManager({ store, generateId: () => 'inst-1' });

    await manager.createInstance({
      label: 'Sim 1',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      token: 'tok',
    });
    expect(manager.listInstances()).toHaveLength(1);

    await manager.removeInstance('inst-1');
    expect(manager.listInstances()).toHaveLength(0);

    await manager.undo();
    expect(manager.listInstances()).toHaveLength(1);
    expect(manager.listInstances()[0].label).toBe('Sim 1');
  });

  it('connectAll skips already connected instances', async () => {
    const profile = sampleProfile({ id: 'gw-1' });
    const store = createMockStore([profile]);
    const connect = vi.fn();
    const manager = new GatewayManager({
      store,
      generateId: () => 'x',
      createGateway: () =>
        ({
          connect,
          disconnect: vi.fn(),
          getState: vi
            .fn()
            .mockReturnValueOnce({ connectionStatus: 'connected' })
            .mockReturnValue({ connectionStatus: 'connected', id: 'gw-1', devices: [], behavior: {}, events: [] }),
          persist: vi.fn(),
        }) as never,
    });
    await manager.hydrateFromDisk();
    await manager.connectAll();
    expect(connect).not.toHaveBeenCalled();
  });

  it('undo restores removed user', async () => {
    const store = createMockStore();
    const manager = new GatewayManager({ store, generateId: () => 'user-1' });
    await manager.hydrateFromDisk();

    await manager.createUser({
      label: 'Tenant',
      backendUrl: 'http://127.0.0.1:3000',
      email: 't@test.com',
      password: 'secret',
    });
    expect(manager.listUsers()).toHaveLength(1);

    await manager.removeUser('user-1');
    expect(manager.listUsers()).toHaveLength(0);

    const undone = await manager.undo();
    expect(undone.users).toHaveLength(1);
    expect(undone.users[0]?.email).toBe('t@test.com');
  });
});
