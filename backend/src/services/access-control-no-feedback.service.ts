import { DeviceModel } from '@/models/device.model';
import { logger } from '@/utils/logger';

/**
 * Owns the temporary logical-open window for access points that cannot report
 * open/closed state. Deadlines are persisted so restarts cannot leave a gate
 * permanently shown as open.
 */
export class AccessControlNoFeedbackService {
  private static instance: AccessControlNoFeedbackService;

  private readonly deviceModel = new DeviceModel();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private started = false;

  public static getInstance(): AccessControlNoFeedbackService {
    if (!AccessControlNoFeedbackService.instance) {
      AccessControlNoFeedbackService.instance = new AccessControlNoFeedbackService();
    }
    return AccessControlNoFeedbackService.instance;
  }

  public static resetForTests(): void {
    AccessControlNoFeedbackService.instance?.stop();
    AccessControlNoFeedbackService.instance =
      undefined as unknown as AccessControlNoFeedbackService;
  }

  public async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const devices = await this.deviceModel.findNoFeedbackAccessControlDevicesWithOpenWindow();
    for (const device of devices) {
      if (device.no_feedback_unlock_until) {
        this.schedule(device.id, device.no_feedback_unlock_until);
      }
    }
  }

  public stop(): void {
    this.started = false;
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /** Cancel any in-memory open-window timer without mutating DB state. */
  public cancelOpenWindow(deviceId: string): void {
    this.clearTimer(deviceId);
  }

  public async applyAcceptedCommand(params: {
    deviceId: string;
    requestedStatus: 'locked' | 'unlocked';
    timeoutSec: number;
  }): Promise<void> {
    this.clearTimer(params.deviceId);

    if (params.requestedStatus === 'locked' || params.timeoutSec <= 0) {
      await this.deviceModel.updateAccessControlDevice(params.deviceId, {
        is_locked: true,
        no_feedback_unlock_until: null,
      });
      return;
    }

    const unlockUntil = new Date(Date.now() + params.timeoutSec * 1000);
    await this.deviceModel.updateAccessControlDevice(params.deviceId, {
      is_locked: false,
      no_feedback_unlock_until: unlockUntil,
    });
    this.schedule(params.deviceId, unlockUntil);
  }

  private schedule(deviceId: string, unlockUntil: Date): void {
    this.clearTimer(deviceId);
    const delayMs = Math.max(0, unlockUntil.getTime() - Date.now());
    const timer = setTimeout(() => void this.settleIfDue(deviceId), delayMs);
    timer.unref?.();
    this.timers.set(deviceId, timer);
  }

  private clearTimer(deviceId: string): void {
    const timer = this.timers.get(deviceId);
    if (timer) clearTimeout(timer);
    this.timers.delete(deviceId);
  }

  private async settleIfDue(deviceId: string): Promise<void> {
    this.timers.delete(deviceId);
    try {
      const device = await this.deviceModel.findAccessControlDeviceWithGateway(deviceId);
      if (!device || device.has_lock_feedback !== false || !device.no_feedback_unlock_until) {
        return;
      }

      const unlockUntil = new Date(device.no_feedback_unlock_until);
      if (unlockUntil.getTime() > Date.now()) {
        this.schedule(deviceId, unlockUntil);
        return;
      }

      await this.deviceModel.updateAccessControlDevice(deviceId, {
        is_locked: true,
        no_feedback_unlock_until: null,
      });
    } catch (error) {
      logger.error('Failed to settle access-control no-feedback open window', {
        deviceId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (this.started) {
        const retry = setTimeout(() => void this.settleIfDue(deviceId), 5_000);
        retry.unref?.();
        this.timers.set(deviceId, retry);
      }
    }
  }
}
