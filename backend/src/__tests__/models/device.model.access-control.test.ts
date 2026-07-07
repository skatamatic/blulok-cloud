jest.unmock('@/models/device.model');

const mockEmitDeviceStatusChanged = jest.fn();
const mockEmitDeviceTelemetryUpdated = jest.fn();
const mockHasPendingLockCommand = jest.fn().mockReturnValue(false);
const mockHandleAccessControlLockSettled = jest.fn();

jest.mock('@/services/device-event.service', () => ({
  DeviceEventService: {
    getInstance: jest.fn(() => ({
      emitDeviceStatusChanged: mockEmitDeviceStatusChanged,
      emitDeviceTelemetryUpdated: mockEmitDeviceTelemetryUpdated,
    })),
  },
}));

jest.mock('@/services/lock-command.service', () => ({
  LockCommandService: {
    getInstance: jest.fn(() => ({
      hasPendingLockCommand: mockHasPendingLockCommand,
      handleAccessControlLockSettled: mockHandleAccessControlLockSettled,
    })),
  },
}));

import { DeviceModel } from '@/models/device.model';

describe('DeviceModel access control telemetry', () => {
  let model: DeviceModel;
  let mockUpdate: jest.Mock;

  const beforeRow = {
    id: 'ac-1',
    gateway_id: 'gw-1',
    facility_id: 'fac-1',
    name: 'Main Door',
    device_type: 'door' as const,
    relay_channel: 1,
    device_serial: 'KP-001',
    status: 'offline' as const,
    is_locked: true,
    gateway_name: 'Gateway A',
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPendingLockCommand.mockReturnValue(false);
    model = new DeviceModel();

    mockUpdate = jest.fn().mockResolvedValue(1);
    const mockBuilder = {
      where: jest.fn().mockReturnThis(),
      update: mockUpdate,
      first: jest.fn(),
    };
    const mockKnex = jest.fn(() => mockBuilder);
    (model as unknown as { db: { connection: jest.Mock } }).db = { connection: mockKnex };

    jest.spyOn(model, 'findAccessControlDeviceWithGateway').mockResolvedValue(beforeRow);
    jest.spyOn(model, 'findAccessControlDeviceById').mockResolvedValue({
      ...beforeRow,
      status: 'online',
      last_activity: new Date('2026-06-02T15:18:11.039Z'),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits device status changed when online/offline updates', async () => {
    await model.updateAccessControlDevice('ac-1', { status: 'online' });

    expect(mockEmitDeviceStatusChanged).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      deviceType: 'access_control',
      oldStatus: 'offline',
      newStatus: 'online',
      gatewayId: 'gw-1',
    });
    expect(mockEmitDeviceTelemetryUpdated).not.toHaveBeenCalled();
  });

  it('emits telemetry when only last_activity updates', async () => {
    jest.spyOn(model, 'findAccessControlDeviceWithGateway').mockResolvedValue({
      ...beforeRow,
      status: 'online',
    });

    await model.updateAccessControlDevice('ac-1', {
      last_activity: new Date('2026-06-02T15:18:11.039Z'),
    });

    expect(mockEmitDeviceStatusChanged).not.toHaveBeenCalled();
    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
  });

  it('emits telemetry when lock state changes', async () => {
    await model.updateAccessControlDevice('ac-1', { is_locked: false });

    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
    expect(mockHandleAccessControlLockSettled).toHaveBeenCalledWith('ac-1', false);
  });

  it('emits telemetry when gateway reports unchanged lock during pending remote command', async () => {
    mockHasPendingLockCommand.mockReturnValue(true);

    await model.updateAccessControlDevice('ac-1', { is_locked: true });

    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
    expect(mockHandleAccessControlLockSettled).toHaveBeenCalledWith('ac-1', true);
  });

  it('does not emit telemetry when unchanged lock is reported with no pending command', async () => {
    await model.updateAccessControlDevice('ac-1', { is_locked: true });

    expect(mockEmitDeviceTelemetryUpdated).not.toHaveBeenCalled();
    expect(mockHandleAccessControlLockSettled).toHaveBeenCalledWith('ac-1', true);
  });

  it('emits telemetry when name changes without telemetry fields', async () => {
    await model.updateAccessControlDevice('ac-1', { name: 'Side Gate' });

    expect(mockEmitDeviceStatusChanged).not.toHaveBeenCalled();
    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
  });

  it('emits telemetry when location_description changes', async () => {
    await model.updateAccessControlDevice('ac-1', { location_description: 'South entrance' });

    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'ac-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
  });

  it('does not emit telemetry when metadata is unchanged', async () => {
    await model.updateAccessControlDevice('ac-1', { name: 'Main Door' });

    expect(mockEmitDeviceTelemetryUpdated).not.toHaveBeenCalled();
  });
});
