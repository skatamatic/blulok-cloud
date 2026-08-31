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

const mockCancelOpenWindow = jest.fn();
jest.mock('@/services/access-control-no-feedback.service', () => ({
  AccessControlNoFeedbackService: {
    getInstance: jest.fn(() => ({
      cancelOpenWindow: mockCancelOpenWindow,
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

  it('strips gateway locked telemetry for no-feedback access points', async () => {
    jest.spyOn(model, 'findAccessControlBySerialAndRelay').mockResolvedValue({
      ...beforeRow,
      has_lock_feedback: false,
      no_feedback_open_timeout_sec: 30,
    });
    const updateSpy = jest
      .spyOn(model, 'updateAccessControlDevice')
      .mockResolvedValue({ ...beforeRow, status: 'online' });

    await model.updateAccessControlDeviceBySerialAndRelay(
      'gw-1',
      'KP-001',
      1,
      { status: 'online', is_locked: false },
    );

    expect(updateSpy).toHaveBeenCalledWith('ac-1', {
      status: 'online',
      is_locked: undefined,
    });
  });

  it('does not clear an open window when has_lock_feedback:false is repeated', async () => {
    const unlockUntil = new Date('2026-07-15T20:01:00.000Z');
    jest.spyOn(model, 'findAccessControlDeviceWithGateway').mockResolvedValue({
      ...beforeRow,
      has_lock_feedback: false,
      is_locked: false,
      no_feedback_unlock_until: unlockUntil,
      no_feedback_open_timeout_sec: 30,
    });

    await model.updateAccessControlDevice('ac-1', {
      name: 'Gate B',
      has_lock_feedback: false,
    });

    const payload = mockUpdate.mock.calls[0][0];
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Gate B',
        has_lock_feedback: false,
      }),
    );
    expect(payload).not.toHaveProperty('no_feedback_unlock_until');
    expect(payload).not.toHaveProperty('is_locked');
    expect(mockCancelOpenWindow).not.toHaveBeenCalled();
  });

  it('clears open window and forces locked when enabling lock feedback', async () => {
    jest.spyOn(model, 'findAccessControlDeviceWithGateway').mockResolvedValue({
      ...beforeRow,
      has_lock_feedback: false,
      is_locked: false,
      no_feedback_unlock_until: new Date('2026-07-15T20:01:00.000Z'),
      no_feedback_open_timeout_sec: 30,
    });

    await model.updateAccessControlDevice('ac-1', { has_lock_feedback: true });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        has_lock_feedback: true,
        no_feedback_open_timeout_sec: 0,
        no_feedback_unlock_until: null,
        is_locked: true,
      }),
    );
    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalled();
    expect(mockHandleAccessControlLockSettled).not.toHaveBeenCalled();
    expect(mockCancelOpenWindow).toHaveBeenCalledWith('ac-1');
  });

  it('does not settle pending lock commands for cloud-owned no-feedback lock updates', async () => {
    jest.spyOn(model, 'findAccessControlDeviceWithGateway').mockResolvedValue({
      ...beforeRow,
      has_lock_feedback: false,
      is_locked: true,
    });

    await model.updateAccessControlDevice('ac-1', { is_locked: false });

    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalled();
    expect(mockHandleAccessControlLockSettled).not.toHaveBeenCalled();
  });
});
