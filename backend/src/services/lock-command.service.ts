import { DeviceModel } from '@/models/device.model';
import { GatewayService } from '@/services/gateway/gateway.service';
import { logger } from '@/utils/logger';

type LockStatus =
  | 'locked'
  | 'unlocked'
  | 'locking'
  | 'unlocking'
  | 'error'
  | 'maintenance'
  | 'unknown';

interface PendingLockCommand {
  deviceId: string;
  previousStatus: LockStatus;
  requestedStatus: Exclude<LockStatus, 'locking' | 'unlocking' | 'unknown'>;
  timeoutHandle: NodeJS.Timeout;
}

/**
 * LockCommandService
 *
 * Orchestrates lock/unlock commands from the cloud UI to facility gateways.
 *
 * Responsibilities:
 * - Transition devices into in-flight states ('locking' / 'unlocking') while commands are pending.
 * - Delegate command execution to GatewayService.
 * - Rely on device-sync as the source of truth for final lock status.
 * - Revert to the previous state if no device-sync arrives within a timeout window.
 *
 * Design notes:
 * - This service maintains a small in-memory map of pending commands keyed by deviceId.
 * - On timeout, the current DB state is checked; if the device is still in the transitional
 *   state, it is reverted to the previous status and an error is logged.
 */
export class LockCommandService {
  private static instance: LockCommandService;

  private readonly deviceModel: DeviceModel;
  private readonly gatewayService: GatewayService;
  private readonly pendingCommands = new Map<string, PendingLockCommand>();

  // Default timeout (ms) before reverting lock status if no device-sync is received
  private readonly defaultTimeoutMs: number;

  private constructor(timeoutMs?: number) {
    this.deviceModel = new DeviceModel();
    this.gatewayService = GatewayService.getInstance();
    this.defaultTimeoutMs = timeoutMs ?? 10_000;
  }

  public static getInstance(): LockCommandService {
    if (!LockCommandService.instance) {
      LockCommandService.instance = new LockCommandService();
    }
    return LockCommandService.instance;
  }

  /**
   * Issue a lock/unlock command for a BluLok device.
   *
   * This method:
   * - Validates the requested target status (locked/unlocked)
   * - Loads the device and its gateway
   * - Updates lock_status to 'locking' / 'unlocking'
   * - Sends the lock command via GatewayService
   * - Schedules a timeout to revert to previous status if no device-sync arrives
   */
  public async issueLockCommand(
    deviceId: string,
    requestedStatus: 'locked' | 'unlocked',
  ): Promise<{
    success: boolean;
    message: string;
    lock_status?: LockStatus;
    previous_status?: LockStatus;
  }> {
    // Look up device and gateway
    const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
    const deviceRow = await knex('blulok_devices')
      .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
      .select(
        'blulok_devices.id',
        'blulok_devices.lock_status',
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

    // Determine transitional status
    const transitionalStatus: LockStatus =
      requestedStatus === 'locked' ? 'locking' : 'unlocking';

    // Update DB to transitional state immediately
    await this.deviceModel.updateLockStatus(deviceId, transitionalStatus);

    // Clear any existing pending command for this device
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
        // Revert immediately on explicit gateway failure
        await this.deviceModel.updateLockStatus(deviceId, previousStatus);
        const message =
          result.error || 'Gateway reported failure executing lock command';
        logger.warn('LockCommandService: gateway command failed', {
          deviceId,
          gatewayId,
          previousStatus,
          requestedStatus,
          error: result.error,
        });
        return { success: false, message };
      }
    } catch (error: any) {
      // Revert on unexpected errors
      await this.deviceModel.updateLockStatus(deviceId, previousStatus);
      logger.error('LockCommandService: error sending lock command', {
        deviceId,
        gatewayId,
        previousStatus,
        requestedStatus,
        error: error?.message || String(error),
      });
      return {
        success: false,
        message: 'Failed to send lock command to gateway',
      };
    }

    // Schedule timeout to revert if no device-sync resolves the transition
    const timeoutHandle = setTimeout(
      () => void this.handleTimeout(deviceId, transitionalStatus, previousStatus),
      this.defaultTimeoutMs,
    );

    this.pendingCommands.set(deviceId, {
      deviceId,
      previousStatus,
      requestedStatus,
      timeoutHandle,
    });

    return {
      success: true,
      message: 'Lock command accepted and in progress',
      lock_status: transitionalStatus,
      previous_status: previousStatus,
    };
  }

  /**
   * Clear any pending timeout for a given device.
   */
  private clearPending(deviceId: string): void {
    const pending = this.pendingCommands.get(deviceId);
    if (pending) {
      clearTimeout(pending.timeoutHandle);
      this.pendingCommands.delete(deviceId);
    }
  }

  /**
   * Timeout handler: if the device is still in the transitional state when the
   * timeout fires, revert it to the previous status and log an error.
   *
   * Device sync remains the source of truth – if a sync has already updated
   * the device to a final status, this method is a no-op.
   */
  private async handleTimeout(
    deviceId: string,
    transitionalStatus: LockStatus,
    previousStatus: LockStatus,
  ): Promise<void> {
    this.pendingCommands.delete(deviceId);

    try {
      const knex = (this.deviceModel as any).db.connection as import('knex').Knex;
      const current = await knex('blulok_devices')
        .where('id', deviceId)
        .select('lock_status')
        .first();

      const currentStatus = (current?.lock_status || 'unknown') as LockStatus;

      if (currentStatus !== transitionalStatus) {
        // Device sync has already resolved the status; nothing to do.
        return;
      }

      // Revert to previous state and log for observability
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


