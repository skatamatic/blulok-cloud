import { DeviceModel } from '@/models/device.model';
import { GatewayService } from '@/services/gateway/gateway.service';
import { logger } from '@/utils/logger';
import { lockCommandTimeoutMs } from '@/utils/facility-lock-timeout.utils';
import { resolveRemoteAccessMethod } from '@/utils/access-history-remote.utils';

type LockStatus =
  | 'locked'
  | 'unlocked'
  | 'locking'
  | 'unlocking'
  | 'error'
  | 'maintenance'
  | 'unknown';

export interface LockCommandInitiator {
  userId: string;
  userName: string;
  role: string;
}

export interface LockCommandAttribution {
  initiator: LockCommandInitiator;
  gatewayId: string;
  facilityId: string;
  unitId?: string;
  requestedStatus: 'locked' | 'unlocked';
}

interface PendingLockCommand {
  deviceId: string;
  previousStatus: LockStatus;
  requestedStatus: 'locked' | 'unlocked';
  timeoutHandle?: NodeJS.Timeout;
  initiator?: LockCommandInitiator;
  gatewayId: string;
  facilityId: string;
  unitId?: string;
  deviceType: 'blulok' | 'access_control';
}

/**
 * LockCommandService
 *
 * Orchestrates lock/unlock commands from the cloud UI to facility gateways.
 */
export class LockCommandService {
  private static instance: LockCommandService;

  private readonly deviceModel: DeviceModel;
  private readonly gatewayService: GatewayService;
  private readonly pendingCommands = new Map<string, PendingLockCommand>();
  /** Skips one lock-activity log row after timeout-driven status revert. */
  private readonly suppressRevertActivityLog = new Set<string>();

  private constructor() {
    this.deviceModel = new DeviceModel();
    this.gatewayService = GatewayService.getInstance();
  }

  public static getInstance(): LockCommandService {
    if (!LockCommandService.instance) {
      LockCommandService.instance = new LockCommandService();
    }
    return LockCommandService.instance;
  }

  public async issueLockCommand(
    deviceId: string,
    requestedStatus: 'locked' | 'unlocked',
    initiator?: LockCommandInitiator,
  ): Promise<{
    success: boolean;
    message: string;
    lock_status?: LockStatus;
    previous_status?: LockStatus;
  }> {
    const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
    const deviceRow = await knex('blulok_devices')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .select(
        'blulok_devices.id',
        'blulok_devices.lock_status',
        'blulok_devices.supports_remote_lock',
        'blulok_devices.unit_id',
        'gateways.id as gateway_id',
        'gateways.facility_id',
      )
      .where('blulok_devices.id', deviceId)
      .first();

    if (!deviceRow) {
      return { success: false, message: 'Device not found' };
    }

    const supportsRemoteLock = Boolean((deviceRow as { supports_remote_lock?: boolean }).supports_remote_lock);
    if (requestedStatus === 'locked' && !supportsRemoteLock) {
      const message = 'Remote lock is not enabled for this device; re-lock manually on site.';
      this.recordCommandFailure({
        facilityId: String(deviceRow.facility_id),
        deviceId,
        unitId: (deviceRow as { unit_id?: string | null }).unit_id ?? undefined,
        gatewayId: String(deviceRow.gateway_id),
        requestedStatus,
        errorMessage: message,
        initiator,
        deviceType: 'blulok',
      });
      return { success: false, message };
    }

    const previousStatus = (deviceRow.lock_status || 'unknown') as LockStatus;
    const gatewayId = String(deviceRow.gateway_id);
    const facilityId = String((deviceRow as { facility_id: string }).facility_id);
    const unitId = (deviceRow as { unit_id?: string | null }).unit_id ?? undefined;

    const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
    if (await GatewayRecoveryService.isBlockingActiveForFacility(facilityId)) {
      const message =
        'Gateway recovery in progress — lock commands blocked until recovery completes or is bypassed';
      this.recordCommandFailure({
        facilityId,
        deviceId,
        unitId,
        gatewayId,
        requestedStatus,
        errorMessage: message,
        initiator,
        deviceType: 'blulok',
      });
      return { success: false, message };
    }

    const timeoutMs = await this.resolveFacilityLockTimeoutMs(facilityId);
    const oneShot = timeoutMs === 0;
    const transitionalStatus: LockStatus =
      requestedStatus === 'locked' ? 'locking' : 'unlocking';

    if (!oneShot) {
      await this.deviceModel.updateLockStatus(deviceId, transitionalStatus);
    }

    this.clearPending(deviceId);

    try {
      const command: 'OPEN' | 'CLOSE' =
        requestedStatus === 'locked' ? 'CLOSE' : 'OPEN';

      const result = await this.gatewayService.sendLockCommand(
        gatewayId,
        deviceId,
        command,
      );

      if (!result.success) {
        if (!oneShot) {
          await this.deviceModel.updateLockStatus(deviceId, previousStatus);
        }
        const message =
          result.error || 'Gateway reported failure executing lock command';
        logger.warn('LockCommandService: gateway command failed', {
          deviceId,
          gatewayId,
          previousStatus,
          requestedStatus,
          error: result.error,
        });
        this.recordCommandFailure({
          facilityId,
          deviceId,
          unitId,
          gatewayId,
          requestedStatus,
          errorMessage: message,
          initiator,
          deviceType: 'blulok',
        });
        return { success: false, message };
      }
    } catch (error: any) {
      if (!oneShot) {
        await this.deviceModel.updateLockStatus(deviceId, previousStatus);
      }
      const failureMessage = error?.message || 'Failed to send lock command to gateway';
      logger.error('LockCommandService: error sending lock command', {
        deviceId,
        gatewayId,
        previousStatus,
        requestedStatus,
        error: failureMessage,
      });
      this.recordCommandFailure({
        facilityId,
        deviceId,
        unitId,
        gatewayId,
        requestedStatus,
        errorMessage: failureMessage,
        initiator,
        deviceType: 'blulok',
      });
      return {
        success: false,
        message: 'Failed to send lock command to gateway',
      };
    }

    if (oneShot) {
      this.storePendingAttribution({
        deviceId,
        previousStatus,
        requestedStatus,
        initiator,
        gatewayId,
        facilityId,
        unitId,
        deviceType: 'blulok',
      });
      return {
        success: true,
        message: 'Lock command sent',
        lock_status: previousStatus,
        previous_status: previousStatus,
      };
    }

    const timeoutHandle = setTimeout(
      () => void this.handleTimeout(deviceId),
      timeoutMs,
    );

    this.storePendingAttribution({
      deviceId,
      previousStatus,
      requestedStatus,
      timeoutHandle,
      initiator,
      gatewayId,
      facilityId,
      unitId,
      deviceType: 'blulok',
    });

    return {
      success: true,
      message: 'Lock command accepted and in progress',
      lock_status: transitionalStatus,
      previous_status: previousStatus,
    };
  }

  public async issueAccessControlLockCommand(
    deviceId: string,
    requestedStatus: 'locked' | 'unlocked',
    initiator?: LockCommandInitiator,
  ): Promise<{ success: boolean; message: string }> {
    const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
    const deviceRow = await knex('access_control_devices')
      .join('gateways', 'access_control_devices.gateway_id', 'gateways.id')
      .select(
        'access_control_devices.id',
        'gateways.id as gateway_id',
        'gateways.facility_id',
        'access_control_devices.is_locked',
        'access_control_devices.supports_remote_lock',
      )
      .where('access_control_devices.id', deviceId)
      .first();

    if (!deviceRow) {
      return { success: false, message: 'Device not found' };
    }

    const supportsRemoteLock = Boolean((deviceRow as { supports_remote_lock?: boolean }).supports_remote_lock);
    if (requestedStatus === 'locked' && !supportsRemoteLock) {
      const message = 'Remote lock is not enabled for this device; re-lock manually on site.';
      this.recordCommandFailure({
        facilityId: String(deviceRow.facility_id),
        deviceId,
        gatewayId: String(deviceRow.gateway_id),
        requestedStatus,
        errorMessage: message,
        initiator,
        deviceType: 'access_control',
      });
      return { success: false, message };
    }

    const gatewayId = String(deviceRow.gateway_id);
    const facilityId = String((deviceRow as { facility_id: string }).facility_id);
    const previousLocked = Boolean((deviceRow as { is_locked?: boolean }).is_locked);
    const previousStatus: LockStatus = previousLocked ? 'locked' : 'unlocked';

    const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
    if (await GatewayRecoveryService.isBlockingActiveForFacility(facilityId)) {
      const message =
        'Gateway recovery in progress — lock commands blocked until recovery completes or is bypassed';
      this.recordCommandFailure({
        facilityId,
        deviceId,
        gatewayId,
        requestedStatus,
        errorMessage: message,
        initiator,
        deviceType: 'access_control',
      });
      return { success: false, message };
    }

    const command: 'OPEN' | 'CLOSE' = requestedStatus === 'locked' ? 'CLOSE' : 'OPEN';

    try {
      const result = await this.gatewayService.sendLockCommand(gatewayId, deviceId, command);
      if (!result.success) {
        const message = result.error || 'Gateway reported failure executing lock command';
        logger.warn('LockCommandService: access-control gateway command failed', {
          deviceId,
          gatewayId,
          error: result.error,
        });
        this.recordCommandFailure({
          facilityId,
          deviceId,
          gatewayId,
          requestedStatus,
          errorMessage: message,
          initiator,
          deviceType: 'access_control',
        });
        return { success: false, message };
      }
    } catch (error: any) {
      const failureMessage = error?.message || 'Failed to send lock command to gateway';
      logger.error('LockCommandService: access-control lock command error', {
        deviceId,
        gatewayId,
        error: failureMessage,
      });
      this.recordCommandFailure({
        facilityId,
        deviceId,
        gatewayId,
        requestedStatus,
        errorMessage: failureMessage,
        initiator,
        deviceType: 'access_control',
      });
      return { success: false, message: 'Failed to send lock command to gateway' };
    }

    this.clearPending(deviceId);

    const timeoutMs = await this.resolveFacilityLockTimeoutMs(facilityId);
    const timeoutHandle =
      timeoutMs > 0
        ? setTimeout(
            () => void this.handleTimeout(deviceId),
            timeoutMs,
          )
        : undefined;

    this.storePendingAttribution({
      deviceId,
      previousStatus,
      requestedStatus,
      timeoutHandle,
      initiator,
      gatewayId,
      facilityId,
      deviceType: 'access_control',
    });

    return { success: true, message: 'Lock command accepted and in progress' };
  }

  /**
   * Called when gateway/sync reports a settled access-control lock state while a remote command is pending.
   */
  public handleAccessControlLockSettled(deviceId: string, isLocked: boolean): void {
    const pending = this.pendingCommands.get(deviceId);
    if (!pending || pending.deviceType !== 'access_control' || !pending.initiator) {
      return;
    }

    const requestedLocked = pending.requestedStatus === 'locked';
    if (isLocked === requestedLocked) {
      this.clearPending(deviceId);
      const method = resolveRemoteAccessMethod(pending.initiator.role);
      void this.logRemoteCommandSuccess({
        facilityId: pending.facilityId,
        deviceId,
        gatewayId: pending.gatewayId,
        initiator: pending.initiator,
        method,
        activityType: requestedLocked ? 'lock' : 'unlock',
      });
      return;
    }

    this.recordRemoteCommandSettlementMismatch({
      deviceId,
      facilityId: pending.facilityId,
      unitId: pending.unitId,
      gatewayId: pending.gatewayId,
      deviceType: 'access_control',
      requestedStatus: pending.requestedStatus,
      message:
        pending.requestedStatus === 'unlocked'
          ? 'Remote unlock failed: access point did not open'
          : 'Remote lock failed: access point did not close',
    });
  }

  /**
   * Remote command did not reach the requested terminal state (sync reported opposite state).
   */
  public recordRemoteCommandSettlementMismatch(params: {
    deviceId: string;
    facilityId: string;
    unitId?: string;
    gatewayId: string;
    deviceType: 'blulok' | 'access_control';
    requestedStatus: 'locked' | 'unlocked';
    message: string;
  }): void {
    const pending = this.pendingCommands.get(params.deviceId);
    if (!pending?.initiator) {
      return;
    }

    this.clearPending(params.deviceId);
    this.recordCommandFailure({
      facilityId: params.facilityId,
      deviceId: params.deviceId,
      unitId: params.unitId ?? pending.unitId,
      gatewayId: params.gatewayId,
      requestedStatus: params.requestedStatus,
      errorMessage: params.message,
      initiator: pending.initiator,
      deviceType: params.deviceType,
    });
  }

  public peekCommandAttribution(deviceId: string): LockCommandAttribution | null {
    const pending = this.pendingCommands.get(deviceId);
    if (!pending?.initiator) {
      return null;
    }
    return {
      initiator: pending.initiator,
      gatewayId: pending.gatewayId,
      facilityId: pending.facilityId,
      unitId: pending.unitId,
      requestedStatus: pending.requestedStatus,
    };
  }

  public acknowledgeCommandAttribution(deviceId: string): void {
    this.clearPending(deviceId);
  }

  /** Returns true once for timeout revert rows that should not duplicate failure logs. */
  public consumeSuppressRevertActivityLog(deviceId: string): boolean {
    if (!this.suppressRevertActivityLog.has(deviceId)) {
      return false;
    }
    this.suppressRevertActivityLog.delete(deviceId);
    return true;
  }

  /**
   * Cancel in-memory pending lock commands for a facility (e.g. before hard delete).
   * Prevents stale timeouts from firing after the facility row is removed.
   */
  public cancelPendingCommandsForFacility(facilityId: string): void {
    for (const [deviceId, pending] of this.pendingCommands.entries()) {
      if (pending.facilityId === facilityId) {
        this.clearPending(deviceId);
      }
    }
  }

  private storePendingAttribution(params: PendingLockCommand): void {
    this.pendingCommands.set(params.deviceId, params);
  }

  private recordCommandFailure(params: {
    facilityId: string;
    deviceId: string;
    unitId?: string;
    gatewayId?: string;
    requestedStatus: 'locked' | 'unlocked';
    errorMessage: string;
    initiator?: LockCommandInitiator;
    deviceType: 'blulok' | 'access_control';
  }): void {
    void this.notifyLockCommandFailure(params);
  }

  private async logRemoteCommandSuccess(params: {
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
      logger.error('LockCommandService: failed to log access-control remote command success', {
        deviceId: params.deviceId,
        error: message,
      });
    }
  }

  private async logRemoteCommandFailure(params: {
    facilityId: string;
    deviceId: string;
    unitId?: string;
    gatewayId?: string;
    requestedStatus: 'locked' | 'unlocked';
    errorMessage: string;
    initiator?: LockCommandInitiator;
    deviceType: 'blulok' | 'access_control';
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
        metadata: {
          action,
          method,
          initiated_remotely: true,
          gateway_id: params.gatewayId ?? null,
          initiated_by: {
            id: params.initiator.userId,
            name: params.initiator.userName,
            role: params.initiator.role,
          },
          device_type: params.deviceType,
          ...(params.errorMessage.toLowerCase().includes('timeout')
            ? { denial_reason: 'timeout' }
            : params.errorMessage.toLowerCase().includes('remained')
              ? { denial_reason: 'settlement_mismatch' }
              : {}),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('LockCommandService: failed to log remote command failure to access history', {
        deviceId: params.deviceId,
        error: message,
      });
    }
  }

  private async facilityExists(facilityId: string): Promise<boolean> {
    try {
      const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
      const row = await knex('facilities').where('id', facilityId).select('id').first();
      return Boolean(row);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('LockCommandService: failed to verify facility existence', {
        facilityId,
        error: message,
      });
      return false;
    }
  }

  private async resolveFacilityLockTimeoutMs(facilityId: string): Promise<number> {
    try {
      const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
      const row = await knex('facilities')
        .where('id', facilityId)
        .select('lock_command_timeout_sec')
        .first();
      return lockCommandTimeoutMs(row?.lock_command_timeout_sec);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('LockCommandService: failed to resolve facility lock timeout; using default', {
        facilityId,
        error: message,
      });
      return lockCommandTimeoutMs(undefined);
    }
  }

  private notifyLockCommandFailure(params: {
    facilityId: string;
    deviceId: string;
    requestedStatus: 'locked' | 'unlocked';
    errorMessage: string;
    gatewayId?: string;
    unitId?: string;
    initiator?: LockCommandInitiator;
    deviceType: 'blulok' | 'access_control';
  }): void {
    void (async () => {
      if (!(await this.facilityExists(params.facilityId))) {
        logger.warn('LockCommandService: skipping lock command failure side effects for deleted facility', {
          facilityId: params.facilityId,
          deviceId: params.deviceId,
        });
        return;
      }

      await this.logRemoteCommandFailure(params);

      try {
        const { InAppNotificationDispatcher } = await import(
          '@/services/notifications/in-app-notification-dispatcher.service'
        );
        await InAppNotificationDispatcher.getInstance().notifyRemoteLockCommandFailed(
          params.facilityId,
          params.deviceId,
          params.requestedStatus,
          params.errorMessage,
          {
            gatewayId: params.gatewayId,
            unitId: params.unitId,
          },
        );
      } catch (notifyErr: unknown) {
        const message = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        logger.error('LockCommandService: failed to dispatch lock command failure notification', {
          deviceId: params.deviceId,
          error: message,
        });
      }
    })();
  }

  private clearPending(deviceId: string): void {
    const pending = this.pendingCommands.get(deviceId);
    if (pending) {
      if (pending.timeoutHandle) {
        clearTimeout(pending.timeoutHandle);
      }
      this.pendingCommands.delete(deviceId);
    }
  }

  private async handleTimeout(deviceId: string): Promise<void> {
    const pending = this.pendingCommands.get(deviceId);
    this.pendingCommands.delete(deviceId);
    if (pending?.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }

    const timeoutMessage = 'Gateway did not confirm lock command before timeout';

    if (!pending) {
      return;
    }

    if (!(await this.facilityExists(pending.facilityId))) {
      logger.warn('LockCommandService: lock command timeout for deleted facility, skipping failure side effects', {
        deviceId,
        facilityId: pending.facilityId,
      });
      return;
    }

    if (pending.deviceType === 'access_control') {
      if (pending.initiator) {
        this.recordCommandFailure({
          facilityId: pending.facilityId,
          deviceId,
          gatewayId: pending.gatewayId,
          requestedStatus: pending.requestedStatus,
          errorMessage: timeoutMessage,
          initiator: pending.initiator,
          deviceType: 'access_control',
        });
      }
      return;
    }

    const transitionalStatus: LockStatus =
      pending.requestedStatus === 'locked' ? 'locking' : 'unlocking';
    const previousStatus = pending.previousStatus;

    try {
      const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
      const current = await knex('blulok_devices')
        .where('id', deviceId)
        .select('lock_status')
        .first();

      const currentStatus = (current?.lock_status || 'unknown') as LockStatus;

      if (currentStatus !== transitionalStatus) {
        if (pending.initiator) {
          this.recordCommandFailure({
            facilityId: pending.facilityId,
            deviceId,
            unitId: pending.unitId,
            gatewayId: pending.gatewayId,
            requestedStatus: pending.requestedStatus,
            errorMessage: timeoutMessage,
            initiator: pending.initiator,
            deviceType: 'blulok',
          });
        }
        return;
      }

      if (pending.initiator) {
        this.recordCommandFailure({
          facilityId: pending.facilityId,
          deviceId,
          unitId: pending.unitId,
          gatewayId: pending.gatewayId,
          requestedStatus: pending.requestedStatus,
          errorMessage: timeoutMessage,
          initiator: pending.initiator,
          deviceType: 'blulok',
        });
      }

      this.suppressRevertActivityLog.add(deviceId);
      await this.deviceModel.updateLockStatus(deviceId, previousStatus);

      logger.error('LockCommandService: lock command timeout, reverting state', {
        deviceId,
        previousStatus,
        transitionalStatus,
      });
    } catch (error: any) {
      logger.error('LockCommandService: error handling timeout', {
        deviceId,
        error: error?.message || String(error),
      });
    }
  }
}
