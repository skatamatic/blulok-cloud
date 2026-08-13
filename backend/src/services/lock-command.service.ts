import { DeviceModel } from '@/models/device.model';
import { GatewayService } from '@/services/gateway/gateway.service';
import { logger } from '@/utils/logger';
import { lockCommandTimeoutMs } from '@/utils/facility-lock-timeout.utils';
import { resolveRemoteAccessMethod } from '@/utils/access-history-remote.utils';
import { RemoteLockActivityLogger } from '@/services/access/remote-lock-activity-logger.service';
import { ONE_SHOT_ATTRIBUTION_TTL_SEC } from '@/constants/lock-command.constants';
import { randomUUID } from 'crypto';
import {
  LockCommandAttribution,
  LockCommandInitiator,
  PendingLockCommand,
  LockStatus,
  attributionFromAccessSession,
} from '@/services/lock-command-attribution';
import { AccessSessionService } from '@/services/access/access-session.service';

export type {
  LockCommandAttribution,
  LockCommandInitiator,
  LockStatus,
} from '@/services/lock-command-attribution';

/**
 * LockCommandService
 *
 * Orchestrates lock/unlock commands from the cloud UI to facility gateways.
 *
 * Command timers remain process-local. Durable pending attribution for Access History
 * is persisted in access_sessions (see AccessSessionCorrelator). Every production BluLok /
 * access-control lock route passes an initiator so Access History can stamp the user.
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

  /** Test-only: clear pending command timers and drop the singleton. */
  public static resetForTests(): void {
    const existing = LockCommandService.instance;
    if (existing) {
      for (const deviceId of [...existing.pendingCommands.keys()]) {
        existing.clearPending(deviceId);
      }
    }
    LockCommandService.instance = undefined as unknown as LockCommandService;
  }

  public async issueLockCommand(
    deviceId: string,
    requestedStatus: 'locked' | 'unlocked',
    initiator?: LockCommandInitiator,
    options?: {
      tenantUnlockOverride?: {
        reason: string;
        reasonLabel: string;
        notes?: string;
      };
    },
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

    const previousStatus = (deviceRow.lock_status || 'unknown') as LockStatus;
    const gatewayId = String(deviceRow.gateway_id);
    const facilityId = String((deviceRow as { facility_id: string }).facility_id);
    const unitId = (deviceRow as { unit_id?: string | null }).unit_id ?? undefined;
    const failureCtx = {
      facilityId,
      deviceId,
      unitId,
      gatewayId,
      requestedStatus,
      initiator,
      deviceType: 'blulok' as const,
      tenantUnlockOverride: options?.tenantUnlockOverride,
    };

    const remoteLockBlock = this.rejectIfRemoteLockDisabled(
      Boolean((deviceRow as { supports_remote_lock?: boolean }).supports_remote_lock),
      requestedStatus,
      failureCtx,
    );
    if (remoteLockBlock) {
      return remoteLockBlock;
    }

    const recoveryBlock = await this.rejectIfRecoveryBlocking(facilityId, failureCtx);
    if (recoveryBlock) {
      return recoveryBlock;
    }

    const timeoutMs = await this.resolveFacilityLockTimeoutMs(facilityId);
    const oneShot = timeoutMs === 0;
    const attributionTimeoutMs = this.resolveAttributionTimeoutMs(timeoutMs);
    const transitionalStatus: LockStatus =
      requestedStatus === 'locked' ? 'locking' : 'unlocking';

    if (!oneShot) {
      await this.deviceModel.updateLockStatus(deviceId, transitionalStatus);
    }

    this.clearPendingWithSupersede(deviceId);

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
          ...failureCtx,
          errorMessage: message,
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
        tenantUnlockOverride: options?.tenantUnlockOverride,
      });
      return {
        success: false,
        message: 'Failed to send lock command to gateway',
      };
    }

    const timeoutHandle = setTimeout(
      () => void this.handleTimeout(deviceId),
      attributionTimeoutMs,
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
      tenantUnlockOverride: options?.tenantUnlockOverride,
    });

    // Outbound Access History row for remote unlock (physical unlock is logged on state settle).
    if (requestedStatus === 'unlocked' && initiator) {
      const pending = this.peekCommandAttribution(deviceId);
      await RemoteLockActivityLogger.logRemoteAccessGranted({
        facilityId,
        deviceId,
        unitId,
        gatewayId,
        initiator,
        method: resolveRemoteAccessMethod(initiator.role),
        deviceType: 'blulok',
        commandId: pending?.commandId,
        expiresAt: new Date(Date.now() + attributionTimeoutMs),
        tenantUnlockOverride: options?.tenantUnlockOverride,
      });
    }

    if (oneShot) {
      return {
        success: true,
        message: 'Lock command sent',
        lock_status: previousStatus,
        previous_status: previousStatus,
      };
    }

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
    options?: { openUntil?: number },
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
        'access_control_devices.supports_widget_timed_open',
        'access_control_devices.has_lock_feedback',
        'access_control_devices.no_feedback_open_timeout_sec',
      )
      .where('access_control_devices.id', deviceId)
      .first();

    if (!deviceRow) {
      return { success: false, message: 'Device not found' };
    }

    const { validateAccessControlOpenUntil } = await import('@/utils/access-control-open.utils');
    const openUntilValidation = validateAccessControlOpenUntil(options?.openUntil, {
      lockStatus: requestedStatus,
      supportsWidgetTimedOpen: (deviceRow as { supports_widget_timed_open?: boolean })
        .supports_widget_timed_open,
    });
    if (!openUntilValidation.ok) {
      const message = openUntilValidation.message;
      this.recordCommandFailure({
        facilityId: String((deviceRow as { facility_id: string }).facility_id),
        deviceId,
        gatewayId: String((deviceRow as { gateway_id: string }).gateway_id),
        requestedStatus,
        errorMessage: message,
        initiator,
        deviceType: 'access_control',
      });
      return { success: false, message };
    }

    const gatewayId = String(deviceRow.gateway_id);
    const facilityId = String((deviceRow as { facility_id: string }).facility_id);
    const failureCtx = {
      facilityId,
      deviceId,
      gatewayId,
      requestedStatus,
      initiator,
      deviceType: 'access_control' as const,
    };

    const remoteLockBlock = this.rejectIfRemoteLockDisabled(
      Boolean((deviceRow as { supports_remote_lock?: boolean }).supports_remote_lock),
      requestedStatus,
      failureCtx,
    );
    if (remoteLockBlock) {
      return remoteLockBlock;
    }

    const previousLocked = Boolean((deviceRow as { is_locked?: boolean }).is_locked);
    const previousStatus: LockStatus = previousLocked ? 'locked' : 'unlocked';
    const hasLockFeedback =
      (deviceRow as { has_lock_feedback?: boolean | number }).has_lock_feedback === undefined
        ? true
        : Boolean((deviceRow as { has_lock_feedback?: boolean | number }).has_lock_feedback);
    const noFeedbackOpenTimeoutSec = Number(
      (deviceRow as { no_feedback_open_timeout_sec?: number }).no_feedback_open_timeout_sec ?? 0,
    );

    const recoveryBlock = await this.rejectIfRecoveryBlocking(facilityId, failureCtx);
    if (recoveryBlock) {
      return recoveryBlock;
    }

    const command: 'OPEN' | 'CLOSE' = requestedStatus === 'locked' ? 'CLOSE' : 'OPEN';
    const lockCommandOptions =
      command === 'OPEN' && openUntilValidation.openUntil > 0
        ? { open_until: openUntilValidation.openUntil }
        : undefined;

    try {
      const result = await this.gatewayService.sendLockCommand(
        gatewayId,
        deviceId,
        command,
        lockCommandOptions,
      );
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

    this.clearPendingWithSupersede(deviceId);

    if (!hasLockFeedback) {
      try {
        const { AccessControlNoFeedbackService } = await import(
          '@/services/access-control-no-feedback.service'
        );
        await AccessControlNoFeedbackService.getInstance().applyAcceptedCommand({
          deviceId,
          requestedStatus,
          timeoutSec: noFeedbackOpenTimeoutSec,
        });
      } catch (error) {
        logger.error('LockCommandService: failed to update no-feedback logical lock state', {
          deviceId,
          requestedStatus,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (initiator) {
        await RemoteLockActivityLogger.logRemoteCommandSuccess({
          facilityId,
          deviceId,
          gatewayId,
          initiator,
          method: resolveRemoteAccessMethod(initiator.role),
          activityType: requestedStatus === 'locked' ? 'lock' : 'unlock',
        });
      }

      return {
        success: true,
        message:
          requestedStatus === 'unlocked' && noFeedbackOpenTimeoutSec > 0
            ? `Open command accepted for ${noFeedbackOpenTimeoutSec} seconds`
            : 'Lock command sent',
      };
    }

    const timeoutMs = await this.resolveFacilityLockTimeoutMs(facilityId);
    const timeoutHandle = setTimeout(
      () => void this.handleTimeout(deviceId),
      this.resolveAttributionTimeoutMs(timeoutMs),
    );

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

    const settledLocked = Boolean(isLocked);
    const requestedLocked = pending.requestedStatus === 'locked';
    if (settledLocked === requestedLocked) {
      this.clearPending(deviceId);
      const method = resolveRemoteAccessMethod(pending.initiator.role);
      void RemoteLockActivityLogger.logRemoteCommandSuccess({
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
      remoteCommandId: pending.commandId,
      tenantUnlockOverride: pending.tenantUnlockOverride,
    });
  }

  /** True while a remote lock/unlock command is awaiting gateway confirmation (in-process). */
  public hasPendingLockCommand(deviceId: string): boolean {
    return this.pendingCommands.has(deviceId);
  }

  public peekCommandAttribution(deviceId: string): LockCommandAttribution | null {
    const pending = this.pendingCommands.get(deviceId);
    if (!pending?.initiator) {
      return null;
    }
    return {
      commandId: pending.commandId,
      initiator: pending.initiator,
      gatewayId: pending.gatewayId,
      facilityId: pending.facilityId,
      unitId: pending.unitId,
      requestedStatus: pending.requestedStatus,
      deviceType: pending.deviceType,
      tenantUnlockOverride: pending.tenantUnlockOverride,
    };
  }

  /**
   * In-memory pending remote commands for this process (Cloud Run instance-local).
   * Used by the gateway Session trace snapshot.
   */
  public listPendingAttributions(filters: {
    facilityId: string;
    gatewayId?: string;
    deviceId?: string;
    unitId?: string;
    userId?: string;
    gatewayDeviceIds?: Set<string>;
  }): Array<{
    source: 'memory';
    device_id: string;
    command_id: string;
    requested_status: 'locked' | 'unlocked';
    facility_id: string;
    gateway_id?: string | null;
    unit_id?: string | null;
    initiator?: { userId: string; userName: string; role: string };
  }> {
    const rows: Array<{
      source: 'memory';
      device_id: string;
      command_id: string;
      requested_status: 'locked' | 'unlocked';
      facility_id: string;
      gateway_id?: string | null;
      unit_id?: string | null;
      initiator?: { userId: string; userName: string; role: string };
    }> = [];

    for (const [deviceId, pending] of this.pendingCommands.entries()) {
      if (pending.facilityId !== filters.facilityId) continue;
      if (filters.gatewayId && pending.gatewayId !== filters.gatewayId) continue;
      if (filters.deviceId && deviceId !== filters.deviceId) continue;
      if (filters.unitId && pending.unitId !== filters.unitId) continue;
      if (filters.userId && pending.initiator?.userId !== filters.userId) continue;
      if (
        filters.gatewayDeviceIds
        && filters.gatewayDeviceIds.size > 0
        && !filters.gatewayDeviceIds.has(deviceId)
      ) {
        continue;
      }
      rows.push({
        source: 'memory',
        device_id: deviceId,
        command_id: pending.commandId,
        requested_status: pending.requestedStatus,
        facility_id: pending.facilityId,
        gateway_id: pending.gatewayId,
        unit_id: pending.unitId,
        initiator: pending.initiator,
      });
    }
    return rows;
  }

  /**
   * Prefer in-memory pending (same instance), else durable access_sessions pending row.
   * Used when state sync may land on a different Cloud Run instance than the command.
   */
  public async peekCommandAttributionDurable(deviceId: string): Promise<LockCommandAttribution | null> {
    const local = this.peekCommandAttribution(deviceId);
    if (local) return local;
    try {
      const session = await AccessSessionService.getInstance().findPendingByDevice(deviceId);
      if (!session || session.origin !== 'cloud_remote') return null;
      return attributionFromAccessSession(session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('LockCommandService: durable attribution lookup failed', { deviceId, error: message });
      return null;
    }
  }

  /**
   * Atomically consume pending attribution when settlement matches.
   * Returns null if commandId/status do not match (prevents TOCTOU mis-binding).
   */
  public tryConsumeAttribution(
    deviceId: string,
    expected: { commandId: string; requestedStatus: 'locked' | 'unlocked' },
  ): LockCommandAttribution | null {
    const pending = this.pendingCommands.get(deviceId);
    if (!pending?.initiator) {
      return null;
    }
    if (pending.commandId !== expected.commandId) {
      return null;
    }
    if (pending.requestedStatus !== expected.requestedStatus) {
      return null;
    }
    const attribution = this.peekCommandAttribution(deviceId);
    this.clearPending(deviceId);
    return attribution;
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

  private storePendingAttribution(params: Omit<PendingLockCommand, 'commandId'> & { commandId?: string }): void {
    const commandId = params.commandId ?? randomUUID();
    this.pendingCommands.set(params.deviceId, { ...params, commandId });
  }

  /**
   * Clear any prior pending command. If an initiator was waiting, log a superseded failure
   * so attribution cannot silently transfer to a later unlock.
   */
  private clearPendingWithSupersede(deviceId: string): void {
    const pending = this.pendingCommands.get(deviceId);
    if (pending?.initiator) {
      this.recordCommandFailure({
        facilityId: pending.facilityId,
        deviceId,
        unitId: pending.unitId,
        gatewayId: pending.gatewayId,
        requestedStatus: pending.requestedStatus,
        errorMessage: 'Remote command superseded by a newer remote command',
        initiator: pending.initiator,
        deviceType: pending.deviceType,
        tenantUnlockOverride: pending.tenantUnlockOverride,
      });
    }
    this.clearPending(deviceId);
  }

  private rejectIfRemoteLockDisabled(
    supportsRemoteLock: boolean,
    requestedStatus: 'locked' | 'unlocked',
    ctx: {
      facilityId: string;
      deviceId: string;
      unitId?: string;
      gatewayId: string;
      requestedStatus: 'locked' | 'unlocked';
      initiator?: LockCommandInitiator;
      deviceType: 'blulok' | 'access_control';
      tenantUnlockOverride?: {
        reason: string;
        reasonLabel: string;
        notes?: string;
      };
    },
  ): { success: false; message: string } | null {
    if (requestedStatus !== 'locked' || supportsRemoteLock) {
      return null;
    }
    const message = 'Remote lock is not enabled for this device; re-lock manually on site.';
    this.recordCommandFailure({
      ...ctx,
      errorMessage: message,
    });
    return { success: false, message };
  }

  private async rejectIfRecoveryBlocking(
    facilityId: string,
    ctx: {
      facilityId: string;
      deviceId: string;
      unitId?: string;
      gatewayId: string;
      requestedStatus: 'locked' | 'unlocked';
      initiator?: LockCommandInitiator;
      deviceType: 'blulok' | 'access_control';
      tenantUnlockOverride?: {
        reason: string;
        reasonLabel: string;
        notes?: string;
      };
    },
  ): Promise<{ success: false; message: string } | null> {
    const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
    if (!(await GatewayRecoveryService.isBlockingActiveForFacility(facilityId))) {
      return null;
    }
    const message =
      'Gateway recovery in progress — lock commands blocked until recovery completes or is bypassed';
    this.recordCommandFailure({
      ...ctx,
      errorMessage: message,
    });
    return { success: false, message };
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
    remoteCommandId?: string;
    tenantUnlockOverride?: {
      reason: string;
      reasonLabel: string;
      notes?: string;
    };
  }): void {
    void this.notifyLockCommandFailure(params);
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

  /**
   * Facility timeout 0 = one-shot UI (no transitional state), but attribution still needs a TTL.
   */
  private resolveAttributionTimeoutMs(facilityTimeoutMs: number): number {
    if (facilityTimeoutMs > 0) return facilityTimeoutMs;
    return ONE_SHOT_ATTRIBUTION_TTL_SEC * 1000;
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
    remoteCommandId?: string;
    tenantUnlockOverride?: {
      reason: string;
      reasonLabel: string;
      notes?: string;
    };
  }): void {
    void (async () => {
      if (!(await this.facilityExists(params.facilityId))) {
        logger.warn('LockCommandService: skipping lock command failure side effects for deleted facility', {
          facilityId: params.facilityId,
          deviceId: params.deviceId,
        });
        return;
      }

      await RemoteLockActivityLogger.logRemoteCommandFailure(params);

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
          remoteCommandId: pending.commandId,
          tenantUnlockOverride: pending.tenantUnlockOverride,
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
            remoteCommandId: pending.commandId,
            tenantUnlockOverride: pending.tenantUnlockOverride,
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
          remoteCommandId: pending.commandId,
          tenantUnlockOverride: pending.tenantUnlockOverride,
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
