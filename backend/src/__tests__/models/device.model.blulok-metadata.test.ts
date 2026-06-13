jest.unmock('@/models/device.model');

const mockEmitDeviceTelemetryUpdated = jest.fn();

jest.mock('@/services/device-event.service', () => ({
  DeviceEventService: {
    getInstance: jest.fn(() => ({
      emitDeviceTelemetryUpdated: mockEmitDeviceTelemetryUpdated,
    })),
  },
}));

import { DeviceModel } from '@/models/device.model';

describe('DeviceModel BluLok metadata updates', () => {
  let model: DeviceModel;
  let mockUpdate: jest.Mock;
  let mockFirst: jest.Mock;

  const beforeRow = {
    id: 'dev-1',
    gateway_id: 'gw-1',
    facility_id: 'fac-1',
    device_serial: 'LOCK-1',
    device_settings: { displayName: 'Old Name', lockNumber: 12 },
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new DeviceModel();

    mockUpdate = jest.fn().mockResolvedValue(1);
    mockFirst = jest.fn().mockResolvedValue({
      ...beforeRow,
      device_settings: JSON.stringify(beforeRow.device_settings),
    });

    const mockBuilder = {
      where: jest.fn().mockReturnThis(),
      update: mockUpdate,
      first: mockFirst,
    };
    const mockKnex = jest.fn(() => mockBuilder);
    (model as unknown as { db: { connection: jest.Mock } }).db = { connection: mockKnex };

    jest.spyOn(model, 'findBluLokDeviceById').mockResolvedValue(beforeRow as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits telemetry when device_settings change', async () => {
    await model.updateBluLokDevice('dev-1', {
      device_settings: { displayName: 'New Name', lockNumber: 12 },
    });

    expect(mockEmitDeviceTelemetryUpdated).toHaveBeenCalledWith({
      deviceId: 'dev-1',
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
    });
  });

  it('does not emit telemetry when device_settings are unchanged', async () => {
    await model.updateBluLokDevice('dev-1', {
      device_settings: { displayName: 'Old Name', lockNumber: 12 },
    });

    expect(mockEmitDeviceTelemetryUpdated).not.toHaveBeenCalled();
  });
});
