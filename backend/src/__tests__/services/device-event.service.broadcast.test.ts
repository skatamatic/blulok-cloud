/**
 * Covers DeviceEventService.initialize() + internal listeners that broadcast via WebSocketService.
 * Complements device-telemetry-event.test.ts (emit wrappers only).
 */

const mockBroadcastUnitsUpdate = jest.fn().mockResolvedValue(undefined);
const mockBroadcastDeviceStatusUpdate = jest.fn().mockResolvedValue(undefined);
const mockBroadcastBatteryStatusUpdate = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn(() => ({
      broadcastUnitsUpdate: mockBroadcastUnitsUpdate,
      broadcastDeviceStatusUpdate: mockBroadcastDeviceStatusUpdate,
      broadcastBatteryStatusUpdate: mockBroadcastBatteryStatusUpdate,
    })),
  },
}));

import { DeviceEventService, DeviceEvent } from '@/services/device-event.service';

async function flushEventListeners(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe('DeviceEventService broadcast listeners', () => {
  beforeEach(() => {
    (DeviceEventService as unknown as { instance?: DeviceEventService }).instance = undefined;
    mockBroadcastUnitsUpdate.mockClear();
    mockBroadcastDeviceStatusUpdate.mockClear();
    mockBroadcastBatteryStatusUpdate.mockClear();
  });

  it('after initialize, DEVICE_TELEMETRY_UPDATED triggers unit, device, and battery broadcasts', async () => {
    const svc = DeviceEventService.getInstance();
    svc.initialize();

    svc.emitDeviceTelemetryUpdated({
      deviceId: 'dev-telemetry-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });

    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalledTimes(1);
    expect(mockBroadcastDeviceStatusUpdate).toHaveBeenCalledWith('dev-telemetry-1', 'fac-1');
    expect(mockBroadcastBatteryStatusUpdate).toHaveBeenCalledTimes(1);
  });

  it('after initialize, LOCK_STATUS_CHANGED with transitional status skips lock activity but still broadcasts', async () => {
    const svc = DeviceEventService.getInstance();
    svc.initialize();

    svc.emitLockStatusChanged({
      deviceId: 'dev-lock-1',
      oldStatus: 'locked',
      newStatus: 'locking',
      gatewayId: 'gw-1',
      unitId: 'unit-1',
    });

    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalled();
    expect(mockBroadcastDeviceStatusUpdate).toHaveBeenCalledWith('dev-lock-1');
  });

  it('after initialize, DEVICE_STATUS_CHANGED triggers unit, battery, and per-device broadcasts', async () => {
    const svc = DeviceEventService.getInstance();
    svc.initialize();

    svc.emitDeviceStatusChanged({
      deviceId: 'dev-status-1',
      deviceType: 'blulok',
      oldStatus: 'online',
      newStatus: 'offline',
      gatewayId: 'gw-1',
    });

    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalled();
    expect(mockBroadcastBatteryStatusUpdate).toHaveBeenCalled();
    expect(mockBroadcastDeviceStatusUpdate).toHaveBeenCalledWith('dev-status-1');
  });

  it('initialize is idempotent (does not register duplicate handlers)', async () => {
    (DeviceEventService as unknown as { instance?: DeviceEventService }).instance = undefined;
    const svc = DeviceEventService.getInstance();
    svc.initialize();
    svc.initialize();

    mockBroadcastUnitsUpdate.mockClear();
    svc.emitDeviceTelemetryUpdated({ deviceId: 'd1' });
    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalledTimes(1);
  });

  it('after initialize, DEVICE_UNASSIGNED broadcasts units update', async () => {
    const svc = DeviceEventService.getInstance();
    svc.initialize();

    svc.emitDeviceUnassigned({
      deviceId: 'dev-unassign-1',
      unitId: 'unit-1',
      facilityId: 'fac-1',
    });

    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalledTimes(1);
    expect(mockBroadcastDeviceStatusUpdate).not.toHaveBeenCalled();
  });

  it('after initialize, DEVICE_REMOVED broadcasts units update', async () => {
    const svc = DeviceEventService.getInstance();
    svc.initialize();

    svc.emitDeviceRemoved({
      deviceId: 'dev-removed-1',
      deviceType: 'blulok',
      gatewayId: 'gw-1',
    });

    await flushEventListeners();

    expect(mockBroadcastUnitsUpdate).toHaveBeenCalledTimes(1);
    expect(mockBroadcastDeviceStatusUpdate).not.toHaveBeenCalled();
  });

  it('exposes DeviceEvent enum used by listeners', () => {
    expect(DeviceEvent.DEVICE_TELEMETRY_UPDATED).toBe('deviceTelemetryUpdated');
  });
});
