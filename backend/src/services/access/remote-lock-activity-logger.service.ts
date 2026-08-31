import { logger } from '@/utils/logger';
import { resolveRemoteAccessMethod } from '@/utils/access-history-remote.utils';
import type { LockCommandInitiator } from '@/services/lock-command.service';
import { AccessSessionService } from '@/services/access/access-session.service';

export type TenantUnlockOverrideLog = {
  reason: string;
  reasonLabel: string;
  notes?: string;
};

/**
 * Access History writers for cloud-issued lock/unlock commands.
 * Opens/terminates access sessions before writing activity_logs.
 */
export class RemoteLockActivityLogger {
  static async logRemoteAccessGranted(params: {
    facilityId: string;
    deviceId: string;
    unitId?: string;
    gatewayId: string;
    initiator: LockCommandInitiator;
    method: 'admin_remote' | 'remote_gateway';
    deviceType: 'blulok' | 'access_control';
    commandId?: string;
    expiresAt?: Date;
    tenantUnlockOverride?: TenantUnlockOverrideLog;
  }): Promise<void> {
    try {
      const { ActivityService } = await import('@/services/activity.service');
      const override = params.tenantUnlockOverride;
      const overrideMeta = override
        ? {
            occupied_unit_override: true,
            tenant_unlock_override: {
              reason: override.reason,
              reason_label: override.reasonLabel,
              notes: override.notes ?? null,
            },
          }
        : {};

      let accessSessionId: string | undefined;
      if (params.commandId) {
        const expiresAt =
          params.expiresAt || new Date(Date.now() + 300_000);
        const session = await AccessSessionService.getInstance().onCloudRemoteUnlockIssued({
          facilityId: params.facilityId,
          deviceId: params.deviceId,
          unitId: params.unitId,
          gatewayId: params.gatewayId,
          deviceType: params.deviceType,
          method: params.method,
          commandId: params.commandId,
          initiator: {
            type: 'user',
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
          expiresAt,
          metadata: overrideMeta,
        });
        accessSessionId = session.id;
      }

      await ActivityService.getInstance().logActivity({
        entityType: 'device',
        entityId: params.deviceId,
        activityType: 'access_attempt',
        title: 'Remote Access Granted',
        description: `Remote unlock authorized for ${params.initiator.userName}`,
        actorType: 'user',
        actorId: params.initiator.userId,
        actorName: params.initiator.userName,
        result: 'pending',
        facilityId: params.facilityId,
        unitId: params.unitId,
        deviceId: params.deviceId,
        accessSessionId,
        metadata: {
          action: 'remote_access_granted',
          method: params.method,
          initiated_remotely: true,
          gateway_id: params.gatewayId,
          remote_command_id: params.commandId ?? null,
          initiated_by: {
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
          device_type: params.deviceType,
          ...overrideMeta,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('RemoteLockActivityLogger: failed to log remote access granted', {
        deviceId: params.deviceId,
        error: message,
      });
    }
  }

  static async logRemoteCommandSuccess(params: {
    facilityId: string;
    deviceId: string;
    gatewayId: string;
    initiator: LockCommandInitiator;
    method: 'admin_remote' | 'remote_gateway';
    activityType: 'lock' | 'unlock';
  }): Promise<void> {
    try {
      const { ActivityService } = await import('@/services/activity.service');
      const verb = params.activityType === 'unlock' ? 'unlocked' : 'locked';

      let accessSessionId: string | undefined;
      const sessions = AccessSessionService.getInstance();
      if (params.activityType === 'unlock') {
        const session = await sessions.onDeviceUnlocked({
          facilityId: params.facilityId,
          deviceId: params.deviceId,
          gatewayId: params.gatewayId,
          deviceType: 'access_control',
          method: params.method,
          actor: {
            type: 'user',
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
        });
        accessSessionId = session.id;
      } else {
        const session = await sessions.onDeviceLocked({
          facilityId: params.facilityId,
          deviceId: params.deviceId,
          gatewayId: params.gatewayId,
          deviceType: 'access_control',
        });
        accessSessionId = session.id;
      }

      await ActivityService.getInstance().logActivity({
        entityType: 'device',
        entityId: params.deviceId,
        activityType: params.activityType,
        title: params.activityType === 'unlock' ? 'Device Unlocked' : 'Device Locked',
        description: `Device ${verb} remotely via gateway by ${params.initiator.userName}`,
        actorType: 'user',
        actorId: params.initiator.userId,
        actorName: params.initiator.userName,
        result: 'success',
        facilityId: params.facilityId,
        deviceId: params.deviceId,
        accessSessionId,
        metadata: {
          method: params.method,
          initiated_remotely: true,
          gateway_id: params.gatewayId,
          initiated_by: {
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
          device_type: 'access_control',
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('RemoteLockActivityLogger: failed to log access-control remote command success', {
        deviceId: params.deviceId,
        error: message,
      });
    }
  }

  static async logRemoteCommandFailure(params: {
    facilityId: string;
    deviceId: string;
    unitId?: string;
    gatewayId?: string;
    requestedStatus: 'locked' | 'unlocked';
    errorMessage: string;
    initiator?: LockCommandInitiator;
    deviceType: 'blulok' | 'access_control';
    remoteCommandId?: string;
    tenantUnlockOverride?: TenantUnlockOverrideLog;
  }): Promise<void> {
    if (!params.initiator) {
      return;
    }

    try {
      const { ActivityService } = await import('@/services/activity.service');
      const method = resolveRemoteAccessMethod(params.initiator.role);
      const action = params.requestedStatus === 'unlocked' ? 'unlock_attempt' : 'lock_attempt';
      const title = params.requestedStatus === 'unlocked'
        ? 'Remote Unlock Failed'
        : 'Remote Lock Failed';
      const override = params.tenantUnlockOverride;
      const isTimeout = params.errorMessage.toLowerCase().includes('timeout');
      const isMismatch = params.errorMessage.toLowerCase().includes('remained');
      const denialReason = isTimeout ? 'timeout' : isMismatch ? 'settlement_mismatch' : undefined;

      const session = await AccessSessionService.getInstance().failOrTimeout({
        deviceId: params.deviceId,
        remoteCommandId: params.remoteCommandId,
        state: isTimeout ? 'timed_out' : 'failed',
        denialReason,
        reasonMessage: params.errorMessage,
      });

      await ActivityService.getInstance().logActivity({
        entityType: 'device',
        entityId: params.deviceId,
        activityType: 'access_attempt',
        title,
        description: params.errorMessage,
        actorType: 'user',
        actorId: params.initiator.userId,
        actorName: params.initiator.userName,
        result: 'failure',
        resultMessage: params.errorMessage,
        facilityId: params.facilityId,
        unitId: params.unitId,
        deviceId: params.deviceId,
        accessSessionId: session?.id,
        metadata: {
          action,
          method,
          initiated_remotely: true,
          gateway_id: params.gatewayId ?? null,
          remote_command_id: params.remoteCommandId ?? null,
          initiated_by: {
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
          device_type: params.deviceType,
          ...(override
            ? {
              tenant_unlock_override: {
                reason: override.reason,
                reason_label: override.reasonLabel,
                notes: override.notes ?? null,
              },
            }
            : {}),
          ...(denialReason ? { denial_reason: denialReason } : {}),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('RemoteLockActivityLogger: failed to log remote command failure to access history', {
        deviceId: params.deviceId,
        error: message,
      });
    }
  }
}
