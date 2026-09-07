import { describe, expect, it, vi } from 'vitest';
import { SimulatedGateway } from '../src/main/core/SimulatedGateway';
import type { FileStateStore } from '../src/main/persistence/FileStateStore';
import type { ProxyResponseMessage } from '../src/protocol/messages';

function mockStore(): FileStateStore {
  return {
    saveProfile: vi.fn().mockResolvedValue(undefined),
    loadProfiles: vi.fn().mockResolvedValue([]),
    deleteProfile: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue(null),
    loadSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
    loadAppState: vi.fn().mockResolvedValue({ activeInstanceId: null }),
    saveAppState: vi.fn().mockResolvedValue(undefined),
  };
}

function okProxyResponse(): ProxyResponseMessage {
  return { type: 'PROXY_RESPONSE', id: 'test', status: 200, body: { success: true } };
}

function connectWithLiveSync(
  gateway: SimulatedGateway,
  mocks: { stateSync?: ReturnType<typeof vi.fn>; inventorySync?: ReturnType<typeof vi.fn> },
) {
  const stateSync = mocks.stateSync ?? vi.fn().mockResolvedValue(okProxyResponse());
  const inventorySync = mocks.inventorySync ?? vi.fn().mockResolvedValue(okProxyResponse());
  (gateway as unknown as { connectionStatus: string }).connectionStatus = 'connected';
  (gateway as unknown as { proxy: { stateSync: typeof stateSync; inventorySync: typeof inventorySync } }).proxy = {
    stateSync,
    inventorySync,
  };
  return { stateSync, inventorySync };
}

function expectNoGatewaySelfInInventory(devices: unknown[] | undefined): void {
  expect(devices?.some((d) => (d as { kind?: string }).kind === 'gateway')).toBe(false);
}

describe('SimulatedGateway live state sync', () => {
  it('pushes state to cloud immediately when liveStateSync is enabled', async () => {
    const onUpdate = vi.fn();

    const gateway = new SimulatedGateway({
      id: 'gw-1',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate,
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('lock');
    expect(inventorySync).toHaveBeenCalledTimes(1);
    inventorySync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false });

    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'lock', online: false })]),
    );
    expect(stateSync.mock.calls[0]?.[1][0]).not.toHaveProperty('cloud_device_id');
  });

  it('pushes lock state without cloud_device_id after inventory binding', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-lock-bound',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('lock');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { cloud_device_id: 'cloud-lock-1' } as Partial<typeof item>);
    stateSync.mockClear();
    await gateway.updateDevice(key, { online: false });

    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1][0]).toMatchObject({ kind: 'lock', online: false });
    expect(stateSync.mock.calls[0]?.[1][0]).not.toHaveProperty('cloud_device_id');
  });

  it('pushes full inventory when adding or removing a device with liveStateSync enabled', async () => {
    const onLog = vi.fn();
    const gateway = new SimulatedGateway({
      id: 'gw-add-remove',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog,
      behavior: { liveStateSync: true },
    });

    const { inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('lock');
    expect(inventorySync).toHaveBeenCalledTimes(1);
    expect(inventorySync.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'lock' })]),
    );
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'system',
        summary: expect.stringMatching(/^Inventory sync HTTP 200/),
      }),
    );

    inventorySync.mockClear();
    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.removeDevice(key);
    expect(inventorySync).toHaveBeenCalledTimes(1);
    expectNoGatewaySelfInInventory(inventorySync.mock.calls[0]?.[1]);
    expect(inventorySync.mock.calls[0]?.[1]).toEqual([]);
  });

  it('skips live sync when disconnected', async () => {
    const stateSync = vi.fn().mockResolvedValue(okProxyResponse());
    const inventorySync = vi.fn().mockResolvedValue(okProxyResponse());

    const gateway = new SimulatedGateway({
      id: 'gw-2',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
    });

    // Connected path would sync; leave disconnected (default) to verify the gate.
    (gateway as unknown as { proxy: { stateSync: typeof stateSync; inventorySync: typeof inventorySync } }).proxy = {
      stateSync,
      inventorySync,
    };

    const item = await gateway.addDevice('lock');
    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false });

    expect(inventorySync).not.toHaveBeenCalled();
    expect(stateSync).not.toHaveBeenCalled();
  });

  it('syncs devices whose state changed during profile restore (undo/redo)', async () => {
    const onLog = vi.fn();

    const gateway = new SimulatedGateway({
      id: 'gw-3',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog,
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('lock');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false, locked: true, state: 'CLOSED' });
    stateSync.mockClear();

    const previousDevices = gateway.getState().devices;
    const restoredProfile = gateway.toProfile();
    const sim = gateway.getState().deviceSimByKey[key];
    restoredProfile.deviceRecords = [{
      item: {
        ...item,
        online: true,
        locked: false,
        state: 'OPENED',
      },
      sim: sim!,
    }];
    gateway.importProfile(restoredProfile);
    await gateway.syncLiveAfterProfileRestore(previousDevices);

    expect(inventorySync).not.toHaveBeenCalled();
    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'lock', online: true, state: 'OPENED' })]),
    );
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'system',
        summary: expect.stringMatching(/^Live state sync HTTP 200 \(lock:/),
      }),
    );
  });

  it('syncs inventory when undo/redo changes the device list', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-5',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { inventorySync, stateSync } = connectWithLiveSync(gateway, {});

    await gateway.addDevice('lock');
    inventorySync.mockClear();
    stateSync.mockClear();

    const previousDevices = gateway.getState().devices;
    const restoredProfile = gateway.toProfile();
    restoredProfile.deviceRecords = [];
    gateway.importProfile(restoredProfile);
    await gateway.syncLiveAfterProfileRestore(previousDevices);

    expect(inventorySync).toHaveBeenCalledTimes(1);
    expect(stateSync).not.toHaveBeenCalled();
    expectNoGatewaySelfInInventory(inventorySync.mock.calls[0]?.[1]);
    expect(inventorySync.mock.calls[0]?.[1]).toEqual([]);
  });

  it('pushes access_control telemetry without inventory-only fields', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-ac-state',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('access_control');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDeviceSim(key, { inventoryPatch: { locked: true } });

    expect(inventorySync).not.toHaveBeenCalled();
    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({
        kind: 'access_control',
        access_id: item.access_id,
        locked: true,
      }),
    ]);
    expect(stateSync.mock.calls[0]?.[1][0]).not.toHaveProperty('firmware_version');
  });

  it('routes card-style access_control telemetry edits to state sync', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-ac-card',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('access_control');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false });

    expect(inventorySync).not.toHaveBeenCalled();
    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1][0]).toMatchObject({
      kind: 'access_control',
      access_id: item.access_id,
      online: false,
    });
    expect(stateSync.mock.calls[0]?.[1][0]).not.toHaveProperty('firmware_version');
  });

  it('strips simulator-only fields from access_control inventory sync payloads', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-ac-inv',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('access_control');
    inventorySync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { device_type: 'door' });

    expect(inventorySync).toHaveBeenCalledTimes(1);
    const payload = inventorySync.mock.calls[0]?.[1] as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({ kind: 'access_control', device_type: 'door' });
    expect(payload[0]).not.toHaveProperty('firmware_version');
    expect(payload[0]).not.toHaveProperty('cloud_device_id');
  });

  it('pushes inventory when access_control relay channel changes', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-ac-relay',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('access_control');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDeviceSim(key, { inventoryPatch: { relay_channel: 2 } });

    expect(stateSync).not.toHaveBeenCalled();
    expect(inventorySync).toHaveBeenCalledTimes(1);
    expect(inventorySync.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'access_control', relay_channel: 2 })]),
    );
  });

  it('routes bridge telemetry edits to state sync with trimmed payload', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-bridge-state',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('bridge');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false });

    expect(inventorySync).not.toHaveBeenCalled();
    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1][0]).toMatchObject({
      kind: 'bridge',
      serial: item.serial,
      online: false,
    });
  });

  it('skips profile-restore sync when disconnected', async () => {
    const stateSync = vi.fn().mockResolvedValue(okProxyResponse());

    const gateway = new SimulatedGateway({
      id: 'gw-4',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
    });

    (gateway as unknown as { proxy: { stateSync: typeof stateSync } }).proxy = { stateSync };

    const item = await gateway.addDevice('lock');
    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.updateDevice(key, { online: false });

    const previousDevices = gateway.getState().devices;
    const restoredProfile = gateway.toProfile();
    restoredProfile.devices = [{ ...item, online: true }];
    gateway.importProfile(restoredProfile);
    await gateway.syncLiveAfterProfileRestore(previousDevices);

    expect(stateSync).not.toHaveBeenCalled();
  });

  it('unlockDevice pushes live state sync when enabled', async () => {
    const gateway = new SimulatedGateway({
      id: 'gw-unlock-sync',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'gateway-1',
      token: 'token',
      store: mockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      behavior: { liveStateSync: true },
    });

    const { stateSync, inventorySync } = connectWithLiveSync(gateway, {});

    const item = await gateway.addDevice('lock');
    inventorySync.mockClear();
    stateSync.mockClear();

    const key = SimulatedGateway.deviceKeyForItem(item);
    await gateway.unlockDevice(key);

    expect(stateSync).toHaveBeenCalledTimes(1);
    expect(stateSync.mock.calls[0]?.[1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'lock', locked: false, state: 'OPENED' }),
      ]),
    );
  });
});
