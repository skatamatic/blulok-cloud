import { logger } from '@/utils/logger';
import {
  lockActivityTitle,
  lockActivityVerb,
  mapLockStatusToActivityType,
} from '@/utils/lock-status-activity.utils';
import {
  resolveRemoteAccessMethod,
  terminalActivityMatchesRequestedStatus,
} from '@/utils/access-history-remote.utils';
import type { LockStatusChangedEvent } from '@/services/device-event.service';
import { AccessSessionService } from '@/services/access/access-session.service';

/**
 * Access History writers for gateway-settled lock/unlock transitions.
 * Opens/closes access sessions before writing activity_logs.
 */
export class SettledLockActivityLogger {
  static async logSettledLockTransition(event: LockStatusChangedEvent): Promise<void> {
    const { ActivityService } = await import('@/services/activity.service');
    const { DeviceModel } = await import('@/models/device.model');
    const { LockCommandService } = await import('@/services/lock-command.service');

    const lockCommandService = LockCommandService.getInstance();
    if (lockCommandService.consumeSuppressRevertActivityLog(event.deviceId)) {
      return;
    }

    const deviceModel = new DeviceModel();
    const gateway = await deviceModel.findGatewayById(event.gatewayId);
    if (!gateway) {
      logger.warn(`Cannot log lock activity: gateway ${event.gatewayId} not found`);
      return;
    }

    const blulokDevice = await deviceModel.findBluLokDeviceById(event.deviceId);
    const acDevice = blulokDevice ? null : await deviceModel.findAccessControlDeviceWithGateway(event.deviceId);
    const deviceType = acDevice && !blulokDevice ? 'access_control' : 'blulok';
    const unitId = event.unitId || blulokDevice?.unit_id || undefined;

    const activityType = mapLockStatusToActivityType(event.newStatus);
    if (!activityType || activityType === 'locking' || activityType === 'unlocking') {
      return;
    }

    const attribution =
      lockCommandService.peekCommandAttribution(event.deviceId)
      ?? await lockCommandService.peekCommandAttributionDurable(event.deviceId);
    const remoteMethod = attribution
      ? resolveRemoteAccessMethod(attribution.initiator.role)
      : undefined;
    const isRealTransition = event.oldStatus !== event.newStatus;
    const statusMatchesRequested = Boolean(
      attribution
      && terminalActivityMatchesRequestedStatus(activityType, attribution.requestedStatus),
    );

    if (
      attribution
      && remoteMethod
      && !statusMatchesRequested
    ) {
      lockCommandService.recordRemoteCommandSettlementMismatch({
        deviceId: event.deviceId,
        facilityId: gateway.facility_id,
        unitId,
        gatewayId: event.gatewayId,
        deviceType,
        requestedStatus: attribution.requestedStatus,
        message:
          attribution.requestedStatus === 'unlocked'
            ? 'Remote unlock failed: device remained locked'
            : 'Remote lock failed: device remained unlocked',
      });
      return;
    }

    if (!isRealTransition) {
      if (attribution && remoteMethod && statusMatchesRequested) {
        lockCommandService.tryConsumeAttribution(event.deviceId, {
          commandId: attribution.commandId,
          requestedStatus: attribution.requestedStatus,
        });
      }
      return;
    }

    let appliedRemoteAttribution = null as Awaited<
      ReturnType<typeof lockCommandService.peekCommandAttributionDurable>
    >;
    if (attribution && remoteMethod && statusMatchesRequested) {
      appliedRemoteAttribution = lockCommandService.tryConsumeAttribution(event.deviceId, {
        commandId: attribution.commandId,
        requestedStatus: attribution.requestedStatus,
      });
      // Cross-instance: pending lives only in access_sessions — still attribute the unlock.
      if (!appliedRemoteAttribution) {
        appliedRemoteAttribution = attribution;
      }
    }

    let occupiedStateAttr: {
      userId: string;
      userName: string;
      role: string;
      override: { reason: string; reasonLabel: string; notes?: string };
    } | null = null;
    if (!appliedRemoteAttribution && activityType === 'unlock' && isRealTransition) {
      const { OccupiedUnlockIntentService } = await import(
        '@/services/occupied-unlock-intent.service'
      );
      const recent = OccupiedUnlockIntentService.getInstance().tryConsumeForUnlockState(event.deviceId);
      if (recent) {
        occupiedStateAttr = {
          userId: recent.userId,
          userName: recent.userName,
          role: recent.role,
          override: recent.override,
        };
      }
    }

    const appliedAttribution = appliedRemoteAttribution;
    const isCorrelatedRemoteUnlock =
      Boolean(appliedAttribution) && activityType === 'unlock';
    const actorType = appliedAttribution || occupiedStateAttr ? 'user' : 'gateway';
    const actorId = appliedAttribution?.initiator.userId ?? occupiedStateAttr?.userId;
    const actorName =
      appliedAttribution?.initiator.userName
      ?? occupiedStateAttr?.userName
      ?? 'Gateway';
    const override =
      appliedAttribution?.tenantUnlockOverride ?? occupiedStateAttr?.override;
    const description = isCorrelatedRemoteUnlock && appliedAttribution
      ? [
          `Device was unlocked at the site following remote access by ${appliedAttribution.initiator.userName}`,
          override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
          override?.notes ? `Notes: ${override.notes}` : null,
        ].filter(Boolean).join('. ')
      : appliedAttribution
        ? [
            `Device was ${lockActivityVerb(activityType)} remotely via gateway by ${appliedAttribution.initiator.userName}`,
            override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
            override?.notes ? `Notes: ${override.notes}` : null,
          ].filter(Boolean).join('. ')
        : occupiedStateAttr
          ? [
              `Device was ${lockActivityVerb(activityType)} via app by ${occupiedStateAttr.userName}`,
              override?.reasonLabel ? `Reason: ${override.reasonLabel}` : null,
              override?.notes ? `Notes: ${override.notes}` : null,
            ].filter(Boolean).join('. ')
          : `Device was ${lockActivityVerb(activityType)} locally at the device`;

    const title = isCorrelatedRemoteUnlock
      ? 'Unlocked at Site'
      : lockActivityTitle(activityType);

    const sessions = AccessSessionService.getInstance();
    let accessSessionId: string | undefined;
    if (activityType === 'unlock') {
      const session = await sessions.onDeviceUnlocked({
        facilityId: gateway.facility_id,
        deviceId: event.deviceId,
        unitId,
        gatewayId: event.gatewayId,
        deviceType,
        remoteCommandId: appliedAttribution?.commandId,
        method: isCorrelatedRemoteUnlock
          ? 'local_device'
          : occupiedStateAttr
            ? 'app'
            : appliedAttribution && remoteMethod
              ? remoteMethod
              : 'local_device',
        actor: actorId
          ? {
              type: 'user',
              id: actorId,
              name: actorName,
              role: appliedAttribution?.initiator.role ?? occupiedStateAttr?.role,
            }
          : undefined,
        metadata: {
          oldStatus: event.oldStatus,
          newStatus: event.newStatus,
          ...(isCorrelatedRemoteUnlock ? { correlated_remote: true } : {}),
        },
      });
      accessSessionId = session.id;
    } else {
      const session = await sessions.onDeviceLocked({
        facilityId: gateway.facility_id,
        deviceId: event.deviceId,
        unitId,
        gatewayId: event.gatewayId,
        deviceType,
        metadata: {
          oldStatus: event.oldStatus,
          newStatus: event.newStatus,
        },
      });
      accessSessionId = session.id;
    }

    await ActivityService.getInstance().logActivity({
      entityType: 'device',
      entityId: event.deviceId,
      activityType,
      title,
      description,
      actorType,
      actorId,
      actorName,
      result: 'success',
      facilityId: gateway.facility_id,
      unitId,
      deviceId: event.deviceId,
      accessSessionId,
      metadata: {
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        gatewayId: event.gatewayId,
        device_type: deviceType,
        ...(isCorrelatedRemoteUnlock && appliedAttribution
          ? {
            method: 'local_device',
            correlated_remote: true,
            remote_command_id: appliedAttribution.commandId,
            gateway_id: event.gatewayId,
            initiated_by: {
              id: appliedAttribution.initiator.userId,
              name: appliedAttribution.initiator.userName,
              role: appliedAttribution.initiator.role,
            },
            ...(override
              ? {
                occupied_unit_override: true,
                tenant_unlock_override: {
                  reason: override.reason,
                  reason_label: override.reasonLabel,
                  notes: override.notes ?? null,
                },
              }
              : {}),
          }
          : remoteMethod && appliedAttribution
            ? {
              method: remoteMethod,
              initiated_remotely: true,
              gateway_id: event.gatewayId,
              initiated_by: {
                id: appliedAttribution.initiator.userId,
                name: appliedAttribution.initiator.userName,
                role: appliedAttribution.initiator.role,
              },
              ...(override
                ? {
                  tenant_unlock_override: {
                    reason: override.reason,
                    reason_label: override.reasonLabel,
                    notes: override.notes ?? null,
                  },
                }
                : {}),
            }
            : occupiedStateAttr
              ? {
                method: 'app',
                initiated_remotely: false,
                occupied_unit_override: true,
                gateway_id: event.gatewayId,
                initiated_by: {
                  id: occupiedStateAttr.userId,
                  name: occupiedStateAttr.userName,
                  role: occupiedStateAttr.role,
                },
                tenant_unlock_override: {
                  reason: occupiedStateAttr.override.reason,
                  reason_label: occupiedStateAttr.override.reasonLabel,
                  notes: occupiedStateAttr.override.notes ?? null,
                },
              }
              : {
                method: 'local_device',
              }),
      },
    });
  }
}
