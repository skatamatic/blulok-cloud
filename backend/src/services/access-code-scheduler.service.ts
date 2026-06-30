import {
  ACCESS_CODE_PUSH_OUTBOX_SCAN_MS,
} from '@/constants/access-code-push-outbox.constants';
import { DEVICE_DELETION_OUTBOX_SCAN_MS } from '@/constants/device-deletion-outbox.constants';
import { AccessCodePushDeliveryError, AccessCodeService } from '@/services/access-code.service';
import { DatabaseService } from '@/services/database.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
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
  private readonly RETRY_BACKOFF_BASE_MS = Math.max(
    this.CHECK_INTERVAL_MS,
    Number(process.env.ACCESS_CODE_SCHEDULER_RETRY_BASE_MS || 1_000),
  );
  private readonly RETRY_BACKOFF_MAX_MS = Math.max(
    this.RETRY_BACKOFF_BASE_MS,
    Number(process.env.ACCESS_CODE_SCHEDULER_RETRY_MAX_MS || 60_000),
  );
  private lastRunByGroup = new Map<string, number>();
  private retryAtByGroup = new Map<string, number>();
  private retryFailureCountByGroup = new Map<string, number>();
  private onlineFacilityIds = new Set<string>();
  private connectionChangeUnsubscribe?: () => void;
  private outboxScanCounter = 0;
  private deviceDeletionOutboxScanCounter = 0;

  // Resolve DB lazily to avoid construction-time dependency on DB initialization order
  private get db() {
    return DatabaseService.getInstance().connection;
  }

  public static getInstance(): AccessCodeSchedulerService {
    if (!this.instance) this.instance = new AccessCodeSchedulerService();
    return this.instance;
  }

  public start(): void {
    if (this.connectionChangeUnsubscribe) {
      logger.warn('AccessCodeSchedulerService is already started');
      return;
    }
    const gatewayEvents = GatewayEventsService.getInstance();
    this.onlineFacilityIds = new Set(gatewayEvents.getConnectedFacilityIds());
    this.connectionChangeUnsubscribe = gatewayEvents.onFacilityConnectionChange((event) => {
      if (event.connected) {
        this.onlineFacilityIds.add(event.facilityId);
      } else {
        this.onlineFacilityIds.delete(event.facilityId);
      }
      this.syncRunLoopState();

      // Run immediately on online transitions to catch overdue rotations.
      if (event.connected) {
        void this.accessCodes.flushPendingPushForFacility(event.facilityId).catch((err) => {
          logger.warn(`Access code outbox flush on connect failed for facility=${event.facilityId}`, err);
        });
        void import('@/services/device-deletion-outbox.service').then(({ DeviceDeletionOutboxService }) =>
          DeviceDeletionOutboxService.getInstance().flushPendingForFacility(event.facilityId),
        ).catch((err) => {
          logger.warn(`Device deletion outbox flush on connect failed for facility=${event.facilityId}`, err);
        });
        this.runSafe('Connection-triggered access code rotation failed (non-fatal):');
      }
    });

    // Startup probe to avoid missing rotations if a connection event was missed
    // before listener registration. This one-shot run can discover online facilities
    // via direct gateway status checks and activate the periodic loop.
    this.runSafe('Startup access code scheduler check failed (non-fatal):');
    this.syncRunLoopState();
    logger.info('AccessCodeSchedulerService started');
  }

  public stop(): void {
    this.stopRunLoop();
    if (this.connectionChangeUnsubscribe) {
      this.connectionChangeUnsubscribe();
      this.connectionChangeUnsubscribe = undefined;
    }
    this.onlineFacilityIds.clear();
    logger.info('AccessCodeSchedulerService stopped');
  }

  /** Test-only: stop loops and drop the singleton so intervals cannot leak between suites. */
  public static resetForTests(): void {
    const existing = AccessCodeSchedulerService.instance;
    if (existing) {
      existing.stop();
    }
    AccessCodeSchedulerService.instance = undefined as unknown as AccessCodeSchedulerService;
  }

  private startRunLoop(): void {
    if (this.intervalId) return;
    this.runSafe('Initial access code scheduler run failed (non-fatal):');
    this.intervalId = setInterval(async () => {
      await this.runSafe('Scheduled access code rotation failed (non-fatal):');
    }, this.CHECK_INTERVAL_MS);
    this.intervalId.unref?.();
  }

  private stopRunLoop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
  }

  private syncRunLoopState(): void {
    this.startRunLoop();
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

  private getRetryAt(groupId: string): number | undefined {
    return this.retryAtByGroup.get(groupId);
  }

  private clearRetryState(groupId: string): void {
    this.retryAtByGroup.delete(groupId);
    this.retryFailureCountByGroup.delete(groupId);
  }

  private scheduleRetry(groupId: string, nowMs: number): number {
    const failures = (this.retryFailureCountByGroup.get(groupId) || 0) + 1;
    this.retryFailureCountByGroup.set(groupId, failures);
    const delay = Math.min(
      this.RETRY_BACKOFF_MAX_MS,
      this.RETRY_BACKOFF_BASE_MS * Math.pow(2, Math.max(0, failures - 1)),
    );
    const retryAt = nowMs + delay;
    this.retryAtByGroup.set(groupId, retryAt);
    return retryAt;
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
    const nowMs = now.getTime();
    const facilityOnlineCache = new Map<string, boolean>();
    let discoveredOnlineFacility = false;
    const groups = await this.db('device_groups')
      .select('id', 'facility_id')
      .where('is_active', true);

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
      const hasTrackedOnlineFacilities = this.onlineFacilityIds.size > 0;
      let gatewayOnline = facilityOnlineCache.get(facilityId);
      if (gatewayOnline === undefined) {
        gatewayOnline = hasTrackedOnlineFacilities
          ? this.onlineFacilityIds.has(facilityId)
          : this.accessCodes.isGatewayOnline(facilityId);
        facilityOnlineCache.set(facilityId, gatewayOnline);
        if (!hasTrackedOnlineFacilities && gatewayOnline) {
          this.onlineFacilityIds.add(facilityId);
          discoveredOnlineFacility = true;
        }
      }

      const retryAt = this.getRetryAt(groupId);
      if (retryAt !== undefined && nowMs < retryAt) {
        continue;
      }

      try {
        await this.accessCodes.forceRotate(facilityId, 'device_group', groupId);
        this.lastRunByGroup.set(groupId, now.getTime());
        this.clearRetryState(groupId);
        logger.info(`Access code rotation completed for group=${groupId} facility=${facilityId}`);
      } catch (error) {
        if (this.isPushDeliveryError(error)) {
          const nextRetryAt = this.scheduleRetry(groupId, nowMs);
          logger.warn(
            `Access code push delivery failed for group=${groupId} facility=${facilityId}; retrying at ${new Date(nextRetryAt).toISOString()}`,
          );
          continue;
        }
        throw error;
      }
    }

    this.outboxScanCounter += this.CHECK_INTERVAL_MS;
    if (this.outboxScanCounter >= ACCESS_CODE_PUSH_OUTBOX_SCAN_MS) {
      this.outboxScanCounter = 0;
      await this.accessCodes.processDueOutboxPushes();
    }

    this.deviceDeletionOutboxScanCounter += this.CHECK_INTERVAL_MS;
    if (this.deviceDeletionOutboxScanCounter >= DEVICE_DELETION_OUTBOX_SCAN_MS) {
      this.deviceDeletionOutboxScanCounter = 0;
      const { DeviceDeletionOutboxService } = await import('@/services/device-deletion-outbox.service');
      await DeviceDeletionOutboxService.getInstance().processDueOutboxPushes();
    }

    if (discoveredOnlineFacility) {
      this.syncRunLoopState();
    }
  }
}

