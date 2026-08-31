import { RemoteLockActivityLogger } from '@/services/access/remote-lock-activity-logger.service';
import type { LockCommandInitiator } from '@/services/lock-command.service';

const mockLogActivity = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn(() => ({
      logActivity: mockLogActivity,
    })),
  },
}));

const mockOnCloudRemoteUnlockIssued = jest.fn().mockResolvedValue({ id: 'sess-grant' });
const mockOnDeviceUnlocked = jest.fn().mockResolvedValue({ id: 'sess-open' });
const mockOnDeviceLocked = jest.fn().mockResolvedValue({ id: 'sess-closed' });
const mockFailOrTimeout = jest.fn().mockResolvedValue({ id: 'sess-fail' });
jest.mock('@/services/access/access-session.service', () => ({
  AccessSessionService: {
    getInstance: jest.fn(() => ({
      onCloudRemoteUnlockIssued: mockOnCloudRemoteUnlockIssued,
      onDeviceUnlocked: mockOnDeviceUnlocked,
      onDeviceLocked: mockOnDeviceLocked,
      failOrTimeout: mockFailOrTimeout,
    })),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

describe('RemoteLockActivityLogger', () => {
  const baseInitiator: LockCommandInitiator = {
    userId: 'user-1',
    userName: 'Jane Admin',
    role: 'facility_admin',
  };

  const baseParams = {
    facilityId: 'fac-1',
    deviceId: 'dev-1',
    gatewayId: 'gw-1',
    initiator: baseInitiator,
    method: 'admin_remote' as const,
    deviceType: 'blulok' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logRemoteAccessGranted', () => {
    it('writes remote_access_granted metadata with session when commandId set', async () => {
      await RemoteLockActivityLogger.logRemoteAccessGranted({
        ...baseParams,
        unitId: 'unit-1',
        commandId: 'cmd-123',
      });

      expect(mockOnCloudRemoteUnlockIssued).toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'access_attempt',
          title: 'Remote Access Granted',
          result: 'pending',
          accessSessionId: 'sess-grant',
          metadata: expect.objectContaining({
            action: 'remote_access_granted',
            remote_command_id: 'cmd-123',
            initiated_by: {
              id: 'user-1',
              name: 'Jane Admin',
              role: 'facility_admin',
            },
          }),
        }),
      );
    });

    it('includes tenant unlock override metadata when provided', async () => {
      await RemoteLockActivityLogger.logRemoteAccessGranted({
        ...baseParams,
        tenantUnlockOverride: {
          reason: 'emergency',
          reasonLabel: 'Emergency (Fire, flood, other)',
          notes: 'Water leak in unit',
        },
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            occupied_unit_override: true,
            tenant_unlock_override: {
              reason: 'emergency',
              reason_label: 'Emergency (Fire, flood, other)',
              notes: 'Water leak in unit',
            },
          }),
        }),
      );
    });

    it('omits override fields when no tenantUnlockOverride', async () => {
      await RemoteLockActivityLogger.logRemoteAccessGranted(baseParams);
      const call = mockLogActivity.mock.calls[0][0];
      expect(call.metadata.occupied_unit_override).toBeUndefined();
      expect(call.metadata.tenant_unlock_override).toBeUndefined();
    });

    it('swallows logging errors', async () => {
      mockLogActivity.mockRejectedValueOnce(new Error('db down'));
      await expect(
        RemoteLockActivityLogger.logRemoteAccessGranted(baseParams),
      ).resolves.toBeUndefined();
    });
  });

  describe('logRemoteCommandSuccess', () => {
    it('opens an unlock session then logs success', async () => {
      await RemoteLockActivityLogger.logRemoteCommandSuccess({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        gatewayId: 'gw-1',
        initiator: baseInitiator,
        method: 'remote_gateway',
        activityType: 'unlock',
      });
      expect(mockOnDeviceUnlocked).toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'unlock',
          title: 'Device Unlocked',
          accessSessionId: 'sess-open',
        }),
      );
    });

    it('closes a lock session then logs success', async () => {
      await RemoteLockActivityLogger.logRemoteCommandSuccess({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        gatewayId: 'gw-1',
        initiator: baseInitiator,
        method: 'admin_remote',
        activityType: 'lock',
      });
      expect(mockOnDeviceLocked).toHaveBeenCalled();
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'lock',
          title: 'Device Locked',
          accessSessionId: 'sess-closed',
        }),
      );
    });

    it('swallows success-path errors', async () => {
      mockOnDeviceUnlocked.mockRejectedValueOnce('boom');
      await expect(
        RemoteLockActivityLogger.logRemoteCommandSuccess({
          facilityId: 'fac-1',
          deviceId: 'dev-1',
          gatewayId: 'gw-1',
          initiator: baseInitiator,
          method: 'admin_remote',
          activityType: 'unlock',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('logRemoteCommandFailure', () => {
    it('does not log when initiator is missing', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Command failed',
        deviceType: 'blulok',
      });
      expect(mockLogActivity).not.toHaveBeenCalled();
    });

    it('sets denial_reason to timeout when error message includes timeout', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Command timeout waiting for gateway',
        initiator: baseInitiator,
        deviceType: 'blulok',
        remoteCommandId: 'cmd-9',
      });

      expect(mockFailOrTimeout).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'timed_out', denialReason: 'timeout' }),
      );
      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'failure',
          title: 'Remote Unlock Failed',
          accessSessionId: 'sess-fail',
          metadata: expect.objectContaining({ denial_reason: 'timeout' }),
        }),
      );
    });

    it('sets denial_reason to settlement_mismatch when error includes remained', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'locked',
        errorMessage: 'Device remained locked after command',
        initiator: baseInitiator,
        deviceType: 'blulok',
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Remote Lock Failed',
          metadata: expect.objectContaining({
            denial_reason: 'settlement_mismatch',
            action: 'lock_attempt',
          }),
        }),
      );
    });

    it('does not add denial_reason for other error messages', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Unknown error occurred',
        initiator: baseInitiator,
        deviceType: 'blulok',
      });
      expect(mockLogActivity.mock.calls[0][0].metadata.denial_reason).toBeUndefined();
    });

    it('includes tenant override in failure log when provided', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Command failed',
        initiator: baseInitiator,
        deviceType: 'blulok',
        tenantUnlockOverride: {
          reason: 'testing_maintenance',
          reasonLabel: 'Testing and/or Maintenance',
        },
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            tenant_unlock_override: {
              reason: 'testing_maintenance',
              reason_label: 'Testing and/or Maintenance',
              notes: null,
            },
          }),
        }),
      );
    });

    it('swallows failure-path errors', async () => {
      mockFailOrTimeout.mockRejectedValueOnce(new Error('session fail'));
      await expect(
        RemoteLockActivityLogger.logRemoteCommandFailure({
          facilityId: 'fac-1',
          deviceId: 'dev-1',
          requestedStatus: 'unlocked',
          errorMessage: 'x',
          initiator: baseInitiator,
          deviceType: 'blulok',
        }),
      ).resolves.toBeUndefined();
    });
  });
});
