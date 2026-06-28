import { describe, expect, it, vi } from 'vitest';
import type { AuthOkMessage } from '../src/protocol/messages';
import { SimulatedGateway } from '../src/main/core/SimulatedGateway';
import type { GatewayConnectionOptions } from '../src/main/net/GatewayConnection';
import { DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION } from '../src/main/core/gateway-firmware.utils';
import { createMockStore } from './helpers/mock-store';
import { createMockTransport, type MockTransport } from './helpers/mock-transport';
import type { GatewayTransport } from '../src/main/core/SimulatedGateway';

function buildGateway(options?: {
  proxyStatus?: number;
  proxyBody?: unknown;
  initialSessionRole?: AuthOkMessage['sessionRole'];
  autoProxyResponse?: boolean;
  gatewayFirmwareVersion?: string;
  proxyResponder?: (
    req: { method?: string; path?: string; id: string },
    callIndex: number,
  ) => { status: number; body: unknown };
}) {
  const store = createMockStore();
  const onUpdate = vi.fn();
  const onLog = vi.fn();
  let capturedConnectionOptions: GatewayConnectionOptions | undefined;
  const initialAuth: AuthOkMessage = {
    type: 'AUTH_OK',
    facilityId: 'fac-1',
    gatewayId: 'cloud-gw-1',
    sessionRole: options?.initialSessionRole ?? 'active',
  };

  const gateway = new SimulatedGateway({
    id: 'gw-1',
    label: 'Test',
    backendUrl: 'http://127.0.0.1:3000',
    facilityId: 'fac-1',
    gatewayId: 'cloud-gw-1',
    token: 'tok',
    gatewayFirmwareVersion: options?.gatewayFirmwareVersion,
    store,
    onUpdate,
    onLog,
    createTransport: (opts) => {
      capturedConnectionOptions = opts;
      return createMockTransport({
        authOk: initialAuth,
        autoProxyResponse: options?.autoProxyResponse ?? !options?.proxyResponder,
        proxyStatus: options?.proxyStatus,
        proxyBody: options?.proxyBody,
        proxyResponder: options?.proxyResponder,
        onSessionRoleChanged: opts.onSessionRoleChanged,
      }) as unknown as GatewayTransport;
    },
  });

  const transport = gateway['connection'] as MockTransport | null;

  return {
    gateway,
    transport,
    store,
    onUpdate,
    onLog,
    getTransport: () => gateway['connection'] as MockTransport | null,
    getConnectionOptions: () => capturedConnectionOptions,
  };
}

describe('SimulatedGateway', () => {
  it('connects, syncs inventory, and sets connected state', async () => {
    const { gateway } = buildGateway();
    await gateway.connect();
    expect(gateway.getState().connectionStatus).toBe('connected');
    expect(gateway.getState().sessionRole).toBe('active');
  });

  it('responds to PING when respondToPing is enabled', async () => {
    const { gateway, getTransport } = buildGateway();
    await gateway.connect();
    const transport = getTransport()!;
    transport.emitMessage({ type: 'PING' });
    expect(transport.sent.some((m) => (m as { type?: string }).type === 'PONG')).toBe(true);
  });

  it('applySettings updates label, name, and serial on the instance', async () => {
    const { gateway } = buildGateway();
    gateway.applySettings({ label: ' New Label ', gatewayName: ' Cloud ', gatewaySerial: ' SN-1 ' });

    const state = gateway.getState();
    expect(state.label).toBe('New Label');
    expect(state.gatewayName).toBe('Cloud');
    expect(state.gatewaySerial).toBe('SN-1');
    expect(state.devices.some((d) => d.kind === 'gateway')).toBe(false);
  });

  it('rejects gateway devices in local inventory', async () => {
    const { gateway } = buildGateway();
    await expect(gateway.addDevice('gateway')).rejects.toThrow(/cannot be added/i);
  });

  it('skips inventory sync on connect when session is swap_candidate', async () => {
    const { gateway, onLog } = buildGateway({
      initialSessionRole: 'swap_candidate',
      proxyStatus: 403,
      proxyBody: {
        success: false,
        code: 'not_bound_gateway',
        message: 'Inventory and state sync are only accepted from the bound production gateway — complete swap recovery first',
      },
    });
    await gateway.connect();
    expect(gateway.getState().sessionRole).toBe('swap_candidate');
    expect(gateway.getState().connectionWarning).toContain('swap candidate');
    expect(
      onLog.mock.calls.some((call) =>
        String((call[0] as { summary?: string })?.summary ?? '').toLowerCase().includes('inventory sync skipped'),
      ),
    ).toBe(true);
    expect(
      onLog.mock.calls.some((call) =>
        String((call[0] as { summary?: string })?.summary ?? '').includes('Inventory sync HTTP 403'),
      ),
    ).toBe(false);
  });

  it('syncState throws with backend message when proxy returns not_bound_gateway', async () => {
    const { gateway } = buildGateway({
      initialSessionRole: 'swap_candidate',
      proxyStatus: 403,
      proxyBody: {
        success: false,
        code: 'not_bound_gateway',
        message: 'Inventory and state sync are only accepted from the bound production gateway — complete swap recovery first',
      },
    });
    await gateway.addDevice('lock');
    await gateway.connect();
    await expect(gateway.syncState()).rejects.toThrow(/bound production gateway/);
    expect(gateway.getState().connectionWarning).toContain('bound production gateway');
  });

  it('syncInventory throws when proxy returns error', async () => {
    const { gateway } = buildGateway({ proxyStatus: 423, proxyBody: { code: 'RECOVERY', message: 'blocked' } });
    await gateway.connect();
    await expect(gateway.syncInventory()).rejects.toThrow();
    expect(gateway.getState().connectionWarning).toBeTruthy();
  });

  it('defaults gateway firmware for AUTH seeding', () => {
    const { gateway } = buildGateway();
    expect(gateway.getState().gatewayFirmwareVersion).toBe(DEFAULT_SIMULATOR_GATEWAY_FIRMWARE_VERSION);
  });

  it('passes gateway firmware to transport for WS AUTH on connect', async () => {
    const { gateway, getConnectionOptions } = buildGateway({ gatewayFirmwareVersion: '2.4.1' });
    await gateway.connect();
    expect(getConnectionOptions()?.firmwareVersion).toBe('2.4.1');
  });

  it('does not include gateway self row in inventory sync payload', async () => {
    const { gateway, getTransport } = buildGateway({ gatewayFirmwareVersion: '2.4.1' });
    gateway.applySettings({ gatewaySerial: 'SIM-GW-001' });
    await gateway.connect();

    const inventoryRequest = getTransport()!.sent.find(
      (msg) =>
        (msg as { type?: string; path?: string }).type === 'PROXY_REQUEST'
        && (msg as { path?: string }).path === '/internal/gateway/devices/inventory',
    ) as { body?: { devices?: Array<{ kind: string }> } } | undefined;

    expect(inventoryRequest?.body?.devices?.some((d) => d.kind === 'gateway')).toBe(false);
  });

  it('resetState restores defaults and clears devices', async () => {
    const { gateway } = buildGateway();
    await gateway.addDevice('lock');
    gateway.setBehavior({ autoReconnect: false });
    gateway.resetState();
    expect(gateway.getState().devices).toHaveLength(0);
    expect(gateway.getState().behavior.autoReconnect).toBe(true);
  });

  it('updates session role when cloud sends AUTH_OK mid-session', async () => {
    const { gateway, getTransport, onUpdate } = buildGateway({
      initialSessionRole: 'swap_candidate',
      proxyBody: { devices: [], success: true },
    });
    await gateway.connect();
    expect(gateway.getState().sessionRole).toBe('swap_candidate');

    getTransport()!.emitMessage({
      type: 'AUTH_OK',
      facilityId: 'fac-1',
      gatewayId: 'cloud-gw-1',
      sessionRole: 'active',
    });

    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
      expect(gateway.getState().sessionRole).toBe('active');
    });
  });

  it('retries inventory sync after role promotion when cloud initially returns not_bound', async () => {
    vi.useFakeTimers();
    let inventorySyncCalls = 0;
    const { gateway } = buildGateway({
      initialSessionRole: 'swap_candidate',
      proxyResponder: (_req, callIndex) => {
        inventorySyncCalls = callIndex;
        if (callIndex <= 2) {
          return {
            status: 403,
            body: { code: 'not_bound_gateway', message: 'not bound yet' },
          };
        }
        return { status: 200, body: { success: true, data: { operational_devices: [] } } };
      },
    });

    await gateway.connect();
    expect(gateway.getState().connectionWarning).toBeTruthy();

    gateway['connection']!.emitMessage({
      type: 'AUTH_OK',
      facilityId: 'fac-1',
      gatewayId: 'cloud-gw-1',
      sessionRole: 'active',
    });

    await vi.advanceTimersByTimeAsync(3000);
    await vi.waitFor(() => {
      expect(inventorySyncCalls).toBeGreaterThanOrEqual(3);
      expect(gateway.getState().connectionWarning).toBeUndefined();
    });
    vi.useRealTimers();
  });

  it('disconnect clears connected state', async () => {
    const { gateway } = buildGateway();
    await gateway.connect();
    gateway.disconnect();
    expect(gateway.getState().connectionStatus).toBe('disconnected');
    expect(gateway.getState().reconnectAt).toBeUndefined();
  });

  it('does not auto-reconnect after manual disconnect', async () => {
    vi.useFakeTimers();
    const { gateway, getTransport } = buildGateway();
    await gateway.connect();
    const transport = getTransport()!;
    gateway.disconnect();
    transport.emitClose(1000, 'closed');
    vi.advanceTimersByTime(5000);
    expect(gateway.getState().connectionStatus).toBe('disconnected');
    expect(gateway.getState().reconnectAt).toBeUndefined();
    vi.useRealTimers();
  });

  it('schedules auto-reconnect after unexpected connection drop', async () => {
    vi.useFakeTimers();
    const { gateway, getTransport } = buildGateway();
    await gateway.connect();
    getTransport()!.emitClose(1006, 'abnormal');
    const state = gateway.getState();
    expect(state.connectionStatus).toBe('disconnected');
    expect(state.reconnectAt).toBeGreaterThan(Date.now());
    vi.useRealTimers();
  });

  it('persists connectOnRestore after successful connect', async () => {
    const { gateway, store } = buildGateway();
    await gateway.connect();
    await gateway.persist();
    expect(store.saveProfile).toHaveBeenCalled();
    const saved = (store.saveProfile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(saved?.connectOnRestore).toBe(true);
  });

  it('clears connectOnRestore on manual disconnect', async () => {
    const { gateway, store } = buildGateway();
    await gateway.connect();
    gateway.disconnect();
    const saved = (store.saveProfile as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    expect(saved?.connectOnRestore).toBe(false);
  });

  it('syncState posts device updates via proxy', async () => {
    const { gateway } = buildGateway();
    await gateway.addDevice('lock');
    await gateway.connect();
    await gateway.syncState();
    expect(gateway.getState().events.some((e) => e.summary.includes('State sync'))).toBe(true);
  });

  it('simulateAccessEvent validates connection and cloud lookup', async () => {
    const { gateway } = buildGateway();
    const item = await gateway.addDevice('lock');
    const key = SimulatedGateway.deviceKeyForItem(item);

    await expect(
      gateway.simulateAccessEvent({
        deviceKey: key,
        action: 'access_granted',
        method: 'app',
        success: true,
      }),
    ).rejects.toThrow(/Not connected/);

    await gateway.connect();
    await expect(
      gateway.simulateAccessEvent({
        deviceKey: key,
        action: 'access_granted',
        method: 'app',
        success: true,
      }),
    ).rejects.toThrow(/sync inventory/);
  });

  it('simulateAccessEvent rejects unknown device keys', async () => {
    const { gateway } = buildGateway();
    await gateway.connect();
    await expect(
      gateway.simulateAccessEvent({
        deviceKey: 'lock:missing',
        action: 'access_granted',
        method: 'app',
        success: true,
      }),
    ).rejects.toThrow(/Device not found/);
  });

  it('connect failure sets error state', async () => {
    const store = createMockStore();
    const transport = createMockTransport();
    transport.connect.mockRejectedValueOnce(new Error('auth failed'));
    const gateway = new SimulatedGateway({
      id: 'gw-err',
      label: 'Err',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'g1',
      token: 'tok',
      store,
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      createTransport: () => transport as never,
    });

    await expect(gateway.connect()).rejects.toThrow(/auth failed/);
    expect(gateway.getState().connectionStatus).toBe('error');
  });

  it('syncState throws when proxy returns HTTP error', async () => {
    const transport = createMockTransport({ proxyStatus: 500, proxyBody: { message: 'fail' } });
    const gateway = new SimulatedGateway({
      id: 'gw-sync-err',
      label: 'Test',
      backendUrl: 'http://127.0.0.1:3000',
      facilityId: 'fac-1',
      gatewayId: 'g1',
      token: 'tok',
      store: createMockStore(),
      onUpdate: vi.fn(),
      onLog: vi.fn(),
      createTransport: () => transport as never,
    });
    await gateway.addDevice('lock');
    await gateway.connect();
    await expect(gateway.syncState()).rejects.toThrow(/fail/);
  });

  it('setBehavior toggles periodic telemetry configuration', async () => {
    const { gateway } = buildGateway();
    await gateway.connect();
    gateway.setBehavior({ periodicTelemetryMs: 1000 });
    expect(gateway.getState().behavior.periodicTelemetryMs).toBe(1000);
    gateway.setBehavior({ periodicTelemetryMs: 0 });
    expect(gateway.getState().behavior.periodicTelemetryMs).toBe(0);
  });

  it('removeDevice and clearDevices update inventory', async () => {
    const { gateway } = buildGateway();
    const item = await gateway.addDevice('lock');
    const key = SimulatedGateway.deviceKeyForItem(item);
    expect(await gateway.removeDevice(key)).toBe(true);
    expect(gateway.getState().devices).toHaveLength(0);
    await gateway.addDevice('bridge');
    gateway.clearDevices();
    expect(gateway.getState().devices).toHaveLength(0);
  });

  it('unlockDevice opens lock and access_control inventory rows', async () => {
    const { gateway } = buildGateway();
    const lock = await gateway.addDevice('lock');
    const lockKey = SimulatedGateway.deviceKeyForItem(lock);
    await gateway.unlockDevice(lockKey);
    const lockRow = gateway.getState().devices.find((d) => d.kind === 'lock');
    expect(lockRow?.locked).toBe(false);
    expect(lockRow?.state).toBe('OPENED');

    const ac = await gateway.addDevice('access_control');
    const acKey = SimulatedGateway.deviceKeyForItem(ac);
    await gateway.unlockDevice(acKey);
    const acRow = gateway.getState().devices.find((d) => d.kind === 'access_control');
    expect(acRow?.locked).toBe(false);

    expect(gateway.getDeviceRecord(lockKey)?.item.kind).toBe('lock');
  });

  it('syncs inventory when cloud sends INVENTORY_SYNC_REQUEST on active session', async () => {
    const { gateway, getTransport, onLog } = buildGateway();
    await gateway.connect();
    const transport = getTransport();
    expect(transport).toBeTruthy();
    onLog.mockClear();

    transport!.emitMessage({ type: 'INVENTORY_SYNC_REQUEST', reason: 'pre_snapshot' });
    await vi.waitFor(() => {
      expect(
        onLog.mock.calls.some((call) =>
          String((call[0] as { summary?: string })?.summary ?? '').includes('Inventory sync HTTP'),
        ),
      ).toBe(true);
    });
  });
});
