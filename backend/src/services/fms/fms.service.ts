/**
 * FMS (Facility Management System) Integration Service
 *
 * Orchestrates comprehensive integration with third-party Facility Management Systems
 * to synchronize tenant and unit data between external FMS platforms and BluLok's
 * access control system.
 *
 * Key Features:
 * - Multi-provider support (StoreDge, Generic REST, Simulated for testing)
 * - Automated change detection and conflict resolution
 * - Webhook-based real-time synchronization
 * - Manual sync operations with review workflows
 * - Entity mapping between external and internal IDs
 * - Comprehensive audit logging and error handling
 *
 * Security Considerations:
 * - Encrypted storage of FMS API credentials
 * - Webhook signature validation for authenticity
 * - Rate limiting to prevent FMS API abuse
 * - Facility-scoped access control for sync operations
 * - Comprehensive audit trails for all changes
 */

import { ConflictError } from '@/middleware/error.middleware';
import { BaseFMSProvider } from './base-fms-provider';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSChangeModel } from '@/models/fms-change.model';
import { FMSEntityMappingModel } from '@/models/fms-entity-mapping.model';
import { FMSWebhookEventModel } from '@/models/fms-webhook-event.model';
import { UnitModel } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitsService } from '../units.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import {
  FMSProviderType,
  FMSSyncResult,
  FMSChange,
  FMSChangeType,
  FMSSyncStatus,
  FMSTenant,
  FMSUnit,
  FMSChangeApplicationResult,
  FMSApplyContext,
  FMSConfiguration,
  FMSWebhookFeedItem,
} from '@/types/fms.types';
import { shouldAutoAcceptChanges } from './fms-auto-accept.utils';
import { collectFmsReviewProblems } from './fms-review-notification.utils';
import { isSupersedablePendingSyncLog } from './fms-sync-cleanup.utils';
import {
  isFmsChangeDismissible,
  isFmsChangePending,
} from './fms-apply-order.utils';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import type { FmsWebhookAuthHeaders } from './fms-webhook-auth';
import type { FmsOccupancyContext } from './fms-unit-occupancy-validation.utils';

import { FMSChangeDetectorService } from './fms-change-detector.service';
import { FMSChangeApplicatorService } from './fms-change-applicator.service';
import { FMSWebhookService } from './fms-webhook.service';
import type { FMSServiceModels, FMSServiceCore, FMSSyncProgressPayload } from './fms-service-context';

/**
 * FMS Integration Service Class
 *
 * Central orchestrator for all FMS-related operations. Manages the complete
 * lifecycle of FMS integrations including provider management, synchronization,
 * change detection, and access control updates.
 *
 * This facade delegates to specialized collaborator services:
 * - FMSChangeDetectorService: Change detection logic
 * - FMSChangeApplicatorService: Change application logic
 * - FMSWebhookService: Webhook handling
 */
export class FMSService {
  private static instance: FMSService;

  // Core data models for FMS operations
  private fmsConfigModel: FMSConfigurationModel;
  private syncLogModel: FMSSyncLogModel;
  private changeModel: FMSChangeModel;
  private entityMappingModel: FMSEntityMappingModel;
  private webhookEventModel: FMSWebhookEventModel;

  // Business logic services
  private unitModel: UnitModel;
  private unitsService: UnitsService;
  private unitAssignmentModel: UnitAssignmentModel;

  // Provider management
  private providerRegistry: Map<FMSProviderType, typeof BaseFMSProvider>;

  // Active sync tracking for cancellation support
  private activeSyncs: Map<string, AbortController>;

  // Collaborator services
  private detector: FMSChangeDetectorService;
  private applicator: FMSChangeApplicatorService;
  private webhook: FMSWebhookService;

  private constructor() {
    // Initialize all required service dependencies
    this.fmsConfigModel = new FMSConfigurationModel();
    this.syncLogModel = new FMSSyncLogModel();
    this.changeModel = new FMSChangeModel();
    this.entityMappingModel = new FMSEntityMappingModel();
    this.webhookEventModel = new FMSWebhookEventModel();
    this.unitModel = new UnitModel();
    this.unitsService = UnitsService.getInstance();
    this.unitAssignmentModel = new UnitAssignmentModel();
    this.providerRegistry = new Map();
    this.activeSyncs = new Map();

    // Build getter for shared models - allows test-time mocking
    const getModels = (): FMSServiceModels => ({
      fmsConfigModel: this.fmsConfigModel,
      syncLogModel: this.syncLogModel,
      changeModel: this.changeModel,
      entityMappingModel: this.entityMappingModel,
      webhookEventModel: this.webhookEventModel,
      unitModel: this.unitModel,
      unitAssignmentModel: this.unitAssignmentModel,
      unitsService: this.unitsService,
    });

    // Build core interface for collaborators
    const core: FMSServiceCore = {
      getProvider: (facilityId, config) => this.getProvider(facilityId, config),
      broadcastFMSSyncProgress: (payload) => this.broadcastFMSSyncProgress(payload),
      broadcastFMSSyncUpdate: (facilityId, webhookEvent) =>
        this.broadcastFMSSyncUpdate(facilityId, webhookEvent),
    };

    // Initialize collaborator services with getter for live model access
    this.detector = new FMSChangeDetectorService(getModels);
    this.applicator = new FMSChangeApplicatorService(getModels, core);
    this.webhook = new FMSWebhookService(
      getModels,
      core,
      this.applicator,
      (facilityId, config) => this.getProvider(facilityId, config),
      (changeIds, accepted) => this.reviewChanges(changeIds, accepted)
    );
  }

  public static getInstance(): FMSService {
    if (!FMSService.instance) {
      FMSService.instance = new FMSService();
    }
    return FMSService.instance;
  }

  /**
   * Register an FMS provider implementation
   */
  public registerProvider(type: FMSProviderType, providerClass: typeof BaseFMSProvider): void {
    this.providerRegistry.set(type, providerClass);
    logger.info(`Registered FMS provider: ${type}`);
  }

  /**
   * Validate user has access to facility
   */
  private async validateFacilityAccess(
    userId: string,
    userRole: UserRole,
    facilityId: string
  ): Promise<void> {
    if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
      return;
    }

    if (userRole === UserRole.FACILITY_ADMIN) {
      const hasAccess = await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
      if (!hasAccess) {
        throw new Error('Access denied: You do not have permission to sync this facility');
      }
      return;
    }

    throw new Error('Access denied: Insufficient permissions for FMS sync');
  }

  /**
   * Get an FMS provider instance
   */
  private getProvider(facilityId: string, config: FMSConfiguration): BaseFMSProvider {
    const ProviderClass = this.providerRegistry.get(config.provider_type);

    if (!ProviderClass) {
      throw new Error(`FMS provider not found: ${config.provider_type}`);
    }

    return new (ProviderClass as any)(facilityId, config.config);
  }

  /**
   * Test FMS connection
   */
  public async testConnection(facilityId: string): Promise<boolean> {
    try {
      const config = await this.fmsConfigModel.findByFacilityId(facilityId);

      if (!config) {
        logger.error(`[FMS] Configuration not found for facility ${facilityId}`);
        throw new Error('FMS configuration not found for facility');
      }

      const provider = this.getProvider(facilityId, config);
      const result = await provider.testConnection();

      if (result) {
        logger.info(`[FMS] Connection test successful for facility ${facilityId}`, {
          provider: config.provider_type,
          facility_id: facilityId,
        });
      } else {
        logger.warn(`[FMS] Connection test failed for facility ${facilityId}`, {
          provider: config.provider_type,
          facility_id: facilityId,
        });
      }

      return result;
    } catch (error) {
      logger.error(`[FMS] Connection test failed for facility ${facilityId}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        facility_id: facilityId,
      });
      throw error;
    }
  }

  /**
   * Perform a complete FMS synchronization for a facility.
   */
  public async performSync(
    facilityId: string,
    userId?: string,
    userRole?: UserRole
  ): Promise<FMSSyncResult> {
    const config = await this.fmsConfigModel.findByFacilityId(facilityId);

    if (!config) {
      throw new Error('FMS configuration not found for facility');
    }

    if (!config.is_enabled) {
      throw new Error('FMS integration is not enabled for this facility');
    }

    if (userId && userRole) {
      await this.validateFacilityAccess(userId, userRole, facilityId);
    }

    if (this.activeSyncs.has(facilityId)) {
      throw new ConflictError('A sync operation is already running for this facility');
    }

    const abortController = new AbortController();
    this.activeSyncs.set(facilityId, abortController);

    logger.info(`[FMS] Cleaning up uncommitted changes for facility ${facilityId}`);
    const pendingSyncs = await this.syncLogModel.findByFacilityId(facilityId, {
      status: FMSSyncStatus.PENDING_REVIEW,
      limit: 100,
    });

    for (const oldSync of pendingSyncs.logs) {
      if (!isSupersedablePendingSyncLog(oldSync)) {
        logger.info(`[FMS] Keeping webhook review batch ${oldSync.id} through full sync`, {
          fms_sync: true,
          facility_id: facilityId,
          old_sync_log_id: oldSync.id,
        });
        continue;
      }
      const deletedCount = await this.changeModel.deleteBySyncLogId(oldSync.id);
      logger.info(`[FMS] Deleted ${deletedCount} uncommitted changes from old sync ${oldSync.id}`, {
        fms_sync: true,
        facility_id: facilityId,
        old_sync_log_id: oldSync.id,
      });

      await this.syncLogModel.update(oldSync.id, {
        sync_status: FMSSyncStatus.FAILED,
        error_message: 'Superseded by new sync - uncommitted changes discarded',
      });
    }

    const syncLog = await this.syncLogModel.create({
      facility_id: facilityId,
      fms_config_id: config.id,
      triggered_by: 'manual',
      ...(userId ? { triggered_by_user_id: userId } : {}),
    });

    const checkCancelled = () => {
      if (abortController.signal.aborted) {
        throw new Error('Sync operation was cancelled');
      }
    };

    try {
      logger.info(`[FMS] Starting sync for facility ${facilityId}`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        triggered_by: userId || 'system',
        facility_id: facilityId,
      });

      logger.info(`[FMS] Connecting to ${config.provider_type} for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'connecting',
        percent: 5,
        message: 'Connecting to FMS provider',
      });
      checkCancelled();

      const provider = this.getProvider(facilityId, config);

      logger.info(`[FMS] Fetching data from ${config.provider_type} for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'fetching',
        percent: 30,
        message: 'Fetching tenants and units',
      });

      const [fmsTenants, fmsUnits] = await Promise.all([
        provider.fetchTenants().catch((error) => {
          logger.error(`[FMS] Failed to fetch tenants from provider:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: config.provider_type,
            facility_id: facilityId,
          });
          throw new Error(
            `Failed to fetch tenants: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }),
        provider.fetchUnits().catch((error) => {
          logger.error(`[FMS] Failed to fetch units from provider:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: config.provider_type,
            facility_id: facilityId,
          });
          throw new Error(
            `Failed to fetch units: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }),
      ]);

      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'fetching',
        percent: 50,
        message: `Fetched ${fmsTenants.length} tenants and ${fmsUnits.length} units`,
      });

      logger.info(
        `[FMS] Fetched ${fmsTenants.length} tenants and ${fmsUnits.length} units from FMS`,
        {
          fms_sync: true,
          sync_log_id: syncLog.id,
          facility_id: facilityId,
        }
      );

      logger.info(`[FMS] Detecting changes for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'detecting',
        percent: 60,
        message: 'Detecting changes',
      });

      const changes = await this.detectChanges(
        facilityId,
        fmsTenants,
        fmsUnits,
        syncLog.id,
        userId,
        userRole,
        (percent: number, message?: string) => {
          const payload: any = {
            facilityId,
            syncLogId: syncLog.id,
            step: 'detecting',
            percent,
          };
          if (message !== undefined) {
            payload.message = message;
          }
          this.broadcastFMSSyncProgress(payload);
        }
      );

      logger.info(`[FMS] Detected ${changes.length} changes`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        facility_id: facilityId,
        changes_by_type: {
          tenant_added: changes.filter((c) => c.change_type === FMSChangeType.TENANT_ADDED).length,
          tenant_removed: changes.filter((c) => c.change_type === FMSChangeType.TENANT_REMOVED)
            .length,
          tenant_updated: changes.filter((c) => c.change_type === FMSChangeType.TENANT_UPDATED)
            .length,
          tenant_unit_changed: changes.filter(
            (c) => c.change_type === FMSChangeType.TENANT_UNIT_CHANGED
          ).length,
          unit_added: changes.filter((c) => c.change_type === FMSChangeType.UNIT_ADDED).length,
          unit_updated: changes.filter((c) => c.change_type === FMSChangeType.UNIT_UPDATED).length,
        },
      });

      logger.info(`[FMS] Preparing results for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 85,
        message: 'Preparing results',
      });

      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 92,
        message: 'Finalizing sync results',
      });

      const autoAccept = shouldAutoAcceptChanges(config.config.syncSettings, 'manual');
      await this.syncLogModel.update(syncLog.id, {
        changes_detected: changes.length,
        changes_pending: changes.length,
        sync_status: FMSSyncStatus.PENDING_REVIEW,
      });

      let pendingReviewCount = changes.length;
      let changesApplied = 0;

      if (autoAccept && changes.length > 0) {
        const outcome = await this.autoAcceptAndApplyChanges(syncLog.id, changes);
        pendingReviewCount = outcome.pendingCount;
        changesApplied = outcome.changesApplied;

        if (outcome.requiresReview) {
          await this.syncLogModel.markPendingReview(syncLog.id, {
            tenants_synced: fmsTenants.length,
            units_synced: fmsUnits.length,
            errors: outcome.applyErrors,
            warnings: [],
            changes_auto_applied: outcome.changesApplied > 0,
          });
        } else {
          await this.syncLogModel.markCompleted(syncLog.id, {
            tenants_synced: fmsTenants.length,
            units_synced: fmsUnits.length,
            errors: outcome.applyErrors,
            warnings: [],
            changes_auto_applied: true,
          });
        }
      } else if (changes.length > 0) {
        await this.syncLogModel.markPendingReview(syncLog.id, {
          tenants_synced: fmsTenants.length,
          units_synced: fmsUnits.length,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      } else {
        await this.syncLogModel.markCompleted(syncLog.id, {
          tenants_synced: fmsTenants.length,
          units_synced: fmsUnits.length,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      }

      const finalSyncLog = await this.syncLogModel.findById(syncLog.id);
      await this.fmsConfigModel.update(config.id, {
        last_sync_at: new Date(),
        last_sync_status: finalSyncLog?.sync_status ?? FMSSyncStatus.COMPLETED,
      });

      this.broadcastFMSSyncUpdate(facilityId);

      const result = await this.buildSyncResult(syncLog.id, changes);

      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'complete',
        percent: 100,
        message: pendingReviewCount > 0 ? 'Sync complete — review required' : 'Sync complete',
      });

      void this.notifyFmsSyncOutcome(
        facilityId,
        syncLog.id,
        changes.length,
        userId,
        false,
        undefined,
        pendingReviewCount,
        {
          autoApplyAttempted: autoAccept && changes.length > 0,
          changesApplied,
          problemSummaries: collectFmsReviewProblems(changes).problemSummaries,
        }
      );

      return result;
    } catch (error) {
      logger.error('FMS sync failed:', error);

      await this.syncLogModel.markFailed(
        syncLog.id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      await this.fmsConfigModel.update(config.id, {
        last_sync_status: FMSSyncStatus.FAILED,
      });

      this.broadcastFMSSyncUpdate(facilityId);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'failed',
        percent: 100,
        message: 'Sync failed',
      });

      void this.notifyFmsSyncOutcome(
        facilityId,
        syncLog.id,
        0,
        userId,
        true,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    } finally {
      this.activeSyncs.delete(facilityId);
    }
  }

  /**
   * Fire-and-forget in-app notifications for FMS sync outcomes.
   */
  private async notifyFmsSyncOutcome(
    facilityId: string,
    syncLogId: string,
    changesDetected: number,
    triggeredByUserId: string | undefined,
    failed: boolean,
    errorMessage?: string,
    pendingReviewCount?: number,
    reviewContext?: {
      autoApplyAttempted?: boolean;
      changesApplied?: number;
      problemSummaries?: string[];
    }
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      const { DatabaseService } = await import('@/services/database.service');
      const row = await DatabaseService.getInstance()
        .connection('facilities')
        .where('id', facilityId)
        .first('name');
      const facilityName = (row?.name as string | undefined) || 'Facility';
      const dispatcher = InAppNotificationDispatcher.getInstance();

      if (failed) {
        await dispatcher.notifyFmsSyncFailed(
          facilityId,
          facilityName,
          syncLogId,
          errorMessage || 'Sync failed',
          triggeredByUserId
        );
      } else if (pendingReviewCount && pendingReviewCount > 0) {
        await dispatcher.notifyFmsSyncPendingReview({
          facilityId,
          facilityName,
          syncLogId,
          pendingCount: pendingReviewCount,
          changesDetected,
          excludeUserId: triggeredByUserId,
          autoApplyAttempted: reviewContext?.autoApplyAttempted,
          changesApplied: reviewContext?.changesApplied,
          problemSummaries: reviewContext?.problemSummaries,
        });
      } else {
        await dispatcher.notifyFmsSyncComplete(
          facilityId,
          facilityName,
          syncLogId,
          changesDetected,
          triggeredByUserId
        );
      }
    } catch (err) {
      logger.error('[FMS] Failed to send sync notification:', err);
    }
  }

  /**
   * Broadcast FMS sync progress to WebSocket subscribers
   */
  private broadcastFMSSyncProgress(payload: FMSSyncProgressPayload): void {
    try {
      logger.info('[FMS] Broadcasting progress', {
        step: payload.step,
        percent: payload.percent,
        facilityId: payload.facilityId,
      });

      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();

      if (!wsService) {
        logger.warn('[FMS] WebSocket service not available for progress broadcast');
        return;
      }

      const registry = wsService.getSubscriptionRegistry();
      if (!registry) {
        logger.warn('[FMS] Subscription registry not available');
        return;
      }

      const manager = registry.getFMSSyncProgressManager();

      if (!manager) {
        logger.warn('[FMS] FMSSyncProgressManager not found in registry');
        return;
      }

      logger.info('[FMS] Calling manager.broadcastProgress');
      manager.broadcastProgress({
        ...payload,
        timestamp: new Date().toISOString(),
      });
      logger.info('[FMS] Broadcast complete');
    } catch (error) {
      logger.error('Error broadcasting FMS sync progress:', error);
    }
  }

  /**
   * Cancel an active sync operation
   */
  public cancelSync(facilityId: string): boolean {
    const abortController = this.activeSyncs.get(facilityId);
    if (abortController) {
      abortController.abort();
      this.activeSyncs.delete(facilityId);
      logger.info(`[FMS] Sync cancelled for facility ${facilityId}`);
      return true;
    }
    return false;
  }

  /**
   * Check if a sync is currently active for a facility
   */
  public isSyncActive(facilityId: string): boolean {
    return this.activeSyncs.has(facilityId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DETECTION — Delegated to FMSChangeDetectorService
  // Public wrappers preserve backward compatibility for tests using (svc as any).methodName
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Detect changes between FMS and our system
   */
  async detectChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    userId?: string,
    userRole?: UserRole,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<FMSChange[]> {
    return this.detector.detectChanges(
      facilityId,
      fmsTenants,
      fmsUnits,
      syncLogId,
      userId,
      userRole,
      onProgress
    );
  }

  /**
   * Detect tenant changes
   */
  async detectTenantChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    sharedUnits: any[],
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    return this.detector.detectTenantChanges(
      facilityId,
      fmsTenants,
      fmsUnits,
      syncLogId,
      sharedUnits,
      onProgress
    );
  }

  /**
   * Collect unit assignment change data for a tenant
   */
  collectTenantUnitChanges(
    facilityId: string,
    tenantId: string,
    fmsTenant: FMSTenant,
    syncLogId: string,
    context: {
      assignmentsByTenantId: Map<string, any[]>;
      unitMappingsByExternalId: Map<string, any>;
      unitsById: Map<string, any>;
      fmsUnitsByExternalId: Map<string, FMSUnit>;
    },
    pendingInserts: any[]
  ): void {
    return this.detector.collectTenantUnitChanges(
      facilityId,
      tenantId,
      fmsTenant,
      syncLogId,
      context,
      pendingInserts
    );
  }

  /**
   * Detect unit changes
   */
  async detectUnitChanges(
    facilityId: string,
    fmsUnits: FMSUnit[],
    fmsTenants: FMSTenant[],
    syncLogId: string,
    sharedUnits: any[],
    occupancyContext: FmsOccupancyContext,
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    return this.detector.detectUnitChanges(
      facilityId,
      fmsUnits,
      fmsTenants,
      syncLogId,
      sharedUnits,
      occupancyContext,
      onProgress
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // APPLICATION — Delegated to FMSChangeApplicatorService
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Apply approved changes
   */
  public async applyChanges(
    syncLogId: string,
    changeIds: string[]
  ): Promise<FMSChangeApplicationResult> {
    return this.applicator.applyChanges(syncLogId, changeIds);
  }

  /**
   * Reconcile sync log counters
   */
  private async refreshSyncLogChangeCounts(syncLogId: string): Promise<string | null> {
    return this.applicator.refreshSyncLogChangeCounts(syncLogId);
  }

  /**
   * Apply tenant removed change (public for tests)
   */
  public async applyTenantRemoved(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx?: FMSApplyContext
  ): Promise<void> {
    return this.applicator.applyTenantRemoved(change, result, ctx);
  }

  /**
   * Apply tenant updated change (public for tests)
   */
  public async applyTenantUpdated(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    return this.applicator.applyTenantUpdated(change, result, ctx);
  }

  /**
   * Apply tenant unit assignment change (public for tests)
   */
  public async applyTenantUnitChanged(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    return this.applicator.applyTenantUnitChanged(change, result, ctx);
  }

  /**
   * Apply unit updated change (public for tests)
   */
  public async applyUnitUpdated(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext
  ): Promise<void> {
    return this.applicator.applyUnitUpdated(change, result, ctx);
  }

  /**
   * Restore FMS tenant access
   */
  private async restoreFmsTenantAccess(
    userId: string,
    facilityId: string,
    ctx: {
      mapping?: { id: string; metadata?: Record<string, unknown> | null } | null;
      performedBy: string;
      syncLogId: string;
      force?: boolean;
    }
  ): Promise<boolean> {
    return this.applicator.restoreFmsTenantAccess(userId, facilityId, ctx);
  }

  /**
   * Resolve tenant internal ID
   */
  private async resolveTenantInternalId(facilityId: string, change: FMSChange): Promise<string> {
    return this.applicator.resolveTenantInternalId(facilityId, change);
  }

  /**
   * Resolve unit internal ID
   */
  private async resolveUnitInternalId(
    facilityId: string,
    refs: { unitId?: string; externalUnitId?: string }
  ): Promise<string> {
    return this.applicator.resolveUnitInternalId(facilityId, refs);
  }

  /**
   * Auto-accept and apply changes
   */
  private async autoAcceptAndApplyChanges(
    syncLogId: string,
    changes: FMSChange[]
  ): Promise<ReturnType<FMSChangeApplicatorService['autoAcceptAndApplyChanges']>> {
    return this.applicator.autoAcceptAndApplyChanges(syncLogId, changes, (changeIds, accepted) =>
      this.reviewChanges(changeIds, accepted)
    );
  }

  /**
   * Deactivate tenant after last unit
   */
  private async maybeDeactivateTenantAfterLastUnit(
    tenantId: string,
    result: FMSChangeApplicationResult,
    ctx: { syncLogId: string; performedBy: string }
  ): Promise<boolean> {
    return this.applicator.maybeDeactivateTenantAfterLastUnit(tenantId, result, ctx);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // WEBHOOKS — Delegated to FMSWebhookService
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Process an inbound FMS webhook
   */
  public async handleWebhookEvent(
    facilityId: string,
    rawBody: Buffer,
    requestHeaders: FmsWebhookAuthHeaders
  ): Promise<{
    duplicate: boolean;
    message: string;
    syncLogId?: string;
    changesDetected?: number;
    changesApplied?: number;
    requiresReview?: boolean;
  }> {
    return this.webhook.handleWebhookEvent(facilityId, rawBody, requestHeaders);
  }

  /**
   * Recent webhook events for the facility FMS tab feed.
   */
  public async getRecentWebhookEvents(
    facilityId: string,
    limit = 5,
    options: { includeUnsuccessful?: boolean; includeRawPayload?: boolean } = {}
  ): Promise<FMSWebhookFeedItem[]> {
    return this.webhook.getRecentWebhookEvents(facilityId, limit, options);
  }

  /**
   * Build webhook changes (exposed for tests)
   */
  async buildWebhookChanges(
    facilityId: string,
    syncLogId: string,
    payload: any,
    provider: BaseFMSProvider
  ): Promise<any[]> {
    return this.webhook.buildWebhookChanges(facilityId, syncLogId, payload, provider);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // REVIEW & HISTORY — Remain on facade
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Build sync result summary
   */
  private async buildSyncResult(syncLogId: string, changes: FMSChange[]): Promise<FMSSyncResult> {
    const syncLog = await this.syncLogModel.findById(syncLogId);

    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const summary = {
      tenantsAdded: changes.filter((c) => c.change_type === FMSChangeType.TENANT_ADDED).length,
      tenantsRemoved: changes.filter((c) => c.change_type === FMSChangeType.TENANT_REMOVED).length,
      tenantsUpdated: changes.filter((c) => c.change_type === FMSChangeType.TENANT_UPDATED).length,
      unitsAdded: changes.filter((c) => c.change_type === FMSChangeType.UNIT_ADDED).length,
      unitsRemoved: changes.filter((c) => c.change_type === FMSChangeType.UNIT_REMOVED).length,
      unitsUpdated: changes.filter((c) => c.change_type === FMSChangeType.UNIT_UPDATED).length,
      errors: [],
      warnings: [],
    };

    return {
      success: syncLog.sync_status !== FMSSyncStatus.FAILED,
      syncLogId,
      changesDetected: changes,
      summary,
      requiresReview:
        syncLog.sync_status === FMSSyncStatus.PENDING_REVIEW ||
        (syncLog.changes_pending ?? 0) > 0,
    };
  }

  /**
   * Get sync history for a facility
   */
  public async getSyncHistory(facilityId: string, options?: { limit?: number; offset?: number }) {
    return this.syncLogModel.findByFacilityId(facilityId, options);
  }

  /**
   * Get pending changes for review
   */
  public async getPendingChanges(syncLogId: string): Promise<FMSChange[]> {
    return this.changeModel.findPendingBySyncLogId(syncLogId);
  }

  /**
   * Review and accept/reject changes
   */
  public async reviewChanges(changeIds: string[], accepted: boolean): Promise<void> {
    await this.changeModel.bulkReview(changeIds, accepted);

    if (changeIds.length === 0) return;

    const firstChange = await this.changeModel.findById(changeIds[0]!);
    if (!firstChange) return;

    const facilityId = await this.refreshSyncLogChangeCounts(firstChange.sync_log_id);
    if (facilityId) {
      this.broadcastFMSSyncUpdate(facilityId);
    }
  }

  /**
   * Dismiss pending changes from review
   */
  public async dismissChanges(
    syncLogId: string,
    changeIds?: string[]
  ): Promise<{ dismissed: number }> {
    const syncLog = await this.syncLogModel.findById(syncLogId);
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    let idsToDismiss: string[];
    if (changeIds && changeIds.length > 0) {
      const changes = await this.changeModel.findByIds(changeIds);
      idsToDismiss = changes
        .filter((c) => c.sync_log_id === syncLogId && isFmsChangePending(c))
        .map((c) => c.id);
    } else {
      const pending = await this.changeModel.findPendingBySyncLogId(syncLogId);
      idsToDismiss = pending.filter((c) => isFmsChangeDismissible(c)).map((c) => c.id);
    }

    if (idsToDismiss.length === 0) {
      return { dismissed: 0 };
    }

    await this.changeModel.bulkReview(idsToDismiss, false);

    const facilityId = await this.refreshSyncLogChangeCounts(syncLogId);
    if (facilityId) {
      this.broadcastFMSSyncUpdate(facilityId);
    }

    return { dismissed: idsToDismiss.length };
  }

  /**
   * Broadcast FMS sync status update via WebSocket
   */
  private broadcastFMSSyncUpdate(facilityId: string, webhookEvent?: FMSWebhookFeedItem): void {
    try {
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      const registry = wsService.getSubscriptionRegistry();

      if (registry) {
        const fmsSyncManager = registry.getFMSSyncManager();
        if (fmsSyncManager) {
          setImmediate(() => {
            fmsSyncManager.broadcastUpdate(facilityId, webhookEvent).catch((error: Error) => {
              logger.error('Failed to broadcast FMS sync update:', error);
            });
          });
        }
      }
    } catch (error) {
      logger.error('Error initiating FMS sync broadcast:', error);
    }
  }
}
