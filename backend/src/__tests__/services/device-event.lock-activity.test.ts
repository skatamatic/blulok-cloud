import { DeviceEventService } from '@/services/device-event.service';

const mockLogActivity = jest.fn().mockResolvedValue({});
const mockFindGatewayById = jest.fn();
const mockFindBluLokDeviceById = jest.fn();
const mockFindAccessControlDeviceWithGateway = jest.fn();
const mockPeekCommandAttribution = jest.fn();
const mockAcknowledgeCommandAttribution = jest.fn();
const mockTryConsumeAttribution = jest.fn();
const mockConsumeSuppressRevertActivityLog = jest.fn().mockReturnValue(false);
const mockRecordRemoteCommandSettlementMismatch = jest.fn();

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
      tryConsumeAttribution: mockTryConsumeAttribution,
      consumeSuppressRevertActivityLog: mockConsumeSuppressRevertActivityLog,
      recordRemoteCommandSettlementMismatch: mockRecordRemoteCommandSettlementMismatch,
    })),
  },
}));

jest.mock('@/services/occupied-unlock-intent.service', () => ({
  OccupiedUnlockIntentService: {
    getInstance: jest.fn(() => ({
      tryConsumeForUnlockState: jest.fn().mockReturnValue(null),
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
      commandId: 'cmd-1',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'locked',
    });
    mockTryConsumeAttribution.mockReturnValue({
      commandId: 'cmd-1',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'locked',
    });

    await emitLockChanged('locked');

    expect(mockTryConsumeAttribution).toHaveBeenCalledWith('dev-1', {
      commandId: 'cmd-1',
      requestedStatus: 'locked',
    });
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

  it('logs correlated remote unlock as local_device site unlock with initiator', async () => {
    mockPeekCommandAttribution.mockReturnValue({
      commandId: 'cmd-unlock',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });
    mockTryConsumeAttribution.mockReturnValue({
      commandId: 'cmd-unlock',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });

    await emitLockChanged('unlocked', 'locked');

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'unlock',
        title: 'Unlocked at Site',
        actorType: 'user',
        actorId: 'user-1',
        metadata: expect.objectContaining({
          method: 'local_device',
          correlated_remote: true,
          remote_command_id: 'cmd-unlock',
          initiated_by: expect.objectContaining({ id: 'user-1', name: 'Admin' }),
        }),
      }),
    );
    expect(mockLogActivity.mock.calls[0][0].metadata.initiated_remotely).toBeUndefined();
  });

  it('records remote unlock failure when lock confirms but unlock was requested', async () => {
    mockPeekCommandAttribution.mockReturnValue({
      commandId: 'cmd-2',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });

    await emitLockChanged('locked');

    expect(mockTryConsumeAttribution).not.toHaveBeenCalled();
    expect(mockRecordRemoteCommandSettlementMismatch).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: 'dev-1',
        requestedStatus: 'unlocked',
        deviceType: 'blulok',
      }),
    );
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('settles matching same-state re-reports without success activity', async () => {
    mockPeekCommandAttribution.mockReturnValue({
      commandId: 'cmd-3',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });
    mockTryConsumeAttribution.mockReturnValue({
      commandId: 'cmd-3',
      initiator: { userId: 'user-1', userName: 'Admin', role: 'facility_admin' },
      gatewayId: 'gw-1',
      facilityId: 'fac-1',
      requestedStatus: 'unlocked',
    });

    await emitLockChanged('unlocked', 'unlocked');

    expect(mockTryConsumeAttribution).toHaveBeenCalledWith('dev-1', {
      commandId: 'cmd-3',
      requestedStatus: 'unlocked',
    });
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('ignores same-state re-reports with no pending attribution', async () => {
    mockPeekCommandAttribution.mockReturnValue(null);
    await emitLockChanged('unlocked', 'unlocked');
    expect(mockTryConsumeAttribution).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
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
