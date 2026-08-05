import { RemoteLockActivityLogger } from '@/services/access/remote-lock-activity-logger.service';
import type { LockCommandInitiator } from '@/services/lock-command.service';

// Mock the ActivityService module
const mockLogActivity = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: jest.fn(() => ({
      logActivity: mockLogActivity,
    })),
  },
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
    it('writes remote_access_granted metadata with all initiator fields', async () => {
      await RemoteLockActivityLogger.logRemoteAccessGranted({
        ...baseParams,
        unitId: 'unit-1',
        commandId: 'cmd-123',
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          activityType: 'access_attempt',
          title: 'Remote Access Granted',
          result: 'success',
          metadata: expect.objectContaining({
            action: 'remote_access_granted',
            method: 'admin_remote',
            initiated_remotely: true,
            gateway_id: 'gw-1',
            remote_command_id: 'cmd-123',
            initiated_by: {
              id: 'user-1',
              name: 'Jane Admin',
              role: 'facility_admin',
            },
            device_type: 'blulok',
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

    it('sets denial_reason to timeout when error message includes "timeout"', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Command timeout waiting for gateway',
        initiator: baseInitiator,
        deviceType: 'blulok',
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'failure',
          metadata: expect.objectContaining({
            denial_reason: 'timeout',
          }),
        }),
      );
    });

    it('sets denial_reason to settlement_mismatch when error message includes "remained"', async () => {
      await RemoteLockActivityLogger.logRemoteCommandFailure({
        facilityId: 'fac-1',
        deviceId: 'dev-1',
        unitId: 'unit-1',
        gatewayId: 'gw-1',
        requestedStatus: 'unlocked',
        errorMessage: 'Device remained locked after command',
        initiator: baseInitiator,
        deviceType: 'blulok',
      });

      expect(mockLogActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          result: 'failure',
          metadata: expect.objectContaining({
            denial_reason: 'settlement_mismatch',
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

      const call = mockLogActivity.mock.calls[0][0];
      expect(call.metadata.denial_reason).toBeUndefined();
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
  });
});
