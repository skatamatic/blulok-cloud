/**
 * LockCommandService — lock/unlock orchestration, gateway delegation, timeout revert.
 * Mocks DeviceModel + GatewayService; uses fake timers (no real 10s waits).
 */
import { LockCommandService } from '@/services/lock-command.service';

const mockUpdateLockStatus = jest.fn().mockResolvedValue(undefined);
const mockUpdateAccessControlDevice = jest.fn().mockResolvedValue({});
const sendLockCommand = jest.fn();
const mockNotifyRemoteLockCommandFailed = jest.fn().mockResolvedValue(undefined);

let knexInvocation = 0;
const buildJoinFirst = (row: Record<string, unknown> | null) => ({
  join: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(row),
});

const buildTimeoutQuery = (lockStatus: string) => ({
  where: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue({ lock_status: lockStatus }),
});

const mockKnex = jest.fn((table: string) => {
  knexInvocation += 1;
  if (table === 'facilities') {
    return {
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 10 }),
    };
  }
  if (knexInvocation === 1 && table === 'blulok_devices') {
    return buildJoinFirst({
      id: 'dev-1',
      lock_status: 'unlocked',
      supports_remote_lock: true,
      gateway_id: 'gw-1',
      facility_id: 'fac-1',
    });
  }
  if (table === 'blulok_devices') {
    return buildTimeoutQuery('locking');
  }
  return buildJoinFirst(null);
});

jest.mock('@/models/device.model', () => ({
  DeviceModel: jest.fn().mockImplementation(() => ({
    db: { connection: mockKnex },
    updateLockStatus: mockUpdateLockStatus,
    updateAccessControlDevice: mockUpdateAccessControlDevice,
  })),
}));

jest.mock('@/services/gateway/gateway.service', () => ({
  GatewayService: {
    getInstance: jest.fn(() => ({
      sendLockCommand,
    })),
  },
}));

jest.mock('@/services/notifications/in-app-notification-dispatcher.service', () => ({
  InAppNotificationDispatcher: {
    getInstance: jest.fn(() => ({
      notifyRemoteLockCommandFailed: mockNotifyRemoteLockCommandFailed,
    })),
  },
}));

const mockIsBlockingActiveForFacility = jest.fn().mockResolvedValue(false);

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    isBlockingActiveForFacility: (...args: unknown[]) => mockIsBlockingActiveForFacility(...args),
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
  },
}));

const mockLogActivity = jest.fn().mockResolvedValue({});

jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn(() => ({ logActivity: mockLogActivity })),
  },
}));

function resetSingleton() {
  (LockCommandService as unknown as { instance?: LockCommandService }).instance = undefined;
}

async function flushAsyncNotifications(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('LockCommandService', () => {
  beforeEach(() => {
    resetSingleton();
    knexInvocation = 0;
    jest.clearAllMocks();
    mockUpdateLockStatus.mockResolvedValue(undefined);
    sendLockCommand.mockReset();
    mockNotifyRemoteLockCommandFailed.mockClear();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks lock commands while gateway recovery is active', async () => {
    mockIsBlockingActiveForFacility.mockResolvedValueOnce(true);

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'locked');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/recovery in progress/i);
    expect(sendLockCommand).not.toHaveBeenCalled();
    expect(mockIsBlockingActiveForFacility).toHaveBeenCalledWith('fac-1');
  });

  it('rejects remote lock when supports_remote_lock is false', async () => {
    knexInvocation = 0;
    mockKnex.mockImplementationOnce(() =>
      buildJoinFirst({
        id: 'dev-1',
        lock_status: 'unlocked',
        supports_remote_lock: false,
        gateway_id: 'gw-1',
        facility_id: 'fac-1',
      }),
    );

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'locked');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/remote lock is not enabled/i);
    expect(sendLockCommand).not.toHaveBeenCalled();
  });

  it('returns failure when device/gateway row is not found', async () => {
    knexInvocation = 0;
    mockKnex.mockImplementationOnce(() => buildJoinFirst(null));

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('missing', 'locked');

    expect(res.success).toBe(false);
    expect(res.message).toMatch(/device not found/i);
    expect(sendLockCommand).not.toHaveBeenCalled();
  });

  it('reverts transitional status when gateway reports failure', async () => {
    sendLockCommand.mockResolvedValueOnce({ success: false, error: 'gw-busy' });

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'locked');

    await flushAsyncNotifications();

    expect(res.success).toBe(false);
    expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'locking');
    expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
    expect(mockNotifyRemoteLockCommandFailed).toHaveBeenCalledWith(
      'fac-1',
      'dev-1',
      'locked',
      'gw-busy',
      { gatewayId: 'gw-1', unitId: undefined },
    );
  });

  it('notifies facility operators when gateway throws', async () => {
    sendLockCommand.mockRejectedValueOnce(new Error('Gateway gw-1 not found'));

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'unlocked');

    await flushAsyncNotifications();

    expect(res.success).toBe(false);
    expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocking');
    expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
    expect(mockNotifyRemoteLockCommandFailed).toHaveBeenCalledWith(
      'fac-1',
      'dev-1',
      'unlocked',
      'Gateway gw-1 not found',
      { gatewayId: 'gw-1', unitId: undefined },
    );
  });

  it('accepts command and schedules timeout; reverts if sync never arrives', async () => {
    jest.useFakeTimers();
    sendLockCommand.mockResolvedValueOnce({ success: true });

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'locked');

    expect(res.success).toBe(true);
    expect(res.lock_status).toBe('locking');
    expect(sendLockCommand).toHaveBeenCalledWith('gw-1', 'dev-1', 'CLOSE');

    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockUpdateLockStatus).toHaveBeenCalledWith('dev-1', 'unlocked');
  });

  it('sends one-shot command without transitional state when facility timeout is 0', async () => {
    knexInvocation = 0;
    mockKnex.mockImplementation((table: string) => {
      knexInvocation += 1;
      if (table === 'facilities') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 0 }),
        };
      }
      if (knexInvocation === 1 && table === 'blulok_devices') {
        return buildJoinFirst({
          id: 'dev-1',
          lock_status: 'unlocked',
          supports_remote_lock: true,
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
        });
      }
      return buildTimeoutQuery('locked');
    });

    sendLockCommand.mockResolvedValueOnce({ success: true });

    const svc = LockCommandService.getInstance();
    const res = await svc.issueLockCommand('dev-1', 'locked');

    expect(res.success).toBe(true);
    expect(res.lock_status).toBe('unlocked');
    expect(mockUpdateLockStatus).not.toHaveBeenCalled();
    expect(sendLockCommand).toHaveBeenCalledWith('gw-1', 'dev-1', 'CLOSE');
  });

  it('stores pending attribution in one-shot mode for remote attribution', async () => {
    knexInvocation = 0;
    mockKnex.mockImplementation((table: string) => {
      knexInvocation += 1;
      if (table === 'facilities') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 0 }),
        };
      }
      if (knexInvocation === 1 && table === 'blulok_devices') {
        return buildJoinFirst({
          id: 'dev-1',
          lock_status: 'unlocked',
          supports_remote_lock: true,
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
        });
      }
      return buildTimeoutQuery('locked');
    });

    sendLockCommand.mockResolvedValueOnce({ success: true });

    const svc = LockCommandService.getInstance();
    await svc.issueLockCommand('dev-1', 'locked', {
      userId: 'user-1',
      userName: 'Admin',
      role: 'facility_admin',
    });

    const attribution = svc.peekCommandAttribution('dev-1');
    expect(attribution).toMatchObject({
      initiator: { userId: 'user-1', userName: 'Admin' },
      requestedStatus: 'locked',
    });
  });

  it('logs access history failure when initiator present on gateway failure', async () => {
    sendLockCommand.mockResolvedValueOnce({ success: false, error: 'gw-busy' });

    const svc = LockCommandService.getInstance();
    await svc.issueLockCommand('dev-1', 'locked', {
      userId: 'user-1',
      userName: 'Admin',
      role: 'facility_admin',
    });

    await flushAsyncNotifications();

    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'access_attempt',
        result: 'failure',
        metadata: expect.objectContaining({
          action: 'lock_attempt',
          method: 'admin_remote',
          device_type: 'blulok',
        }),
      }),
    );
  });

  it('marks revert activity for suppression after timeout failure', async () => {
    jest.useFakeTimers();
    knexInvocation = 0;
    mockKnex.mockImplementation((table: string) => {
      knexInvocation += 1;
      if (table === 'facilities') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 10 }),
        };
      }
      if (knexInvocation === 1 && table === 'blulok_devices') {
        return buildJoinFirst({
          id: 'dev-1',
          lock_status: 'unlocked',
          supports_remote_lock: true,
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
        });
      }
      if (table === 'blulok_devices') {
        return buildTimeoutQuery('locking');
      }
      return buildJoinFirst(null);
    });
    sendLockCommand.mockResolvedValueOnce({ success: true });

    const svc = LockCommandService.getInstance();
    await svc.issueLockCommand('dev-1', 'locked', {
      userId: 'user-1',
      userName: 'Admin',
      role: 'facility_admin',
    });

    await jest.advanceTimersByTimeAsync(10_000);

    expect(svc.consumeSuppressRevertActivityLog('dev-1')).toBe(true);
    expect(svc.consumeSuppressRevertActivityLog('dev-1')).toBe(false);
  });

  it('does not revert on timeout if lock_status already changed (sync won)', async () => {
    jest.useFakeTimers();
    knexInvocation = 0;
    mockKnex.mockImplementation((table: string) => {
      knexInvocation += 1;
      if (knexInvocation === 1 && table === 'blulok_devices') {
        return buildJoinFirst({
          id: 'dev-1',
          lock_status: 'unlocked',
          supports_remote_lock: true,
          gateway_id: 'gw-1',
          facility_id: 'fac-1',
        });
      }
      return buildTimeoutQuery('locked');
    });

    sendLockCommand.mockResolvedValueOnce({ success: true });

    const svc = LockCommandService.getInstance();
    await svc.issueLockCommand('dev-1', 'locked');

    const callsBefore = mockUpdateLockStatus.mock.calls.length;

    await jest.advanceTimersByTimeAsync(10_000);

    expect(mockUpdateLockStatus.mock.calls.length).toBe(callsBefore);
  });

  describe('issueAccessControlLockCommand', () => {
    beforeEach(() => {
      resetSingleton();
      jest.clearAllMocks();
      mockUpdateAccessControlDevice.mockClear();
      sendLockCommand.mockReset();
      mockKnex.mockImplementation((table: string) => {
        if (table === 'access_control_devices') {
          return buildJoinFirst({
            id: 'ac-1',
            gateway_id: 'gw-1',
            facility_id: 'fac-1',
            is_locked: true,
            supports_remote_lock: true,
          });
        }
        return buildJoinFirst(null);
      });
    });

    it('returns failure when access control row is missing', async () => {
      mockKnex.mockImplementation(() => buildJoinFirst(null));
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('missing', 'unlocked');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/device not found/i);
      expect(sendLockCommand).not.toHaveBeenCalled();
    });

    it('blocks access-control lock commands while gateway recovery is active', async () => {
      mockIsBlockingActiveForFacility.mockResolvedValueOnce(true);
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('ac-1', 'unlocked');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/recovery in progress/i);
      expect(sendLockCommand).not.toHaveBeenCalled();
      expect(mockIsBlockingActiveForFacility).toHaveBeenCalledWith('fac-1');
    });

    it('sends OPEN when requesting unlocked', async () => {
      sendLockCommand.mockResolvedValueOnce({ success: true });
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('ac-1', 'unlocked');
      expect(res.success).toBe(true);
      expect(sendLockCommand).toHaveBeenCalledWith('gw-1', 'ac-1', 'OPEN');
      expect(mockUpdateAccessControlDevice).not.toHaveBeenCalled();
      expect(svc.peekCommandAttribution('ac-1')).toBeNull();
    });

    it('sends CLOSE when requesting locked', async () => {
      sendLockCommand.mockResolvedValueOnce({ success: true });
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('ac-1', 'locked');
      expect(res.success).toBe(true);
      expect(sendLockCommand).toHaveBeenCalledWith('gw-1', 'ac-1', 'CLOSE');
      expect(mockUpdateAccessControlDevice).not.toHaveBeenCalled();
    });

    it('rejects remote lock for access control when supports_remote_lock is false', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'access_control_devices') {
          return buildJoinFirst({
            id: 'ac-1',
            gateway_id: 'gw-1',
            is_locked: false,
            supports_remote_lock: false,
          });
        }
        return buildJoinFirst(null);
      });
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('ac-1', 'locked');
      expect(res.success).toBe(false);
      expect(res.message).toMatch(/remote lock is not enabled/i);
      expect(sendLockCommand).not.toHaveBeenCalled();
    });

    it('returns failure when gateway rejects command', async () => {
      sendLockCommand.mockResolvedValueOnce({ success: false, error: 'gw-offline' });
      const svc = LockCommandService.getInstance();
      const res = await svc.issueAccessControlLockCommand('ac-1', 'unlocked');
      await flushAsyncNotifications();
      expect(res.success).toBe(false);
      expect(res.message).toContain('gw-offline');
      expect(mockUpdateAccessControlDevice).not.toHaveBeenCalled();
      expect(mockNotifyRemoteLockCommandFailed).toHaveBeenCalledWith(
        'fac-1',
        'ac-1',
        'unlocked',
        'gw-offline',
        { gatewayId: 'gw-1', unitId: undefined },
      );
    });

    it('logs unlock failure on access-control command timeout', async () => {
      jest.useFakeTimers();
      mockKnex.mockImplementation((table: string) => {
        if (table === 'facilities') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ lock_command_timeout_sec: 10 }),
          };
        }
        if (table === 'access_control_devices') {
          return buildJoinFirst({
            id: 'ac-1',
            gateway_id: 'gw-1',
            facility_id: 'fac-1',
            is_locked: true,
            supports_remote_lock: true,
          });
        }
        return buildJoinFirst(null);
      });
      sendLockCommand.mockResolvedValueOnce({ success: true });

      const svc = LockCommandService.getInstance();
      await svc.issueAccessControlLockCommand('ac-1', 'unlocked', {
        userId: 'user-1',
        userName: 'Admin',
        role: 'facility_admin',
      });

      await jest.advanceTimersByTimeAsync(10_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'access_attempt',
          result: 'failure',
          actorId: 'user-1',
          metadata: expect.objectContaining({
            action: 'unlock_attempt',
            device_type: 'access_control',
          }),
        }),
      );
      jest.useRealTimers();
    }, 15000);
  });
});
