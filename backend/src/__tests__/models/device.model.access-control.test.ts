jest.unmock('@/models/device.model');

const mockEmitDeviceStatusChanged = jest.fn();
const mockEmitDeviceTelemetryUpdated = jest.fn();

jest.mock('@/services/device-event.service', () => ({
  DeviceEventService: {
    getInstance: jest.fn(() => ({
      emitDeviceStatusChanged: mockEmitDeviceStatusChanged,
      emitDeviceTelemetryUpdated: mockEmitDeviceTelemetryUpdated,
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
  });
});
