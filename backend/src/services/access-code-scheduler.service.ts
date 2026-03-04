import { DatabaseService } from '@/services/database.service';
import { AccessCodePushDeliveryError, AccessCodeService } from '@/services/access-code.service';
import { logger } from '@/utils/logger';

export class AccessCodeSchedulerService {
  private static instance: AccessCodeSchedulerService;
  private accessCodes = AccessCodeService.getInstance();
  private intervalId: NodeJS.Timeout | null = null;
  private runInProgress = false;
  private nextRunNotBeforeMs = 0;
  private readonly CHECK_INTERVAL_MS = Math.max(
    250,
    Number(process.env.ACCESS_CODE_SCHEDULER_INTERVAL_MS || 1000),
  );
  private readonly POOL_TIMEOUT_BACKOFF_MS = Math.max(
    this.CHECK_INTERVAL_MS,
    Number(process.env.ACCESS_CODE_SCHEDULER_POOL_BACKOFF_MS || 30_000),
  );
  private lastRunByGroup = new Map<string, number>();
  private retryAtByGroup = new Map<string, number>();

  // Resolve DB lazily to avoid construction-time dependency on DB initialization order
  private get db() {
    return DatabaseService.getInstance().connection;
  }

  public static getInstance(): AccessCodeSchedulerService {
    if (!this.instance) this.instance = new AccessCodeSchedulerService();
    return this.instance;
  }

  public start(): void {
    if (this.intervalId) {
      logger.warn('AccessCodeSchedulerService is already started');
      return;
    }

    this.runSafe('Initial access code scheduler run failed (non-fatal):');
    this.intervalId = setInterval(async () => {
      await this.runSafe('Scheduled access code rotation failed (non-fatal):');
    }, this.CHECK_INTERVAL_MS);
    logger.info('AccessCodeSchedulerService started');
  }

  public stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    logger.info('AccessCodeSchedulerService stopped');
  }

  private shouldRotate(
    now: Date,
    config: { rotation_hour: number; rotation_minute: number; rotation_interval_hours: number },
    lastRunMs?: number,
  ): boolean {
    const dueToday = new Date(now);
    dueToday.setHours(config.rotation_hour, config.rotation_minute, 0, 0);
    if (now < dueToday) return false;
    if (!lastRunMs) return true;
    const elapsedHours = (now.getTime() - lastRunMs) / (1000 * 60 * 60);
    return elapsedHours >= config.rotation_interval_hours;
  }

  private shouldRetryPush(groupId: string, nowMs: number): boolean {
    const retryAt = this.retryAtByGroup.get(groupId);
    return retryAt !== undefined && nowMs >= retryAt;
  }

  private isPushDeliveryError(error: unknown): boolean {
    const pushErrorCtor: any = AccessCodePushDeliveryError;
    const byCtor = typeof pushErrorCtor === 'function' ? error instanceof pushErrorCtor : false;
    return byCtor || (error as any)?.name === 'AccessCodePushDeliveryError';
  }

  private isPoolAcquireTimeout(error: unknown): boolean {
    const maybeError = error as any;
    const name = typeof maybeError?.name === 'string' ? maybeError.name : '';
    const message = typeof maybeError?.message === 'string' ? maybeError.message : '';
    return name === 'KnexTimeoutError' || /Timeout acquiring a connection/i.test(message);
  }

  private async runSafe(errorPrefix: string): Promise<void> {
    const nowMs = Date.now();
    if (nowMs < this.nextRunNotBeforeMs) {
      return;
    }
    if (this.runInProgress) {
      return;
    }

    this.runInProgress = true;
    try {
      await this.run();
      this.nextRunNotBeforeMs = 0;
    } catch (error) {
      if (this.isPoolAcquireTimeout(error)) {
        this.nextRunNotBeforeMs = Date.now() + this.POOL_TIMEOUT_BACKOFF_MS;
        logger.error(
          `${errorPrefix} ${String((error as any)?.message || error)}; backing off scheduler for ${this.POOL_TIMEOUT_BACKOFF_MS}ms`,
        );
        return;
      }
      logger.error(errorPrefix, error);
    } finally {
      this.runInProgress = false;
    }
  }

  private async run(): Promise<void> {
    const now = new Date();
    const groups = await this.db('device_groups')
      .select('id', 'facility_id')
      .where('group_type', 'access_code')
      .andWhere('is_active', true);

    for (const row of groups) {
      const groupId = String(row.id);
      const facilityId = String(row.facility_id);
      const groupConfig = await this.accessCodes.getGroupConfig(groupId);
      if (!groupConfig.is_enabled) continue;

      let lastRunMs = this.lastRunByGroup.get(groupId);
      if (!lastRunMs) {
        const latestCode = await this.db('access_codes')
          .select('created_at')
          .where('facility_id', facilityId)
          .andWhere('scope_type', 'device_group')
          .andWhere('scope_id', groupId)
          .where('is_active', true)
          .orderBy('created_at', 'desc')
          .first();
        if (latestCode?.created_at) {
          lastRunMs = new Date(latestCode.created_at as string | Date).getTime();
        }
      }
      const due = this.shouldRotate(
        now,
        {
          rotation_hour: Number(groupConfig.rotation_hour),
          rotation_minute: Number(groupConfig.rotation_minute),
          rotation_interval_hours: Number(groupConfig.rotation_interval_hours),
        },
        lastRunMs,
      );
      const shouldRetry = this.shouldRetryPush(groupId, now.getTime());
      if (!due && !shouldRetry) continue;

      try {
        await this.accessCodes.forceRotate(facilityId, 'device_group', groupId);
        this.lastRunByGroup.set(groupId, now.getTime());
        this.retryAtByGroup.delete(groupId);
        logger.info(`Access code rotation completed for group=${groupId} facility=${facilityId}`);
      } catch (error) {
        if (this.isPushDeliveryError(error)) {
          const retryAt = now.getTime() + 60_000;
          this.retryAtByGroup.set(groupId, retryAt);
          logger.warn(
            `Access code push delivery failed for group=${groupId} facility=${facilityId}; retrying at ${new Date(retryAt).toISOString()}`,
          );
          continue;
        }
        throw error;
      }
    }
  }
}

