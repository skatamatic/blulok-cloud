import { NotificationService, CreateNotificationOptions } from '@/services/notification.service';

import { NotificationModel } from '@/models/notification.model';

import { InAppNotificationAudienceService } from '@/services/notifications/in-app-notification-audience.service';

import { InAppNotificationType, LOW_BATTERY_THRESHOLD_PERCENT } from '@/constants/in-app-notification.constants';

import { NOTIFICATION_UNREAD_RETENTION_DAYS } from '@/constants/notification-retention.constants';

import { UserRole } from '@/types/auth.types';
import type { DeviceSyncKind } from '@/types/gateway-device-sync.types';

import { logger } from '@/utils/logger';



export type FacilityAlertPayload = Omit<CreateNotificationOptions, 'userId'> & {

  facilityId: string;

  excludeUserIds?: string[];

};



export type GlobalAlertPayload = Omit<CreateNotificationOptions, 'userId' | 'facilityId'>;



/** Default dedup windows (minutes) per notification type. */

const DEDUP_MINUTES: Partial<Record<InAppNotificationType, number>> = {

  device_low_battery: 24 * 60,

  gateway_offline: 60,

  gateway_restored: 60,

  gateway_alert: 30,

  fms_sync_complete: 5,

  fms_sync_failed: 15,

  backend_error: 15,

  device_inventory_sync_error: 60,

};



/**

 * Central dispatcher for in-app notifications. Producers call typed helpers here;

 * audience resolution and fan-out stay in one place for easy extension.

 */

export class InAppNotificationDispatcher {

  private static instance: InAppNotificationDispatcher;

  private readonly notificationService = NotificationService.getInstance();

  private readonly audienceService = InAppNotificationAudienceService.getInstance();

  private readonly notificationModel = new NotificationModel();



  public static getInstance(): InAppNotificationDispatcher {

    if (!InAppNotificationDispatcher.instance) {

      InAppNotificationDispatcher.instance = new InAppNotificationDispatcher();

    }

    return InAppNotificationDispatcher.instance;

  }



  /** Fan-out a facility-scoped alert to facility operators. */

  public async notifyFacilityOperators(payload: FacilityAlertPayload): Promise<void> {

    const { excludeUserIds, facilityId, ...notification } = payload;

    const userIds = await this.audienceService.resolveFacilityOperators(facilityId, { excludeUserIds });

    const dedupMinutes = DEDUP_MINUTES[payload.type];

    await this.dispatchToUsers(userIds, { ...notification, facilityId }, dedupMinutes);

  }



  /** Fan-out a global alert to platform admins. */

  public async notifyGlobalOperators(payload: GlobalAlertPayload): Promise<void> {

    const userIds = await this.audienceService.resolveGlobalOperators();

    const dedupMinutes = DEDUP_MINUTES[payload.type];

    await this.dispatchToUsers(userIds, payload, dedupMinutes);

  }



  /** Fan-out technical alerts to dev_admin only. */

  public async notifyDevAdmins(payload: GlobalAlertPayload): Promise<void> {

    const userIds = await this.audienceService.resolveDevAdmins();

    const dedupMinutes = DEDUP_MINUTES[payload.type];

    await this.dispatchToUsers(userIds, payload, dedupMinutes);

  }



  private async dispatchToUsers(

    userIds: string[],

    options: Omit<CreateNotificationOptions, 'userId'>,

    dedupMinutes?: number,

  ): Promise<void> {

    await Promise.allSettled(

      userIds.map(async (userId) => {

        if (dedupMinutes && options.referenceId) {

          const dup = await this.hasRecentDuplicate(userId, options.type, options.referenceId, dedupMinutes);

          if (dup) return;

        }

        await this.notificationService.createNotification({ ...options, userId }).catch((err) => {

          logger.error(`Failed to create in-app notification for user ${userId}:`, err);

        });

      }),

    );

  }



  private async hasRecentDuplicate(

    userId: string,

    type: InAppNotificationType,

    referenceId: string | undefined,

    withinMinutes: number,

  ): Promise<boolean> {

    if (!referenceId) return false;

    const since = new Date(Date.now() - withinMinutes * 60 * 1000);

    return this.notificationModel.hasRecentDuplicate(userId, type, referenceId, since);

  }



  // ── Typed producers (add new notification kinds here) ──



  public async notifyFmsSyncComplete(

    facilityId: string,

    facilityName: string,

    syncLogId: string,

    changesDetected: number,

    excludeUserId?: string,

  ): Promise<void> {

    await this.notifyFacilityOperators({

      type: 'fms_sync_complete',

      title: 'FMS Sync Complete',

      message: `FMS sync finished for ${facilityName}. ${changesDetected} change(s) detected.`,

      priority: changesDetected > 0 ? 'high' : 'normal',

      referenceType: 'fms_sync',

      referenceId: syncLogId,

      facilityId,

      metadata: { changesDetected },

      excludeUserIds: excludeUserId ? [excludeUserId] : undefined,

      expiresInDays: 30,

    });

  }



  public async notifyFmsSyncFailed(

    facilityId: string,

    facilityName: string,

    syncLogId: string,

    errorMessage: string,

    excludeUserId?: string,

  ): Promise<void> {

    await this.notifyFacilityOperators({

      type: 'fms_sync_failed',

      title: 'FMS Sync Failed',

      message: `FMS sync failed for ${facilityName}: ${errorMessage}`,

      priority: 'urgent',

      referenceType: 'fms_sync',

      referenceId: syncLogId,

      facilityId,

      metadata: { errorMessage },

      excludeUserIds: excludeUserId ? [excludeUserId] : undefined,

      expiresInDays: 30,

    });

  }



  public async notifyDeviceLowBattery(

    facilityId: string,

    deviceId: string,

    deviceLabel: string,

    batteryLevel: number,

  ): Promise<void> {

    const userIds = await this.audienceService.resolveFacilityOperators(facilityId);

    await this.dispatchToUsers(

      userIds,

      {

        type: 'device_low_battery',

        title: 'Low Battery Alert',

        message: `${deviceLabel} battery is at ${batteryLevel}% (threshold ${LOW_BATTERY_THRESHOLD_PERCENT}%).`,

        priority: batteryLevel <= 10 ? 'urgent' : 'high',

        referenceType: 'device',

        referenceId: deviceId,

        facilityId,

        metadata: { batteryLevel, threshold: LOW_BATTERY_THRESHOLD_PERCENT },

        expiresInDays: 14,

      },

      DEDUP_MINUTES.device_low_battery,

    );

  }



  public async notifyGatewayOffline(

    facilityId: string,

    gatewayId: string,

    gatewayName: string,

  ): Promise<void> {

    await this.notifyFacilityOperators({

      type: 'gateway_offline',

      title: 'Gateway Offline',

      message: `Gateway "${gatewayName}" went offline.`,

      priority: 'urgent',

      referenceType: 'gateway',

      referenceId: gatewayId,

      facilityId,

      expiresInDays: 7,

    });

  }



  public async notifyGatewayRestored(

    facilityId: string,

    gatewayId: string,

    gatewayName: string,

  ): Promise<void> {

    await this.notifyFacilityOperators({

      type: 'gateway_restored',

      title: 'Gateway Back Online',

      message: `Gateway "${gatewayName}" is online again.`,

      priority: 'normal',

      referenceType: 'gateway',

      referenceId: gatewayId,

      facilityId,

      expiresInDays: 7,

    });

  }



  public async notifyGatewayAlert(

    facilityId: string,

    gatewayId: string,

    gatewayName: string,

    alertMessage: string,

  ): Promise<void> {

    await this.notifyFacilityOperators({

      type: 'gateway_alert',

      title: 'Gateway Alert',

      message: `${gatewayName}: ${alertMessage}`,

      priority: 'high',

      referenceType: 'gateway',

      referenceId: gatewayId,

      facilityId,

      metadata: { alertMessage },

      expiresInDays: 14,

    });

  }



  public async notifyRemoteLockCommandFailed(

    facilityId: string,

    deviceId: string,

    requestedStatus: 'locked' | 'unlocked',

    errorMessage: string,

    metadata?: { gatewayId?: string; unitId?: string },

  ): Promise<void> {

    const actionLabel = requestedStatus === 'locked' ? 'lock' : 'unlock';

    await this.notifyFacilityOperators({

      type: 'gateway_alert',

      title: `Remote ${actionLabel} failed`,

      message: errorMessage,

      priority: 'high',

      referenceType: 'device',

      referenceId: deviceId,

      facilityId,

      metadata: {

        requestedStatus,

        errorMessage,

        ...metadata,

      },

      expiresInDays: 7,

    });

  }



  public async notifyBackendError(

    title: string,

    message: string,

    metadata?: Record<string, unknown>,

  ): Promise<void> {

    await this.notifyDevAdmins({

      type: 'backend_error',

      title,

      message,

      priority: 'urgent',

      referenceType: 'backend',

      referenceId: typeof metadata?.path === 'string' ? metadata.path : undefined,

      metadata,

      expiresInDays: 30,

    });

  }



  /** Loud alert when gateway inventory sync hits duplicate serials or similar commissioning issues. */

  public async notifyDeviceInventorySyncError(params: {

    facilityId: string;

    gatewayId: string;

    syncLogId: string;

    deviceSerial: string;

    deviceKind: DeviceSyncKind;

    title: string;

    message: string;

    priority: 'urgent' | 'high';

    metadata?: Record<string, unknown>;

  }): Promise<void> {

    const userIds = await this.audienceService.resolveFacilityOperators(params.facilityId, {

      roles: [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN],

    });

    const dedupMinutes = DEDUP_MINUTES.device_inventory_sync_error;

    await this.dispatchToUsers(

      userIds,

      {

        type: 'device_inventory_sync_error',

        title: params.title,

        message: params.message,

        priority: params.priority,

        referenceType: 'device_serial',

        referenceId: params.deviceSerial,

        facilityId: params.facilityId,

        metadata: {

          gatewayId: params.gatewayId,

          syncLogId: params.syncLogId,

          deviceKind: params.deviceKind,

          ...params.metadata,

        },

        expiresInDays: NOTIFICATION_UNREAD_RETENTION_DAYS,

      },

      dedupMinutes,

    );

  }

}


