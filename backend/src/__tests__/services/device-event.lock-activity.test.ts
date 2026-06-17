import { DeviceEventService } from '@/services/device-event.service';

const mockLogActivity = jest.fn().mockResolvedValue({});
const mockFindGatewayById = jest.fn();
const mockFindBluLokDeviceById = jest.fn();
const mockFindAccessControlDeviceWithGateway = jest.fn();
const mockPeekCommandAttribution = jest.fn();
const mockAcknowledgeCommandAttribution = jest.fn();
const mockConsumeSuppressRevertActivityLog = jest.fn().mockReturnValue(false);

jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn(() => ({ logActivity: mockLogActivity })),
  },
}));

jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    findGatewayById: mockFindGatewayById,
    findBluLokDeviceById: mockFindBluLokDeviceById,
    findAccessControlDeviceWithGateway: mockFindAccessControlDeviceWithGateway,
  })),
}));

jest.mock('@/services/lock-command.service', () => ({
  LockCommandService: {
    getInstance: jest.fn(() => ({
      peekCommandAttribution: mockPeekCommandAttribution,
      acknowledgeCommandAttribution: mockAcknowledgeCommandAttribution,
      consumeSuppressRevertActivityLog: mockConsumeSuppressRevertActivityLog,
    })),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn(() => ({
      broadcastUnitsUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastDeviceStatusUpdate: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

function resetSingleton() {
  (DeviceEventService as unknown as { instance?: DeviceEventService }).instance = undefined;
}

describe('DeviceEventService logLockActivity', () => {
  beforeEach(() => {
    resetSingleton();
    jest.clearAllMocks();
    mockConsumeSuppressRevertActivityLog.mockReturnValue(false);
    mockFindGatewayById.mockResolvedValue({ facility_id: 'fac-1' });
    mockFindBluLokDeviceById.mockResolvedValue({ unit_id: 'unit-1' });
    mockFindAccessControlDeviceWithGateway.mockResolvedValue(null);
  });

  async function emitLockChanged(
    newStatus: 'locked' | 'unlocked',
    oldStatus: 'locked' | 'unlocked' = 'unlocked',
  ): Promise<void> {
    const svc = DeviceEventService.getInstance();
    svc.initialize();
    svc.emitLockStatusChanged({
      deviceId: 'dev-1',
      oldStatus,
      newStatus,
      gatewayId: 'gw-1',
      unitId: 'unit-1',
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
  }

  it('skips activity log when revert suppression is active', async () => {
    mockConsumeSuppressRevertActivityLog.mockReturnValueOnce(true);
    await emitLockChanged('locked');
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('consumes attribution only when terminal status matches requested command', async () => {
    mockPeekCommandAttribution.mockReturnValue({
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'locked',
    });

    await emitLockChanged('locked');

    expect(mockAcknowledgeCommandAttribution).toHaveBeenCalledWith('dev-1');
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'user',
        actorId: 'user-1',
        metadata: expect.objectContaining({
          method: 'admin_remote',
          initiated_remotely: true,
        }),
      }),
    );
  });

  it('does not consume attribution when lock confirms but unlock was requested', async () => {
    mockPeekCommandAttribution.mockReturnValue({
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });

    await emitLockChanged('locked');

    expect(mockAcknowledgeCommandAttribution).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'gateway',
        metadata: expect.objectContaining({ method: 'local_device' }),
      }),
    );
  });

  it('logs local device activity when no pending attribution exists', async () => {
    mockPeekCommandAttribution.mockReturnValue(null);
    await emitLockChanged('unlocked', 'locked');

    expect(mockAcknowledgeCommandAttribution).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'unlock',
        description: expect.stringContaining('locally at the device'),
        metadata: expect.objectContaining({ method: 'local_device' }),
      }),
    );
  });
});
