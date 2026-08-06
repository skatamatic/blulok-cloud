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
import { User, UserModel } from '@/models/user.model';
import { KeySharingModel } from '@/models/key-sharing.model';
import { UnitModel } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitsService } from '../units.service';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import {
  FMSProviderType,
  FMSSyncResult,
  FMSChange,
  FMSChangeType,
  FMSChangeAction,
  FMSSyncStatus,
  FMSTenant,
  FMSUnit,
  FMSChangeApplicationResult,
  FMSApplyContext,
  FMSConfiguration,
  FMSWebhookPayload,
  FMSWebhookFeedItem,
  FMSSyncLog,
} from '@/types/fms.types';
import { StoredgeProvider } from './providers/storedge-provider';
import {
  validateFmsWebhookAuth,
  type FmsWebhookAuthHeaders,
} from './fms-webhook-auth';
import { FMSWebhookAuthMode } from '@/types/fms.types';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';
import { shouldAutoAcceptChanges } from './fms-auto-accept.utils';
import {
  buildFmsOccupancyContext,
  formatVacantUnitLedgerConflictNote,
  isFmsUnitVacantStatus,
  partitionTenantUnitIdsByOccupancy,
  resolveLedgerAssignAgainstUnitStatus,
  resolveLedgerUnassignAgainstUnitStatus,
  resolveOccupiedUnitBlockers,
  type FmsOccupancyContext,
  type FmsOccupancyTenantInfo,
} from './fms-unit-occupancy-validation.utils';
import {
  isFmsChangeDismissible,
  isFmsChangePending,
  partitionChangesForAutoApply,
  resolveFmsAutoApplyOutcome,
  resolveTenantUnitAction,
  resolveTenantUnitActionData,
  sortChangesForApply,
} from './fms-apply-order.utils';
import {
  buildFmsApplyErrorDetail,
  formatFmsApplyErrorFallback,
} from './fms-apply-error.utils';
import {
  clearFmsMappingRemoved,
  isFmsMappingMarkedRemoved,
  isFmsUserRemovedFromFacility,
  isUserInactive,
  stampFmsMappingRemoved,
} from './fms-tenant-removal.utils';
import {
  buildFacilityUserLookupMaps,
  findExistingUserForFmsTenant,
  formatFmsTenantContactLabel,
  hasFmsTenantLoginIdentity,
  validateFmsTenantSyncFields,
  validateFmsTenantWebhookFields,
} from './fms-tenant-validation.utils';
import {
  isPlaceholderUser,
} from './fms-placeholder-user.utils';
import { toE164 } from '@/utils/phone.util';
import {
  summarizeFmsWebhookPayload,
} from './fms-webhook-summary.utils';

/**
 * Move-out can only unassign entities BluLok already knows about; unmapped ids go to
 * manual review instead of failing during apply.
 */
function moveOutValidationErrors(
  tenantExternalId: string,
  unitExternalId: string,
  tenantInternalId?: string,
  unitInternalId?: string,
): string[] | undefined {
  const errors: string[] = [];
  if (!tenantExternalId || !unitExternalId) {
    errors.push('Move-out payload missing tenant_id or unit_id');
    return errors;
  }
  if (!tenantInternalId) {
    errors.push(`Tenant ${tenantExternalId} is not mapped in BluLok yet`);
  }
  if (!unitInternalId) {
    errors.push(`Unit ${unitExternalId} is not mapped in BluLok yet`);
  }
  return errors.length > 0 ? errors : undefined;
}

/**
 * FMS Integration Service Class
 *
 * Central orchestrator for all FMS-related operations. Manages the complete
 * lifecycle of FMS integrations including provider management, synchronization,
 * change detection, and access control updates.
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
   * 
   * SECURITY: Ensures users can only sync facilities they have access to
   */
  private async validateFacilityAccess(userId: string, userRole: UserRole, facilityId: string): Promise<void> {
    // Admin and Dev Admin have access to all facilities
    if (userRole === UserRole.ADMIN || userRole === UserRole.DEV_ADMIN) {
      return;
    }

    // For facility-scoped users, check their facility associations
    if (userRole === UserRole.FACILITY_ADMIN) {
      const hasAccess = await UserFacilityAssociationModel.hasAccessToFacility(userId, facilityId);
      if (!hasAccess) {
        throw new Error('Access denied: You do not have permission to sync this facility');
      }
      return;
    }

    // All other roles cannot sync FMS
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
   * Perform manual sync for a facility
   * 
   * SECURITY: All operations are scoped to the specified facility.
   * Users/units can only be modified if they belong to this facility.
   */
  /**
   * Perform a complete FMS synchronization for a facility.
   *
   * This is the core synchronization operation that fetches the latest data from
   * the external FMS, compares it with the current BluLok state, detects changes,
   * and creates a reviewable change set for approval.
   *
   * Synchronization Process:
   * 1. Validate FMS configuration and facility access
   * 2. Prevent concurrent syncs for the same facility
   * 3. Fetch tenant and unit data from external FMS
   * 4. Compare with current internal state
   * 5. Generate change set with required actions
   * 6. Store changes for review and approval
   * 7. Log comprehensive sync results
   *
   * Change Detection Logic:
   * - New tenants: Create user accounts and grant access
   * - Removed tenants: Deactivate users and revoke access
   * - Unit changes: Update assignments and access permissions
   * - Data conflicts: Flag for manual review
   *
   * Security Considerations:
   * - Facility-scoped access control validation
   * - Prevents concurrent sync operations
   * - Comprehensive audit logging
   * - Graceful error handling with cleanup
   *
   * @param facilityId - Target facility for synchronization
   * @param userId - User performing the sync (for audit trails)
   * @param userRole - User's role (for access validation)
   * @returns Promise resolving to comprehensive sync results
   *
   * @throws Error if FMS not configured, disabled, or access denied
   * @throws Error if concurrent sync is already running
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

    // SECURITY: Validate user has access to this facility (if user ID provided)
    if (userId && userRole) {
      await this.validateFacilityAccess(userId, userRole, facilityId);
    }

    // Check if sync is already running for this facility
    if (this.activeSyncs.has(facilityId)) {
      throw new ConflictError('A sync operation is already running for this facility');
    }

    // Create abort controller for this sync
    const abortController = new AbortController();
    this.activeSyncs.set(facilityId, abortController);

    // Clean up old uncommitted changes for this facility
    // This prevents stale data from accumulating and causing conflicts
    logger.info(`[FMS] Cleaning up uncommitted changes for facility ${facilityId}`);
    const pendingSyncs = await this.syncLogModel.findByFacilityId(facilityId, {
      status: FMSSyncStatus.PENDING_REVIEW,
      limit: 100,
    });
    
    for (const oldSync of pendingSyncs.logs) {
      const deletedCount = await this.changeModel.deleteBySyncLogId(oldSync.id);
      logger.info(`[FMS] Deleted ${deletedCount} uncommitted changes from old sync ${oldSync.id}`, {
        fms_sync: true,
        facility_id: facilityId,
        old_sync_log_id: oldSync.id,
      });
      
      // Mark old sync log as failed (cancelled due to new sync)
      await this.syncLogModel.update(oldSync.id, {
        sync_status: FMSSyncStatus.FAILED,
        error_message: 'Superseded by new sync - uncommitted changes discarded',
      });
    }

    // Create sync log
    const syncLog = await this.syncLogModel.create({
      facility_id: facilityId,
      fms_config_id: config.id,
      triggered_by: 'manual',
      ...(userId ? { triggered_by_user_id: userId } : {}),
    });

    // Helper to check if sync was cancelled
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

      // Step 1: Connect to FMS
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

      // Step 2: Fetch data from FMS (providers have their own throttling)
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
          throw new Error(`Failed to fetch tenants: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }),
        provider.fetchUnits().catch((error) => {
          logger.error(`[FMS] Failed to fetch units from provider:`, {
            error: error instanceof Error ? error.message : 'Unknown error',
            provider: config.provider_type,
            facility_id: facilityId,
          });
          throw new Error(`Failed to fetch units: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }),
      ]);
      
      // Progress: Fetch complete
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'fetching',
        percent: 50,
        message: `Fetched ${fmsTenants.length} tenants and ${fmsUnits.length} units`,
      });

      logger.info(`[FMS] Fetched ${fmsTenants.length} tenants and ${fmsUnits.length} units from FMS`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        facility_id: facilityId,
      });

      // Step 3: Detect changes
      logger.info(`[FMS] Detecting changes for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'detecting',
        percent: 60,
        message: 'Detecting changes',
      });
      
      const changes = await this.detectChanges(facilityId, fmsTenants, fmsUnits, syncLog.id, userId, userRole, (percent: number, message?: string) => {
        // Progress callback for granular updates during detection
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
      });

      logger.info(`[FMS] Detected ${changes.length} changes`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        facility_id: facilityId,
        changes_by_type: {
          tenant_added: changes.filter(c => c.change_type === FMSChangeType.TENANT_ADDED).length,
          tenant_removed: changes.filter(c => c.change_type === FMSChangeType.TENANT_REMOVED).length,
          tenant_updated: changes.filter(c => c.change_type === FMSChangeType.TENANT_UPDATED).length,
          tenant_unit_changed: changes.filter(c => c.change_type === FMSChangeType.TENANT_UNIT_CHANGED).length,
          unit_added: changes.filter(c => c.change_type === FMSChangeType.UNIT_ADDED).length,
          unit_updated: changes.filter(c => c.change_type === FMSChangeType.UNIT_UPDATED).length,
        },
      });

      // Step 4: Prepare results
      logger.info(`[FMS] Preparing results for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 85,
        message: 'Preparing results',
      });

      // Progress: Updating sync log
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 92,
        message: 'Finalizing sync results',
      });

      // Update sync log with results
      const autoAccept = shouldAutoAcceptChanges(config.config.syncSettings, 'manual');
      await this.syncLogModel.update(syncLog.id, {
        changes_detected: changes.length,
        changes_pending: changes.length,
        sync_status: FMSSyncStatus.PENDING_REVIEW,
      });

      let pendingReviewCount = changes.length;

      // Auto-accept and apply valid changes; invalid/failed rows stay in manual review
      if (autoAccept && changes.length > 0) {
        const outcome = await this.autoAcceptAndApplyChanges(syncLog.id, changes);
        pendingReviewCount = outcome.pendingCount;

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

      // Update config last sync time
      const finalSyncLog = await this.syncLogModel.findById(syncLog.id);
      await this.fmsConfigModel.update(config.id, {
        last_sync_at: new Date(),
        last_sync_status: finalSyncLog?.sync_status ?? FMSSyncStatus.COMPLETED,
      });

      // Broadcast FMS sync status update via WebSocket
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

      // Broadcast FMS sync status update via WebSocket (even on failure)
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
        error instanceof Error ? error.message : 'Unknown error',
      );

      throw error;
    } finally {
      // Clean up active sync tracking
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
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import('@/services/notifications/in-app-notification-dispatcher.service');
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
          triggeredByUserId,
        );
      } else if (pendingReviewCount && pendingReviewCount > 0) {
        await dispatcher.notifyFmsSyncPendingReview(
          facilityId,
          facilityName,
          syncLogId,
          pendingReviewCount,
          changesDetected,
          triggeredByUserId,
        );
      } else {
        await dispatcher.notifyFmsSyncComplete(
          facilityId,
          facilityName,
          syncLogId,
          changesDetected,
          triggeredByUserId,
        );
      }
    } catch (err) {
      logger.error('[FMS] Failed to send sync notification:', err);
    }
  }

  /**
   * Broadcast FMS sync progress to WebSocket subscribers
   */
  private broadcastFMSSyncProgress(payload: { facilityId: string; syncLogId: string; step: any; percent: number; message?: string; }): void {
    try {
      const { logger } = require('@/utils/logger');
      
      logger.info('[FMS] Broadcasting progress', { step: payload.step, percent: payload.percent, facilityId: payload.facilityId });
      
      // Import the WebSocketService which holds the registry instance
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
      const { logger } = require('@/utils/logger');
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

  /**
   * Detect changes between FMS and our system
   */
  private async detectChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    userId?: string,
    userRole?: UserRole,
    onProgress?: (percent: number, message?: string) => void
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    // Pre-fetch the facility unit list once — shared by both tenant and unit detection
    const effectiveUserId = userId || 'system';
    const effectiveUserRole = userRole || UserRole.ADMIN;
    const allUnitsResult = await this.unitModel.getUnitsListForUser(
      effectiveUserId, effectiveUserRole,
      { facility_id: facilityId, limit: 10000, offset: 0 },
    );
    const sharedUnits = allUnitsResult.units || [];

    // Detect tenant changes (60% -> 70%) — pass FMS units so ledger assigns that contradict
    // vacant unit status are blocked (unit status is SoT for occupancy).
    const tenantChanges = await this.detectTenantChanges(
      facilityId,
      fmsTenants,
      fmsUnits,
      syncLogId,
      sharedUnits,
      (progress: number) => {
      if (onProgress) {
        const percent = 60 + (progress / 100) * 10;
        onProgress(Math.round(percent), `Analyzing ${fmsTenants.length} tenants`);
      }
    });
    changes.push(...tenantChanges);

    // Unit detection needs to know which tenants BluLok can end up holding, so occupied statuses
    // that could never be applied are flagged rather than left to fail during apply.
    const tenantMappings = await this.entityMappingModel.findByFacility(facilityId, 'user');
    const occupancyContext = buildFmsOccupancyContext({
      fmsTenants,
      tenantChanges,
      mappedTenantExternalIds: tenantMappings.map((m) => m.external_id),
    });

    // Detect unit changes (70% -> 78%) — reuse the same unit list
    const unitChanges = await this.detectUnitChanges(
      facilityId,
      fmsUnits,
      fmsTenants,
      syncLogId,
      sharedUnits,
      occupancyContext,
      (progress: number) => {
      if (onProgress) {
        const percent = 70 + (progress / 100) * 8;
        onProgress(Math.round(percent), `Analyzing ${fmsUnits.length} units`);
      }
    });
    changes.push(...unitChanges);

    if (onProgress) {
      onProgress(78, 'Change detection complete');
    }

    return changes;
  }

  /**
   * Detect tenant changes
   * 
   * SECURITY: Only considers TENANT role users. Admin/maintenance users are never affected by FMS.
   */
  private async detectTenantChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string,
    sharedUnits: any[],
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const total = fmsTenants.length;
    let processed = 0;

    const fmsUnitsByExternalId = new Map(fmsUnits.map((u) => [u.externalId, u]));

    // Get entity mappings for this facility
    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'user');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    // PERFORMANCE: Facility-scoped tenant query avoids loading the entire tenant table.
    // We also load by mapped internal IDs to catch users who may have lost their facility association.
    const facilityUsers = await UserModel.findByRoleMinimalForFacility(UserRole.TENANT, facilityId);
    const mappedInternalIds = new Set(existingMappings.map(m => m.internal_id));
    const facilityUserIds = new Set(facilityUsers.map(u => u.id));

    // Supplement with any mapped users not in the facility-scoped set (data-integrity safety net)
    const missingMappedIds = [...mappedInternalIds].filter(id => !facilityUserIds.has(id));
    let supplementUsers: typeof facilityUsers = [];
    if (missingMappedIds.length > 0) {
      supplementUsers = await UserModel.findByIds(missingMappedIds) as any;
    }
    const allRelevantUsers = [...facilityUsers, ...supplementUsers];

    const {
      usersById,
      usersByEmail,
      usersByPhone,
      usersByLoginIdentifier,
    } = buildFacilityUserLookupMaps(allRelevantUsers);

    // Pre-fetch data for unit-change detection
    const allFacilityAssignments = await this.unitAssignmentModel.findByFacilityId(facilityId);
    const assignmentsByTenantId = new Map<string, typeof allFacilityAssignments>();
    for (const assignment of allFacilityAssignments) {
      const tenantAssignments = assignmentsByTenantId.get(assignment.tenant_id) || [];
      tenantAssignments.push(assignment);
      assignmentsByTenantId.set(assignment.tenant_id, tenantAssignments);
    }

    const unitMappings = await this.entityMappingModel.findByFacility(facilityId, 'unit');
    const unitMappingsByExternalId = new Map(unitMappings.map(m => [m.external_id, m]));
    const unitsById = new Map(sharedUnits.map((u: any) => [u.id, u]));

    const unitChangeContext = {
      assignmentsByTenantId,
      unitMappingsByExternalId,
      unitsById,
      fmsUnitsByExternalId,
    };

    // Collect pending change rows in memory, then bulk-insert
    const pendingInserts: Parameters<typeof this.changeModel.bulkCreate>[0] = [];

    for (const fmsTenant of fmsTenants) {
      logger.debug(`[FMS-TENANT] Processing tenant: externalId=${fmsTenant.externalId}, email="${fmsTenant.email}"`);
      
      const validationErrors = validateFmsTenantSyncFields(fmsTenant);
      const isValid = validationErrors.length === 0;

      if (!isValid) {
        logger.warn(`[FMS-TENANT-INVALID] Tenant ${fmsTenant.externalId} flagged as INVALID: errors=${JSON.stringify(validationErrors)}`);
      }

      const mapping = mappingsByExternalId.get(fmsTenant.externalId);
      const existingUser = findExistingUserForFmsTenant(
        fmsTenant,
        mapping,
        usersById,
        usersByEmail,
        usersByPhone,
        usersByLoginIdentifier,
      );

      processed++;
      if (onProgress && (processed % 10 === 0 || processed === total)) {
        onProgress(Math.round((processed / total) * 100));
      }

      if (!existingUser) {
        const { occupiableUnitIds, vacantConflicts } = partitionTenantUnitIdsByOccupancy(
          fmsTenant.unitIds,
          fmsUnitsByExternalId,
        );
        const tenantForApply: FMSTenant = { ...fmsTenant, unitIds: occupiableUnitIds };
        const vacantConflictUnitNumbers = vacantConflicts.map((c) => c.unitNumber);
        const conflictNote =
          vacantConflictUnitNumbers.length > 0
            ? ` Skipped ledger assignment(s) to vacant FMS unit(s) ${vacantConflictUnitNumbers.join(', ')} — unit status is the source of truth; fix the ledger/status conflict in FMS.`
            : '';
        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          after_data: tenantForApply,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ASSIGN_UNIT],
          impact_summary:
            `New tenant: ${fmsTenant.firstName || 'Unknown'} ${fmsTenant.lastName || 'Unknown'} (${formatFmsTenantContactLabel(fmsTenant)}) - Will be added to ${occupiableUnitIds.length} unit(s)` +
            conflictNote,
          is_valid: isValid,
          validation_errors: validationErrors,
        });

        // Surface each vacant-ledger conflict as its own blocked row so operators can dismiss/review.
        for (const conflict of vacantConflicts) {
          const blockers = resolveLedgerAssignAgainstUnitStatus({
            unitNumber: conflict.unitNumber,
            fmsUnitStatus: conflict.status,
            tenant: fmsTenant,
          });
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UNIT_CHANGED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            after_data: {
              action: 'assign_unit',
              unitId: unitMappingsByExternalId.get(conflict.externalId)?.internal_id,
              unitNumber: conflict.unitNumber,
              externalUnitId: conflict.externalId,
            },
            required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
            impact_summary: `Assign ${formatFmsTenantContactLabel(fmsTenant)} to unit ${conflict.unitNumber} — blocked (FMS unit is vacant)`,
            is_valid: false,
            validation_errors: blockers,
          });
        }
      } else {
        const user = existingUser;

        if (!mapping) {
          logger.warn(`[FMS] User ${user.email} exists but has no FMS mapping. Creating mapping.`, {
            fms_sync: true, sync_log_id: syncLogId, facility_id: facilityId,
            user_id: user.id, external_id: fmsTenant.externalId,
          });

          const config = await this.fmsConfigModel.findByFacilityId(facilityId);
          await this.entityMappingModel.ensureMapping({
            facility_id: facilityId, entity_type: 'user',
            external_id: fmsTenant.externalId, internal_id: user.id,
            provider_type: config?.provider_type || 'generic_rest',
            metadata: { email: fmsTenant.email, phone: fmsTenant.phone,
              leaseStartDate: fmsTenant.leaseStartDate, leaseEndDate: fmsTenant.leaseEndDate },
          });

          const newMapping = await this.entityMappingModel.findByExternalId(facilityId, 'user', fmsTenant.externalId);
          if (newMapping) mappingsByExternalId.set(fmsTenant.externalId, newMapping);
        }
        
        let currentPhone: string | undefined;
        if (mapping) currentPhone = mapping.metadata?.phone as string | undefined;
        const currentEmail =
          (typeof mapping?.metadata?.email === 'string' ? mapping.metadata.email : undefined)
          ?? user.email
          ?? undefined;

        const facilityAssignmentCount =
          assignmentsByTenantId.get(user.id)?.length ?? 0;
        const needsFmsRestore = isFmsUserRemovedFromFacility(
          mapping,
          user,
          facilityAssignmentCount,
        );
        const needsReactivation = isUserInactive(user);

        const normalizedUserEmail = (user.email || '').trim().toLowerCase();
        const normalizedFmsEmail = (fmsTenant.email || '').trim().toLowerCase();
        const normalizedUserPhone = (user.phone_number || '').trim();
        const normalizedFmsPhone = fmsTenant.phone?.trim() ? toE164(fmsTenant.phone) : '';
        const normalizedMetaPhone = currentPhone?.trim()
          ? (toE164(currentPhone) || currentPhone.trim())
          : '';
        const emailChanged = normalizedUserEmail !== normalizedFmsEmail;
        const phoneChanged =
          (normalizedUserPhone || normalizedMetaPhone) !== normalizedFmsPhone;
        const needsPlaceholderUpgrade =
          isPlaceholderUser(user) && hasFmsTenantLoginIdentity(fmsTenant);

        const hasInfoChanges =
          user.first_name !== fmsTenant.firstName ||
          user.last_name !== fmsTenant.lastName ||
          emailChanged ||
          phoneChanged ||
          needsPlaceholderUpgrade;

        if (needsFmsRestore || hasInfoChanges || needsReactivation) {
          logger.debug(
            needsFmsRestore
              ? `[FMS] Tenant ${fmsTenant.email} restored in FMS`
              : needsReactivation && !hasInfoChanges
                ? `[FMS] Tenant ${fmsTenant.email} is inactive and present in FMS`
                : `[FMS] Tenant ${fmsTenant.email} has info changes`,
            { sync_log_id: syncLogId },
          );
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UPDATED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            before_data: {
              firstName: user.first_name,
              lastName: user.last_name,
              email: currentEmail ?? user.email ?? null,
              phone: currentPhone ?? user.phone_number ?? null,
            },
            after_data: fmsTenant,
            required_actions: [FMSChangeAction.UPDATE_USER],
            impact_summary: needsFmsRestore && !hasInfoChanges
              ? `Tenant restored in FMS: ${formatFmsTenantContactLabel(fmsTenant)}`
              : needsReactivation && !hasInfoChanges
                ? `Reactivate tenant present in FMS: ${formatFmsTenantContactLabel(fmsTenant)}`
              : `Updated tenant info for: ${formatFmsTenantContactLabel(fmsTenant)}`,
            is_valid: isValid,
            validation_errors: validationErrors,
          });
        }

        // Unit assignment changes — these still use per-row detection but collect into pendingInserts
        this.collectTenantUnitChanges(facilityId, user.id, fmsTenant, syncLogId, unitChangeContext, pendingInserts);
      }
    }

    // Check for removed tenants (mapped in our system but not in FMS)
    const fmsTenantExtIds = new Set(fmsTenants.map(t => t.externalId));
    for (const mapping of existingMappings) {
      if (!fmsTenantExtIds.has(mapping.external_id)) {
        const user = usersById.get(mapping.internal_id);
        const facilityAssignmentCount =
          assignmentsByTenantId.get(mapping.internal_id)?.length ?? 0;

        if (isFmsUserRemovedFromFacility(mapping, user, facilityAssignmentCount)) {
          // Heal legacy removals so later restores detect the stamp consistently.
          if (!isFmsMappingMarkedRemoved(mapping.metadata)) {
            await this.entityMappingModel.updateMetadata(
              mapping.id,
              stampFmsMappingRemoved(mapping.metadata),
            );
          }
          logger.debug('[FMS] Skipping tenant_removed — already removed from this facility FMS', {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            external_id: mapping.external_id,
            internal_id: mapping.internal_id,
          });
          continue;
        }

        if (user) {
          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_REMOVED,
            entity_type: 'tenant',
            external_id: mapping.external_id,
            internal_id: mapping.internal_id,
            before_data: user,
            after_data: null as any,
            required_actions: [FMSChangeAction.REMOVE_ACCESS, FMSChangeAction.DEACTIVATE_USER],
            impact_summary: `Tenant removed: ${user.email} - Will be deactivated and access revoked from all units`,
            is_valid: true,
          });
        }
      }
    }

    // Bulk-insert all detected changes in one round-trip
    const changes = pendingInserts.length > 0
      ? await this.changeModel.bulkCreate(pendingInserts)
      : [];

    logger.info(`[FMS] Tenant detection complete: ${changes.length} changes from ${total} tenants`, {
      fms_sync: true, sync_log_id: syncLogId, facility_id: facilityId,
    });

    return changes;
  }

  /**
   * Collect unit assignment change data for a tenant into the pending inserts array.
   * Purely in-memory — no DB calls. All changes are bulk-inserted by the caller.
   */
  private collectTenantUnitChanges(
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
    pendingInserts: Parameters<typeof this.changeModel.bulkCreate>[0],
  ): void {
    const currentAssignments = context.assignmentsByTenantId.get(tenantId) || [];
    const currentUnitIds = new Set(currentAssignments.map(a => a.unit_id));

    const fmsUnitMappings = fmsTenant.unitIds
      .map(extId => context.unitMappingsByExternalId.get(extId))
      .filter(m => m !== undefined);

    const fmsInternalUnitIds = new Set(
      fmsUnitMappings.filter(m => m !== null).map(m => m!.internal_id)
    );

    for (const mapping of fmsUnitMappings) {
      if (mapping && !currentUnitIds.has(mapping.internal_id)) {
        const unit = context.unitsById.get(mapping.internal_id);
        if (!unit || unit.facility_id !== facilityId) continue;

        const fmsUnit = context.fmsUnitsByExternalId.get(mapping.external_id);
        const blockers = resolveLedgerAssignAgainstUnitStatus({
          unitNumber: unit.unit_number,
          fmsUnitStatus: fmsUnit?.status,
          tenant: fmsTenant,
        });
        
        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          after_data: { action: 'assign_unit', unitId: mapping.internal_id, unitNumber: unit.unit_number },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary:
            blockers.length > 0
              ? `Assign ${fmsTenant.email} to unit ${unit.unit_number} — blocked (FMS unit is vacant)`
              : `Assign ${fmsTenant.email} to unit ${unit.unit_number} - Gateway access will be granted`,
          is_valid: blockers.length === 0,
          validation_errors: blockers.length > 0 ? blockers : undefined,
        });
      }
    }

    // External ids for BluLok units this tenant currently holds (for unassign conflict checks)
    const externalIdByInternalUnitId = new Map(
      [...context.unitMappingsByExternalId.values()].map((m) => [m.internal_id, m.external_id]),
    );

    for (const assignment of currentAssignments) {
      if (!fmsInternalUnitIds.has(assignment.unit_id)) {
        const unit = context.unitsById.get(assignment.unit_id);
        const externalUnitId = externalIdByInternalUnitId.get(assignment.unit_id);
        const fmsUnit = externalUnitId
          ? context.fmsUnitsByExternalId.get(externalUnitId)
          : undefined;
        const blockers = resolveLedgerUnassignAgainstUnitStatus({
          unitNumber: unit?.unit_number || assignment.unit_id,
          fmsUnitStatus: fmsUnit?.status,
          fmsUnitTenantId: fmsUnit?.tenantId,
          tenantExternalId: fmsTenant.externalId,
          tenant: fmsTenant,
        });
        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          before_data: { action: 'unassign_unit', unitId: assignment.unit_id, unitNumber: unit?.unit_number },
          after_data: null as any,
          required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
          impact_summary:
            blockers.length > 0
              ? `Remove ${fmsTenant.email} from unit ${unit?.unit_number || assignment.unit_id} — blocked (FMS unit still occupied)`
              : `Remove ${fmsTenant.email} from unit ${unit?.unit_number || assignment.unit_id} - Gateway access will be revoked`,
          is_valid: blockers.length === 0,
          validation_errors: blockers.length > 0 ? blockers : undefined,
        });
      }
    }
  }

  /**
   * Detect unit changes  
   */
  private async detectUnitChanges(
    facilityId: string,
    fmsUnits: FMSUnit[],
    fmsTenants: FMSTenant[],
    syncLogId: string,
    sharedUnits: any[],
    occupancyContext: FmsOccupancyContext,
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const total = fmsUnits.length;
    let processed = 0;

    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'unit');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    const existingUnits = sharedUnits;
    const unitsByNumber = new Map(existingUnits.map((u: any) => [u.unit_number, u]));
    const unitsById = new Map(existingUnits.map((u: any) => [u.id, u]));

    // Ledger claimants per unit (for vacant unit_updated conflict notes)
    const ledgerTenantLabelsByUnitExternalId = new Map<string, string[]>();
    for (const tenant of fmsTenants) {
      const label = formatFmsTenantContactLabel(tenant);
      const name = [tenant.firstName, tenant.lastName].filter(Boolean).join(' ').trim();
      const display = name ? `${name} (${label})` : label;
      for (const unitExtId of tenant.unitIds) {
        const list = ledgerTenantLabelsByUnitExternalId.get(unitExtId) || [];
        list.push(display);
        ledgerTenantLabelsByUnitExternalId.set(unitExtId, list);
      }
    }

    const pendingInserts: Parameters<typeof this.changeModel.bulkCreate>[0] = [];

    for (const fmsUnit of fmsUnits) {
      const mapping = mappingsByExternalId.get(fmsUnit.externalId);
      let existingUnit = mapping ? unitsById.get(mapping.internal_id) : null;
      
      logger.debug(`[FMS] Checking unit ${fmsUnit.unitNumber}`, {
        fms_sync: true, sync_log_id: syncLogId, external_id: fmsUnit.externalId,
        has_mapping: !!mapping, found_by_mapping: !!existingUnit,
      });
      
      // If mapping points to a unit from a different facility (stale mapping), ignore it and lookup by unit number
      if (mapping && !existingUnit) {
        logger.warn(`[FMS] Stale mapping detected: unit ${mapping.internal_id} not found in this facility`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          external_id: fmsUnit.externalId,
          mapping_internal_id: mapping.internal_id,
          unit_number: fmsUnit.unitNumber,
        });
        existingUnit = unitsByNumber.get(fmsUnit.unitNumber);
      } else if (mapping && existingUnit) {
        // Mapping points to an existing unit — sanity check that it's the unit with the same unit_number
        const numberMatch = (existingUnit).unit_number === fmsUnit.unitNumber;
        if (!numberMatch) {
          const correctUnit = unitsByNumber.get(fmsUnit.unitNumber);
          if (correctUnit) {
            logger.warn('[FMS] Mapping points to a different unit number. Repairing mapping.', {
              fms_sync: true,
              sync_log_id: syncLogId,
              facility_id: facilityId,
              external_id: fmsUnit.externalId,
              mapping_internal_id: mapping.internal_id,
              mapped_unit_number: (existingUnit).unit_number,
              expected_unit_number: fmsUnit.unitNumber,
              correct_internal_id: (correctUnit).id,
            });
            // Self-heal mapping in DB
            await this.entityMappingModel.updateInternalId(mapping.id, (correctUnit).id);
            // Update local state to reflect corrected mapping for this run
            existingUnit = correctUnit;
            mappingsByExternalId.set(fmsUnit.externalId, {
              ...mapping,
              internal_id: (correctUnit).id,
              updated_at: new Date(),
            } as any);
          }
        }
      } else if (!mapping) {
        // No mapping at all, lookup by unit number
        existingUnit = unitsByNumber.get(fmsUnit.unitNumber);
      }

      // Report progress every 10 items or at final item
      processed++;
      if (onProgress && (processed % 10 === 0 || processed === total)) {
        onProgress(Math.round((processed / total) * 100));
      }

      if (!existingUnit) {
        logger.debug(`[FMS] Detected new unit to add: ${fmsUnit.unitNumber}`, {
          fms_sync: true, sync_log_id: syncLogId, external_id: fmsUnit.externalId,
        });
        
        pendingInserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_ADDED,
          entity_type: 'unit',
          external_id: fmsUnit.externalId,
          after_data: fmsUnit,
          required_actions: [],
          impact_summary: `New unit: ${fmsUnit.unitNumber} - Will be added to facility`,
          is_valid: true,
        });
      } else if (!mapping || mapping.internal_id !== (existingUnit).id) {
        // With the simplified approach, don't mutate or emit mapping-only changes during detection.
        const reason = !mapping ? 'no mapping' : 'stale mapping';
        logger.info(`[FMS] Unit ${fmsUnit.unitNumber} exists (${reason}), no detection-side repair`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          unit_id: (existingUnit).id,
          external_id: fmsUnit.externalId,
          mapping_internal_id: mapping?.internal_id,
        });
      } else {
        // Existing unit - check for changes
        // NOTE: We don't compare size_sqft because FMS gives us dimensional strings like "10x15"
        // but our database stores numeric square footage. We store FMS size in metadata instead.
        const unit = existingUnit;
        const hasChanges = 
          unit.status !== fmsUnit.status ||
          unit.unit_type !== fmsUnit.unitType;

        if (hasChanges) {
          logger.debug(`[FMS] Unit ${fmsUnit.unitNumber} has data changes`, { sync_log_id: syncLogId });

          // BluLok cannot store `occupied` without a tenant assignment. Flag the dead end now so the
          // operator sees why, instead of this change failing on every apply until FMS is corrected.
          const occupancyBlockers = resolveOccupiedUnitBlockers(fmsUnit, unit.status, occupancyContext);
          if (occupancyBlockers.length > 0) {
            logger.warn(`[FMS] Unit ${fmsUnit.unitNumber} cannot be marked occupied yet`, {
              fms_sync: true, sync_log_id: syncLogId, facility_id: facilityId,
              external_id: fmsUnit.externalId, reasons: occupancyBlockers,
            });
          }

          let impactSummary = `Update unit ${fmsUnit.unitNumber}`;
          if (isFmsUnitVacantStatus(fmsUnit.status) && occupancyBlockers.length === 0) {
            const ledgerNote = formatVacantUnitLedgerConflictNote(
              fmsUnit.unitNumber,
              ledgerTenantLabelsByUnitExternalId.get(fmsUnit.externalId) || [],
            );
            if (ledgerNote) {
              impactSummary = ledgerNote;
            }
          }

          pendingInserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_UPDATED,
            entity_type: 'unit',
            external_id: fmsUnit.externalId,
            internal_id: unit.id,
            before_data: { status: unit.status, unitType: unit.unit_type },
            after_data: fmsUnit,
            required_actions: [],
            impact_summary: impactSummary,
            is_valid: occupancyBlockers.length === 0,
            validation_errors: occupancyBlockers.length > 0 ? occupancyBlockers : undefined,
          });
        }
      }
    }

    const changes = pendingInserts.length > 0
      ? await this.changeModel.bulkCreate(pendingInserts)
      : [];

    logger.info(`[FMS] Unit detection complete: ${changes.length} changes from ${total} units`, {
      fms_sync: true, sync_log_id: syncLogId, facility_id: facilityId,
    });

    return changes;
  }

  /**
   * Apply approved changes
   */
  /**
   * Apply approved FMS changes to the BluLok system.
   *
   * This critical method executes the approved changes from an FMS sync operation,
   * updating the BluLok database and access control system accordingly. It handles
   * the complex orchestration of user creation, deactivation, and access management.
   *
   * Change Application Process:
   * 1. Load and validate all requested changes
   * 2. Sort changes by dependency order (units → tenants → assignments)
   * 3. Execute each change type with proper error handling
   * 4. Track all access control modifications
   * 5. Update sync log with results
   * 6. Trigger denylist updates for access revocations
   *
   * Supported Change Types:
   * - UNIT_ADDED/UPDATED/REMOVED: Unit lifecycle management
   * - TENANT_ADDED/UPDATED/REMOVED: User account management
   * - TENANT_UNIT_CHANGED: Access assignment modifications
   *
   * Security Considerations:
   * - All operations are facility-scoped
   * - Changes are validated before application
   * - Comprehensive audit logging
   * - Transactional consistency where possible
   * - Automatic denylist updates for security
   *
   * Business Impact:
   * - Creates new user accounts for new tenants
   * - Deactivates users for removed tenants
   * - Updates unit assignments and access permissions
   * - Maintains synchronization between FMS and BluLok
   * - Ensures immediate access control updates
   *
   * @param syncLogId - Sync operation identifier for tracking
   * @param changeIds - Array of approved change IDs to apply
   * @returns Promise resolving to detailed application results
   *
   * @throws Error if changes cannot be loaded or validation fails
   */
  public async applyChanges(
    syncLogId: string,
    changeIds: string[]
  ): Promise<FMSChangeApplicationResult> {
    const result: FMSChangeApplicationResult = {
      success: true,
      changesApplied: 0,
      changesFailed: 0,
      errors: [],
      errorDetails: [],
      appliedChangeIds: [],
      failedChangeIds: [],
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    };

    const allChanges = await this.changeModel.findByIds(changeIds);

    const changes = sortChangesForApply(allChanges);

    // Load the sync log once and cache context for all sub-methods
    const syncLog = await this.syncLogModel.findById(syncLogId);
    if (!syncLog) throw new Error(`Sync log ${syncLogId} not found`);

    const [config, unitMappings] = await Promise.all([
      this.fmsConfigModel.findByFacilityId(syncLog.facility_id),
      this.entityMappingModel.findByFacility(syncLog.facility_id, 'unit'),
    ]);

    const ctx: FMSApplyContext = {
      facilityId: syncLog.facility_id,
      performedBy: syncLog.triggered_by_user_id || 'fms-system',
      config,
      unitMappingsByExternalId: new Map(unitMappings.map((m) => [m.external_id, m])),
    };

    const totalChanges = changes.length;

    logger.info(`[FMS] Applying ${totalChanges} changes in dependency order`, {
      fms_sync: true,
      sync_log_id: syncLogId,
      order: changes.map(c => c.change_type),
    });

    this.broadcastFMSSyncProgress({
      facilityId: ctx.facilityId,
      syncLogId,
      step: 'applying',
      percent: 0,
      message: `Applying 0 of ${totalChanges} changes…`,
    });

    const appliedIds: string[] = [];
    const failureReasons = new Map<string, string[]>();

    for (let index = 0; index < changes.length; index++) {
      const change = changes[index];
      if (!change) continue;

      try {
        await this.applyChange(change, result, ctx);
        appliedIds.push(change.id);
        result.changesApplied++;

        const completed = index + 1;
        this.broadcastFMSSyncProgress({
          facilityId: ctx.facilityId,
          syncLogId,
          step: 'applying',
          percent: totalChanges > 0 ? Math.round((completed / totalChanges) * 100) : 100,
          message: `Applying ${completed} of ${totalChanges}: ${change.change_type.replace(/_/g, ' ')}`,
        });
      } catch (error) {
        logger.error(`Failed to apply change ${change.id}:`, error);
        result.changesFailed++;
        result.failedChangeIds.push(change.id);
        const detail = buildFmsApplyErrorDetail(change, error);
        result.errorDetails.push(detail);
        result.errors.push(formatFmsApplyErrorFallback(detail));
        failureReasons.set(change.id, [detail.message]);
      }
    }

    result.appliedChangeIds = appliedIds;
    result.success = result.changesFailed === 0;

    this.broadcastFMSSyncProgress({
      facilityId: ctx.facilityId,
      syncLogId,
      step: 'applying',
      percent: 100,
      message: `Finished applying ${result.changesApplied} of ${totalChanges} changes`,
    });

    if (appliedIds.length > 0) {
      await this.changeModel.bulkMarkApplied(appliedIds);
    }

    // Keep the failure reason on the row so reopening the review queue still explains it.
    if (result.failedChangeIds.length > 0) {
      await this.changeModel.markApplyFailed(result.failedChangeIds, failureReasons);
    }

    await this.refreshSyncLogChangeCounts(syncLogId);

    this.broadcastFMSSyncUpdate(ctx.facilityId);

    return result;
  }

  /**
   * Reconcile sync log counters from fms_changes rows after review/apply.
   * Clears pending_review status when no unreviewed changes remain.
   */
  private async refreshSyncLogChangeCounts(syncLogId: string): Promise<string | null> {
    const syncLog = await this.syncLogModel.findById(syncLogId);
    if (!syncLog) return null;

    const stats = await this.changeModel.getStatsBySyncLogId(syncLogId);
    const allChanges = await this.changeModel.findBySyncLogId(syncLogId);
    const appliedCount = allChanges.filter((c) => c.applied_at != null).length;

    const update: Parameters<FMSSyncLogModel['update']>[1] = {
      changes_pending: stats.pending,
      changes_rejected: stats.rejected,
      changes_applied: appliedCount,
    };

    if (stats.pending === 0 && syncLog.sync_status === FMSSyncStatus.PENDING_REVIEW) {
      update.sync_status = FMSSyncStatus.COMPLETED;
    } else if (stats.pending > 0 && syncLog.sync_status === FMSSyncStatus.COMPLETED) {
      update.sync_status = FMSSyncStatus.PENDING_REVIEW;
    }

    await this.syncLogModel.update(syncLogId, update);
    return syncLog.facility_id;
  }

  /**
   * Apply a single change
   */
  private async applyChange(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    switch (change.change_type) {
      case FMSChangeType.TENANT_ADDED:
        await this.applyTenantAdded(change, result, ctx);
        break;

      case FMSChangeType.TENANT_REMOVED:
        await this.applyTenantRemoved(change, result, ctx);
        break;

      case FMSChangeType.TENANT_UPDATED:
        await this.applyTenantUpdated(change, result, ctx);
        break;

      case FMSChangeType.TENANT_UNIT_CHANGED:
        await this.applyTenantUnitChanged(change, result, ctx);
        break;

      case FMSChangeType.UNIT_ADDED:
        await this.applyUnitAdded(change, result, ctx);
        break;

      case FMSChangeType.UNIT_UPDATED:
        await this.applyUnitUpdated(change, result, ctx);
        break;

      case FMSChangeType.UNIT_REMOVED:
        await this.applyUnitRemoved(change, result, ctx);
        break;

      case FMSChangeType.UNIT_OVERLOCK_CHANGED:
        await this.applyUnitOverlockChanged(change, result, ctx);
        break;

      default:
        logger.warn(`Unhandled change type: ${change.change_type}`);
    }
  }

  /**
   * Reverse tenant_removed side effects when FMS brings the tenant back.
   * Handles stamped mappings and legacy inactive tenants with no facility association.
   */
  private async restoreFmsTenantAccess(
    userId: string,
    facilityId: string,
    ctx: {
      mapping?: { id: string; metadata?: Record<string, unknown> | null } | null;
      performedBy: string;
      syncLogId: string;
      /** When true, always restore inactive users / missing facility association (tenant present in FMS). */
      force?: boolean;
    },
  ): Promise<boolean> {
    const mapping =
      ctx.mapping ??
      (await this.entityMappingModel.findByInternalId(facilityId, 'user', userId));

    const user = (await UserModel.findById(userId)) as User | undefined;
    const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(userId);
    const hasFacility = userFacilities.includes(facilityId);
    // Treat missing facility association as zero assignments for shared removed-detection logic.
    const facilityAssignmentCount = hasFacility ? 1 : 0;

    const needsRestore =
      ctx.force === true ||
      isFmsUserRemovedFromFacility(mapping, user, facilityAssignmentCount);

    if (!needsRestore) {
      return false;
    }

    if (!hasFacility) {
      await UserFacilityAssociationModel.addUserToFacility(userId, facilityId);
      logger.info('[FMS] Restored facility association for tenant returning from FMS', {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
        facility_id: facilityId,
        user_id: userId,
        performed_by: ctx.performedBy,
      });
    }

    if (user && isUserInactive(user)) {
      await UserModel.activateUser(userId);
      void import('@/services/user-activation-side-effects.service')
        .then(({ runUserActivationSideEffects }) => runUserActivationSideEffects(userId))
        .catch((err) => {
          logger.error('[FMS] Failed to run activation side effects after restore', err);
        });
      logger.info('[FMS] Reactivated tenant present in FMS', {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
        facility_id: facilityId,
        user_id: userId,
        performed_by: ctx.performedBy,
      });
    }

    return true;
  }

  /**
   * Apply tenant added change
   *
   * SECURITY: Only creates users with TENANT role. FMS never creates admin/maintenance users.
   */
  private async applyTenantAdded(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    const tenantData = change.after_data as FMSTenant;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const config = ctx.config ?? (await this.fmsConfigModel.findByFacilityId(facilityId));

    // Determine preferred login identifier: email (preferred) or normalized phone
    const rawEmail = tenantData.email?.trim() || '';
    const rawPhone = tenantData.phone?.trim() || '';
    const { toE164 } = await import('@/utils/phone.util');
    const phoneE164 = rawPhone ? toE164(rawPhone) : '';
    const preferredIdentifier = rawEmail ? rawEmail.toLowerCase() : (phoneE164 ? phoneE164.toLowerCase() : '');
    const isPlaceholderCreate = !preferredIdentifier;

    const {
      buildFmsPlaceholderLoginIdentifier,
      FMS_PLACEHOLDER_PASSWORD_HASH,
      isPlaceholderUser,
    } = await import('@/services/fms/fms-placeholder-user.utils');

    // Prefer existing FMS mapping so contact matching cannot silently hijack another user
    // while a placeholder (or prior mapped tenant) still owns this external_id.
    const priorMapping = await this.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      tenantData.externalId,
    );

    let existingUser: User | undefined;
    if (priorMapping?.internal_id) {
      existingUser = await UserModel.findById(priorMapping.internal_id) as User | undefined;
    }

    if (!existingUser && preferredIdentifier) {
      existingUser = await UserModel.findByLoginIdentifier(preferredIdentifier);
    }
    if (!existingUser && (rawEmail || phoneE164)) {
      // PERFORMANCE FIX: Use targeted DB query instead of fetching entire user table
      // This prevents the "Scan of Death" when processing many tenants
      const byEmail = rawEmail ? await UserModel.findByEmail(rawEmail.toLowerCase()) : undefined;
      const byPhone = phoneE164 ? await UserModel.findByPhone(phoneE164) : undefined;

      // Conflict: email points to one user and phone to a different user
      if (byEmail && byPhone && byEmail.id !== byPhone.id) {
        logger.error('[FMS] Tenant email/phone conflict with existing users', {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          tenant_email: rawEmail || null,
          tenant_phone: rawPhone || null,
          email_user_id: byEmail.id,
          phone_user_id: byPhone.id,
        });
        throw new Error('FMS tenant email/phone conflict with existing users');
      }

      existingUser = byEmail || byPhone;
    }

    let user: User;
    let upgradedFromPlaceholder = false;
    if (existingUser) {
      // User already exists - ensure their core identity fields are up to date and they are
      // associated with this facility and mapped to the FMS tenant.
      logger.info(`[FMS] User ${tenantData.email || tenantData.externalId} already exists. Ensuring data, facility association and mapping.`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        user_id: existingUser.id,
      });

      const updates: Partial<User> = {};
      const normalizedEmail = rawEmail ? rawEmail.toLowerCase() : null;
      const wasPlaceholder = isPlaceholderUser(existingUser);
      const {
        requirePlaceholderUpgradeUpdates,
        queueInviteAfterPlaceholderUpgrade,
      } = await import('@/services/fms/fms-placeholder-upgrade');

      if (wasPlaceholder && preferredIdentifier) {
        const upgrade = await requirePlaceholderUpgradeUpdates(existingUser.id, {
          email: normalizedEmail,
          phoneE164: phoneE164 || null,
        });
        if (upgrade) {
          Object.assign(updates, upgrade);
        }
      } else {
        // Update email if FMS has a (possibly new) email
        if (normalizedEmail && existingUser.email !== normalizedEmail) {
          updates.email = normalizedEmail;
        }

        // Update phone_number if FMS has a normalized phone
        if (phoneE164 && existingUser.phone_number !== phoneE164) {
          updates.phone_number = phoneE164;
        }

        // Keep login_identifier aligned with our preferred identifier (email > phone)
        const newLoginIdentifier = preferredIdentifier || (existingUser.email || existingUser.phone_number || existingUser.login_identifier);
        if (newLoginIdentifier && existingUser.login_identifier !== newLoginIdentifier) {
          updates.login_identifier = newLoginIdentifier.toLowerCase();
        }
      }

      if (tenantData.firstName && existingUser.first_name !== tenantData.firstName) {
        updates.first_name = tenantData.firstName;
      }
      if (tenantData.lastName && existingUser.last_name !== tenantData.lastName) {
        updates.last_name = tenantData.lastName;
      }

      if (Object.keys(updates).length > 0) {
        await UserModel.updateById(existingUser.id, updates as any);
        user = await UserModel.findById(existingUser.id) as User;
      } else {
        user = existingUser;
      }

      upgradedFromPlaceholder = wasPlaceholder && !isPlaceholderUser(user);
      if (upgradedFromPlaceholder) {
        queueInviteAfterPlaceholderUpgrade(user, {
          syncLogId: change.sync_log_id,
          facilityId,
        });
      }

    } else {
      // SECURITY: Create user with TENANT role ONLY (FMS never creates admin/maintenance)
      if (isPlaceholderCreate) {
        user = await UserModel.create({
          login_identifier: buildFmsPlaceholderLoginIdentifier(facilityId, tenantData.externalId),
          email: null,
          phone_number: null,
          first_name: tenantData.firstName,
          last_name: tenantData.lastName,
          role: UserRole.TENANT,
          password_hash: FMS_PLACEHOLDER_PASSWORD_HASH,
          is_active: true,
          is_placeholder: true,
          requires_password_reset: true,
        }) as any;
        logger.info(`[FMS] Created placeholder tenant user for external_id ${tenantData.externalId} (${user.id}) by ${performedBy}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
        });
      } else {
        user = await UserModel.create({
          login_identifier: preferredIdentifier,
          email: rawEmail || null,
          phone_number: phoneE164 || null,
          first_name: tenantData.firstName,
          last_name: tenantData.lastName,
          role: UserRole.TENANT,
          password_hash: FMS_PLACEHOLDER_PASSWORD_HASH,
          is_active: true,
          is_placeholder: false,
          requires_password_reset: true,
        }) as any;

        // Trigger first-time invite notification (non-blocking — Twilio can be slow)
        void import('@/services/first-time-user.service')
          .then(({ FirstTimeUserService }) => FirstTimeUserService.getInstance().sendInvite(user))
          .catch((e) => {
            logger.warn(`[FMS] Failed to send first-time invite for user ${user.id}:`, e);
          });

        logger.info(`[FMS] Created tenant user: ${user.email || user.phone_number} (${user.id}) by ${performedBy}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
        });
      }

      result.accessChanges.usersCreated.push(user.id);

      // Associate user with facility
      await UserFacilityAssociationModel.addUserToFacility(user.id, facilityId);
    }

    // Create or ensure FMS entity mapping (store phone in metadata since it's not in users table)
    // Check if mapping already exists to avoid duplicates
    const existingMapping = priorMapping ?? await this.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      tenantData.externalId
    );

    if (!existingMapping) {
      await this.restoreFmsTenantAccess(user.id, facilityId, {
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      await this.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'user',
        external_id: tenantData.externalId,
        internal_id: user.id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        },
      });
    } else {
      await this.restoreFmsTenantAccess(user.id, facilityId, {
        mapping: existingMapping,
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      // Mapped user row was missing earlier; bind mapping to the resolved/created user
      if (existingMapping.internal_id !== user.id) {
        await this.entityMappingModel.updateInternalId(existingMapping.id, user.id);
        logger.info(`[FMS] Remapped tenant external_id ${tenantData.externalId} to user ${user.id}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          previous_internal_id: existingMapping.internal_id,
          new_internal_id: user.id,
        });
      }
      await this.entityMappingModel.updateMetadata(
        existingMapping.id,
        clearFmsMappingRemoved({
          ...existingMapping.metadata,
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        }),
      );
      logger.info(`[FMS] User entity mapping already exists for external_id ${tenantData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        internal_id: user.id,
        upgraded_from_placeholder: upgradedFromPlaceholder,
      });
    }

    // Use cached unit mappings when available (loaded once per apply batch)
    const unitMappingsByExternalId =
      ctx.unitMappingsByExternalId ??
      new Map(
        (await this.entityMappingModel.findByFacility(facilityId, 'unit')).map((m) => [m.external_id, m]),
      );
    
    // Collect valid unit IDs for bulk assignment
    const validUnitIds: string[] = [];
    for (const externalUnitId of tenantData.unitIds) {
      const unitMapping = unitMappingsByExternalId.get(externalUnitId);
      if (unitMapping) {
        validUnitIds.push(unitMapping.internal_id);
      }
    }

    if (validUnitIds.length > 0) {
      // Use bulk assignment for efficiency
      const assignResult = await this.unitsService.bulkAssignTenant(
        user.id,
        validUnitIds,
        {
          accessType: 'full',
          isPrimary: true,
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
          notes: `FMS sync: ${tenantData.externalId}`,
        }
      );

      // Track access grants
      for (const unitId of validUnitIds) {
        result.accessChanges.accessGranted.push({
          userId: user.id,
          unitId,
        });
      }

      if (assignResult.errors.length > 0) {
        logger.warn(`[FMS] Some unit assignments failed for tenant ${user.id}:`, {
          errors: assignResult.errors,
          assigned: assignResult.assigned,
          skipped: assignResult.skipped,
        });
      }
    }

    logger.info(`[FMS] Tenant ${user.email} created with ${tenantData.unitIds.length} unit assignment(s)`, {
      fms_sync: true,
      user_id: user.id,
      sync_log_id: change.sync_log_id,
    });
  }

  /**
   * Apply tenant removed change
   * 
   * SECURITY: Only affects TENANT role users. Never modifies admin/maintenance users.
   */
  public async applyTenantRemoved(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx?: FMSApplyContext,
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    // Support both cached context and legacy standalone calls
    let facilityId: string;
    let performedBy: string;
    if (ctx) {
      facilityId = ctx.facilityId;
      performedBy = ctx.performedBy;
    } else {
      const syncLog = await this.syncLogModel.findById(change.sync_log_id);
      if (!syncLog) throw new Error('Sync log not found');
      facilityId = syncLog.facility_id;
      performedBy = syncLog.triggered_by_user_id || 'fms-system';
    }

    const user = await UserModel.findById(change.internal_id);
    if (!user) {
      throw new Error('User not found');
    }
    
    if ((user as any).role !== UserRole.TENANT) {
      logger.error(`[FMS] Security violation: Attempted to remove non-tenant user`, {
        user_id: change.internal_id, user_role: (user as any).role,
        sync_log_id: change.sync_log_id, facility_id: facilityId,
      });
      throw new Error(`Security violation: FMS can only modify TENANT users, found ${(user as any).role}`);
    }

    const allAssignments = await this.unitAssignmentModel.findByTenantId(change.internal_id);

    // PERFORMANCE FIX: Batch-load units instead of N+1 per-assignment lookups
    const unitIds = allAssignments.map(a => a.unit_id);
    const units = unitIds.length > 0 ? await this.unitModel.findByIds(unitIds) : [];
    const unitsMap = new Map(units.map((u: any) => [u.id, u]));

    const assignments = allAssignments.filter(assignment => {
      const unit = unitsMap.get(assignment.unit_id);
      return unit && unit.facility_id === facilityId;
    });

    // Remove unit assignments using UnitsService (which will emit events)
    for (const assignment of assignments) {
      await this.unitsService.unassignTenant(
        assignment.unit_id,
        change.internal_id,
        {
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
        }
      );

      result.accessChanges.accessRevoked.push({
        userId: change.internal_id,
        unitId: assignment.unit_id,
      });
    }

    await this.maybeDeactivateTenantAfterLastUnit(change.internal_id, result, {
      syncLogId: change.sync_log_id,
      performedBy,
    });

    await UserFacilityAssociationModel.removeUserFromFacility(change.internal_id, facilityId);

    const userMapping = await this.entityMappingModel.findByInternalId(
      facilityId,
      'user',
      change.internal_id,
    );
    if (userMapping) {
      await this.entityMappingModel.updateMetadata(
        userMapping.id,
        stampFmsMappingRemoved(userMapping.metadata),
      );
    }

    logger.info(`[FMS] Revoked tenant ${change.internal_id} access from ${assignments.length} unit(s) in facility ${facilityId}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      performed_by: performedBy,
    });
  }

  /**
   * Apply tenant updated change
   * 
   * SECURITY: Only affects TENANT role users. Never modifies admin/maintenance users.
   */
  private async applyTenantUpdated(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const tenantData = change.after_data as FMSTenant;

    // SECURITY: Verify this is a TENANT user (never update admin/maintenance users)
    const user = await UserModel.findById(change.internal_id);
    if (!user) {
      throw new Error('User not found');
    }
    
    if ((user as any).role !== UserRole.TENANT) {
      logger.error(`[FMS] Security violation: Attempted to update non-tenant user`, {
        user_id: change.internal_id,
        user_role: (user as any).role,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      throw new Error(`Security violation: FMS can only modify TENANT users, found ${(user as any).role}`);
    }

    const mapping = await this.entityMappingModel.findByInternalId(
      facilityId,
      'user',
      change.internal_id,
    );

    await this.restoreFmsTenantAccess(change.internal_id, facilityId, {
      mapping,
      performedBy,
      syncLogId: change.sync_log_id,
      // Tenant still present in FMS: restore facility link and reactivate if needed.
      force: true,
    });

    // SECURITY: Validate user is associated with this facility (restored above if returning from FMS)
    const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(change.internal_id);
    if (!userFacilities.includes(facilityId)) {
      throw new Error(`Security violation: User ${change.internal_id} is not associated with facility ${facilityId}`);
    }

    // Update user profile + upgrade placeholder identity when contact arrives
    const rawEmail = tenantData.email?.trim() || '';
    const rawPhone = tenantData.phone?.trim() || '';
    const { toE164 } = await import('@/utils/phone.util');
    const phoneE164 = rawPhone ? toE164(rawPhone) : '';
    const preferredIdentifier = rawEmail
      ? rawEmail.toLowerCase()
      : (phoneE164 ? phoneE164.toLowerCase() : '');

    const { isPlaceholderUser } = await import('@/services/fms/fms-placeholder-user.utils');
    const {
      requirePlaceholderUpgradeUpdates,
      queueInviteAfterPlaceholderUpgrade,
    } = await import('@/services/fms/fms-placeholder-upgrade');

    const profileUpdates: Partial<User> = {
      ...(tenantData.firstName != null ? { first_name: tenantData.firstName } : {}),
      ...(tenantData.lastName != null ? { last_name: tenantData.lastName } : {}),
    };

    const wasPlaceholder = isPlaceholderUser(user as User);
    if (wasPlaceholder && preferredIdentifier) {
      const upgrade = await requirePlaceholderUpgradeUpdates(change.internal_id, {
        email: rawEmail ? rawEmail.toLowerCase() : null,
        phoneE164: phoneE164 || null,
      });
      if (upgrade) {
        Object.assign(profileUpdates, upgrade);
      }
    } else if (preferredIdentifier) {
      if (rawEmail && (user as User).email !== rawEmail.toLowerCase()) {
        profileUpdates.email = rawEmail.toLowerCase();
      }
      if (phoneE164 && (user as User).phone_number !== phoneE164) {
        profileUpdates.phone_number = phoneE164;
      }
      if ((user as User).login_identifier !== preferredIdentifier) {
        profileUpdates.login_identifier = preferredIdentifier;
      }
    }

    await UserModel.updateById(change.internal_id, profileUpdates as any);

    const upgradedUser = await UserModel.findById(change.internal_id) as User;
    if (wasPlaceholder && upgradedUser && !isPlaceholderUser(upgradedUser)) {
      queueInviteAfterPlaceholderUpgrade(upgradedUser, {
        syncLogId: change.sync_log_id,
        facilityId,
      });
    }

    // Update or create entity mapping for this tenant
    const config = ctx.config ?? (await this.fmsConfigModel.findByFacilityId(facilityId));
    
    if (mapping) {
      // Update existing mapping metadata
      await this.entityMappingModel.updateMetadata(mapping.id, {
        ...clearFmsMappingRemoved(mapping.metadata),
        email: tenantData.email,
        phone: tenantData.phone,
      });
    } else {
      // Create new mapping (this tenant was created before FMS sync was enabled)
      await this.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'user',
        external_id: tenantData.externalId,
        internal_id: change.internal_id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          email: tenantData.email,
          phone: tenantData.phone,
          leaseStartDate: tenantData.leaseStartDate,
          leaseEndDate: tenantData.leaseEndDate,
        },
      });
      logger.info(`[FMS] Created entity mapping for existing tenant`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        internal_id: change.internal_id,
        external_id: tenantData.externalId,
      });
    }

    logger.info(`[FMS] Updated tenant user: ${change.internal_id} by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      changes: {
        firstName: tenantData.firstName,
        lastName: tenantData.lastName,
        phone: tenantData.phone,
        email: tenantData.email,
        upgradedFromPlaceholder: isPlaceholderUser(user as User) && !isPlaceholderUser(upgradedUser),
      },
    });
  }

  /**
   * Apply tenant unit assignment change (assign or unassign)
   */
  private async applyTenantUnitChanged(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const tenantInternalId = await this.resolveTenantInternalId(facilityId, change);
    type TenantUnitActionData = {
      action?: string;
      unitId?: string;
      externalUnitId?: string;
      unitNumber?: string;
    };
    const action = resolveTenantUnitAction(change.after_data, change.before_data);
    const actionData = resolveTenantUnitActionData(
      action,
      change.after_data as TenantUnitActionData | null,
      change.before_data as TenantUnitActionData | null,
    ) ?? ({} as TenantUnitActionData);

    if (!action) {
      throw new Error(
        'Tenant unit change is missing an assign_unit / unassign_unit action payload',
      );
    }

    if (action === 'assign_unit') {
      const tenantMapping = await this.entityMappingModel.findByInternalId(
        facilityId,
        'user',
        tenantInternalId,
      );
      await this.restoreFmsTenantAccess(tenantInternalId, facilityId, {
        mapping: tenantMapping,
        performedBy,
        syncLogId: change.sync_log_id,
        force: true,
      });
      if (tenantMapping) {
        await this.entityMappingModel.updateMetadata(
          tenantMapping.id,
          clearFmsMappingRemoved(tenantMapping.metadata),
        );
      }

      const unitId = await this.resolveUnitInternalId(facilityId, {
        unitId: actionData.unitId,
        externalUnitId: actionData.externalUnitId,
      });

      // SECURITY: Validate unit belongs to this facility
      const unit = await this.unitModel.findById(unitId);
      
      if (!unit) {
        logger.error(`[FMS] Unit ${unitId} not found in database`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          change_id: change.id,
          tenant_id: tenantInternalId,
          unit_id: unitId,
        });
        throw new Error(`Unit ${unitId} not found`);
      }
      
      if (unit.facility_id !== facilityId) {
        logger.error(`[FMS] Unit ${unitId} belongs to different facility`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          expected_facility_id: facilityId,
          actual_facility_id: unit.facility_id,
          change_id: change.id,
          tenant_id: tenantInternalId,
          unit_id: unitId,
          unit_number: unit.unit_number,
        });
        throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
      }

      await this.unitsService.assignTenant(
        unitId,
        tenantInternalId,
        {
          accessType: 'full',
          isPrimary: true,
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
          notes: `FMS sync: tenant-unit change`,
        }
      );

      result.accessChanges.accessGranted.push({
        userId: tenantInternalId,
        unitId,
      });

    } else {
      const unitId = await this.resolveUnitInternalId(facilityId, {
        unitId: actionData.unitId,
        externalUnitId: actionData.externalUnitId,
      });

      // SECURITY: Validate unit belongs to this facility
      const unit = await this.unitModel.findById(unitId);
      if (!unit || unit.facility_id !== facilityId) {
        throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
      }

      await this.unitsService.unassignTenant(
        unitId,
        tenantInternalId,
        {
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
        }
      );

      result.accessChanges.accessRevoked.push({
        userId: tenantInternalId,
        unitId,
      });

      await this.maybeDeactivateTenantAfterLastUnit(tenantInternalId, result, {
        syncLogId: change.sync_log_id,
        performedBy,
      });

      // Parity with vacant unit_updated: when the unit has no remaining assignees, revoke shares
      const remainingOnUnit = await this.unitAssignmentModel.findByUnitId(unitId);
      if (remainingOnUnit.length === 0) {
        let userRole = UserRole.ADMIN;
        if (performedBy && performedBy !== 'fms-system') {
          const triggeringUser = await UserModel.findById(performedBy);
          if (triggeringUser) {
            userRole = (triggeringUser as any).role;
          }
        }
        const { KeySharingService } = await import('@/services/key-sharing.service');
        await KeySharingService.getInstance().revokeAllActiveSharesForUnit(
          unitId,
          performedBy,
          userRole,
          { bestEffortGatewayDenylist: true },
        );
      }
    }
  }

  private async resolveTenantInternalId(facilityId: string, change: FMSChange): Promise<string> {
    if (change.internal_id) {
      return change.internal_id;
    }
    const mapping = await this.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      change.external_id
    );
    if (!mapping?.internal_id) {
      throw new Error(`Internal tenant ID not found for FMS tenant ${change.external_id}`);
    }
    return mapping.internal_id;
  }

  private async resolveUnitInternalId(
    facilityId: string,
    refs: { unitId?: string; externalUnitId?: string }
  ): Promise<string> {
    if (refs.unitId) {
      return refs.unitId;
    }
    if (refs.externalUnitId) {
      const mapping = await this.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        refs.externalUnitId
      );
      if (mapping?.internal_id) {
        return mapping.internal_id;
      }
    }
    throw new Error(
      `Internal unit ID not found${refs.externalUnitId ? ` for FMS unit ${refs.externalUnitId}` : ''}`
    );
  }

  /**
   * Apply unit added change
   */
  private async applyUnitAdded(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    const unitData = change.after_data as FMSUnit;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    const config = ctx.config ?? (await this.fmsConfigModel.findByFacilityId(facilityId));

    // Check if this unit already exists (could happen with old pending changes from before the fix)
    // First check by FMS mapping
    const existingMapping = await this.entityMappingModel.findByExternalId(
      facilityId,
      'unit',
      unitData.externalId
    );

    if (existingMapping) {
      logger.info(`[FMS] Unit with external ID ${unitData.externalId} already has a mapping, skipping creation`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        internal_id: existingMapping.internal_id,
      });
      return;
    }

    // Also check by unit number (in case unit exists without mapping)
    const allUnits = await this.unitModel.getUnitsListForUser(
      'admin',
      UserRole.ADMIN,
      { facility_id: facilityId, limit: 1000, offset: 0 }
    );
    const existingUnit = (allUnits.units || []).find((u: any) => u.unit_number === unitData.unitNumber);

    if (existingUnit) {
      logger.info(`[FMS] Unit ${unitData.unitNumber} already exists, creating mapping only`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        unit_id: (existingUnit).id,
      });

      // Check if mapping already exists to avoid duplicates
      const existingUnitMapping = await this.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        unitData.externalId
      );

      logger.info(`[FMS] Creating mapping for existing unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        existing_unit_id: (existingUnit).id,
        existing_unit_number: (existingUnit).unit_number,
        existing_mapping: !!existingUnitMapping,
      });

      if (!existingUnitMapping) {
      // Create the FMS entity mapping for the existing unit
      await this.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'unit',
        external_id: unitData.externalId,
        internal_id: (existingUnit).id,
        provider_type: config?.provider_type || 'generic_rest',
        metadata: {
          unitNumber: unitData.unitNumber,
          unitType: unitData.unitType,
        },
      });

        logger.info(`[FMS] Created mapping for existing unit ${unitData.unitNumber}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          external_id: unitData.externalId,
          internal_id: (existingUnit).id,
        });
      } else {
        logger.info(`[FMS] Unit entity mapping already exists for external_id ${unitData.externalId}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          existing_internal_id: existingUnitMapping.internal_id,
          expected_internal_id: (existingUnit).id,
        });
      }

      logger.info(`[FMS] Created FMS mapping for existing unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      return;
    }

    // Create unit using UnitsService with ADMIN role (FMS sync is privileged operation)
    // NOTE: We don't set size_sqft from FMS since FMS provides dimensional strings like "10x15"
    // but our database expects numeric square footage. Store dimensional size in metadata instead.
    const newUnit = await this.unitsService.createUnit(
      {
        facility_id: facilityId,
        unit_number: unitData.unitNumber,
        unit_type: unitData.unitType || 'storage',
        // size_sqft: not set from FMS - it's a DECIMAL column but FMS gives us strings like "10x15"
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_size: unitData.size, // Store dimensional size string here
          fms_custom_fields: unitData.customFields,
        },
      },
      performedBy, // Use the user who triggered the sync
      userRole // Use the actual user's role for proper authorization
    );

    // Create FMS entity mapping via ensureMapping (centralized)
    try {
      await this.entityMappingModel.ensureMapping({
      facility_id: facilityId,
      entity_type: 'unit',
      external_id: unitData.externalId,
      internal_id: newUnit.id,
      provider_type: config?.provider_type || 'generic_rest',
      metadata: {
        unitNumber: unitData.unitNumber,
        syncedAt: new Date(),
      },
    });
      logger.info(`[FMS] Ensured mapping for unit ${unitData.unitNumber}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        internal_id: newUnit.id,
      });
    } catch (e) {
      if ((e as any).code === 'FMS_MAPPING_CONFLICT') {
        logger.error('[FMS] Mapping conflict when creating unit mapping', {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          external_id: unitData.externalId,
          new_internal_id: newUnit.id,
          existing_internal_id: (e as any).existing_internal_id,
        });
        throw e;
      }
      throw e;
    }

    logger.info(`[FMS] Created unit ${unitData.unitNumber} (${newUnit.id}) by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });
  }

  /**
   * Deactivate a tenant when they have no remaining unit assignments and no active shared keys.
   * Shared with tenant_removed, tenant_unit_changed unassign, and vacant unit_updated kick-out.
   */
  private async maybeDeactivateTenantAfterLastUnit(
    tenantId: string,
    result: FMSChangeApplicationResult,
    ctx: { syncLogId: string; performedBy: string },
  ): Promise<boolean> {
    const remainingAssignments = await this.unitAssignmentModel.findByTenantId(tenantId);
    if (remainingAssignments.length > 0) {
      logger.info(`[FMS] Tenant user ${tenantId} not deactivated (remainingAssignments=${remainingAssignments.length})`, {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
      });
      return false;
    }

    const keySharingModel = new KeySharingModel();
    const sharedKeys = await keySharingModel.getUserSharedUnits(tenantId);
    if (sharedKeys.length > 0) {
      logger.info(`[FMS] Tenant user ${tenantId} not deactivated (sharedKeys=${sharedKeys.length})`, {
        fms_sync: true,
        sync_log_id: ctx.syncLogId,
      });
      return false;
    }

    await UserModel.deactivateUser(tenantId);
    result.accessChanges.usersDeactivated.push(tenantId);
    logger.info(`[FMS] Deactivated tenant user: ${tenantId}`, {
      fms_sync: true,
      sync_log_id: ctx.syncLogId,
      performed_by: ctx.performedBy,
    });
    return true;
  }

  /**
   * Apply unit updated change.
   * Self-heals occupancy vs assignments: vacant statuses kick out tenants (denylist/shares);
   * occupied with no assignment assigns a mapped FMS tenant (after tenant_added / restore).
   */
  private async applyUnitUpdated(
    change: FMSChange,
    result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal unit ID not found');
    }

    const unitData = change.after_data as FMSUnit;
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const unitId = change.internal_id;

    // SECURITY: Validate unit belongs to this facility
    const unit = await this.unitModel.findById(unitId);
    if (!unit) {
      throw new Error(`Unit ${unitId} not found`);
    }

    if (unit.facility_id !== facilityId) {
      logger.error(`[FMS] Security violation: Attempted to update unit from different facility`, {
        unit_id: unitId,
        unit_facility_id: unit.facility_id,
        sync_facility_id: facilityId,
        sync_log_id: change.sync_log_id,
      });
      throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
    }

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    const config = await this.fmsConfigModel.findByFacilityId(facilityId);

    // Check if there's an FMS entity mapping for this unit by external_id
    const mappingByExternalId = await this.entityMappingModel.findByExternalId(
      facilityId,
      'unit',
      unitData.externalId
    );

    // Check if there's also a mapping by internal_id
    const mappingByInternalId = await this.entityMappingModel.findByInternalId(
      facilityId,
      'unit',
      unitId
    );

    // If mapping by external_id exists but points to wrong internal_id (stale), delete it
    if (mappingByExternalId && mappingByExternalId.internal_id !== unitId) {
      logger.info(`[FMS] Deleting stale mapping for external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        old_internal_id: mappingByExternalId.internal_id,
        new_internal_id: unitId,
      });

      await this.entityMappingModel.delete(mappingByExternalId.id);
    }

    // If no correct mapping exists, create one — then fall through and apply the unit update
    if (!mappingByInternalId || mappingByInternalId.external_id !== unitData.externalId) {
      logger.info(`[FMS] Creating/updating FMS entity mapping for unit ${unitId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        is_update: !!mappingByInternalId,
      });

      const finalCheckMapping = await this.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        unitData.externalId
      );

      if (!finalCheckMapping) {
        await this.entityMappingModel.create({
          facility_id: facilityId,
          entity_type: 'unit',
          external_id: unitData.externalId,
          internal_id: unitId,
          provider_type: config?.provider_type || 'generic_rest',
          metadata: {
            unitNumber: unitData.unitNumber,
            unitType: unitData.unitType,
          },
        });
      } else {
        logger.info(`[FMS] Unit entity mapping already exists during update for external_id ${unitData.externalId}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          existing_internal_id: finalCheckMapping.internal_id,
          expected_internal_id: unitId,
        });
      }

      logger.info(`[FMS] Linked unit ${unitId} to FMS external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
    }

    const targetStatus = unitData.status;
    const assignments = await this.unitAssignmentModel.findByUnitId(unitId);

    // Vacant FMS status: kick out tenants so assignment gate allows the status write
    if (targetStatus !== 'occupied' && assignments.length > 0) {
      for (const assignment of assignments) {
        await this.unitsService.unassignTenant(unitId, assignment.tenant_id, {
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
        });
        result.accessChanges.accessRevoked.push({
          userId: assignment.tenant_id,
          unitId,
        });
        await this.maybeDeactivateTenantAfterLastUnit(assignment.tenant_id, result, {
          syncLogId: change.sync_log_id,
          performedBy,
        });
      }

      const { KeySharingService } = await import('@/services/key-sharing.service');
      await KeySharingService.getInstance().revokeAllActiveSharesForUnit(
        unitId,
        performedBy,
        userRole,
        { bestEffortGatewayDenylist: true },
      );
    }

    // Occupied with no assignments: assign mapped FMS tenant (must already exist via tenant_added)
    if (targetStatus === 'occupied') {
      const currentAssignments = await this.unitAssignmentModel.findByUnitId(unitId);
      if (currentAssignments.length === 0) {
        const externalTenantId = unitData.tenantId?.trim();
        if (!externalTenantId) {
          throw new Error(
            'Cannot mark this unit occupied until a tenant is assigned. Create or assign the tenant first.',
          );
        }

        const tenantMapping = await this.entityMappingModel.findByExternalId(
          facilityId,
          'user',
          externalTenantId,
        );
        if (!tenantMapping?.internal_id) {
          throw new Error(
            'Cannot mark this unit occupied because the tenant is not in BluLok yet. Create the tenant first, then retry this unit update.',
          );
        }

        await this.restoreFmsTenantAccess(tenantMapping.internal_id, facilityId, {
          mapping: tenantMapping,
          performedBy,
          syncLogId: change.sync_log_id,
          force: true,
        });
        if (tenantMapping) {
          await this.entityMappingModel.updateMetadata(
            tenantMapping.id,
            clearFmsMappingRemoved(tenantMapping.metadata),
          );
        }

        await this.unitsService.assignTenant(unitId, tenantMapping.internal_id, {
          accessType: 'full',
          isPrimary: true,
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
          notes: 'FMS sync: unit_updated occupied self-heal',
        });
        result.accessChanges.accessGranted.push({
          userId: tenantMapping.internal_id,
          unitId,
        });
      }
    }

    // NOTE: We don't update size_sqft from FMS since FMS provides dimensional strings like "10x15"
    // but our database expects numeric square footage. Store dimensional size in metadata instead.
    logger.info(`[FMS] Updating unit ${unitId} status from DB to FMS value`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      unit_id: unitId,
      before_status: change.before_data?.status || 'unknown',
      new_status: unitData.status,
      unit_number: unitData.unitNumber,
    });

    await this.unitsService.updateUnit(
      unitId,
      {
        unit_type: unitData.unitType,
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_size: unitData.size,
          fms_custom_fields: unitData.customFields,
          last_fms_sync: new Date(),
        },
      },
      performedBy,
      userRole,
    );

    logger.info(`[FMS] Updated unit ${unitId} by ${performedBy}: status=${unitData.status}, type=${unitData.unitType}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });
  }

  /**
   * Apply unit removed change (FMS unit deleted webhook or full sync).
   */
  private async applyUnitRemoved(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const performedBy = ctx.performedBy;
    const externalId = change.external_id;

    const mapping = await this.entityMappingModel.findByExternalId(facilityId, 'unit', externalId);
    const internalId = change.internal_id ?? mapping?.internal_id;
    if (!internalId) {
      logger.info('[FMS] Unit removed webhook: no mapped unit — nothing to delete', {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: externalId,
      });
      return;
    }

    const unit = await this.unitModel.findById(internalId);
    if (!unit || unit.facility_id !== facilityId) {
      throw new Error(`Unit ${internalId} not found in facility ${facilityId}`);
    }

    const assignments = await this.unitAssignmentModel.findByUnitId(internalId);
    if (assignments.length > 0) {
      throw new Error(
        `Cannot remove unit ${unit.unit_number}: tenants are still assigned. Unassign tenants first.`
      );
    }

    const hasDevice = await this.unitModel.hasBlulokDevice(internalId);
    if (hasDevice) {
      throw new Error(
        `Cannot remove unit ${unit.unit_number}: a BluLok device is still assigned. Unassign the device first.`
      );
    }

    let userRole = UserRole.ADMIN;
    if (performedBy && performedBy !== 'fms-system') {
      const triggeringUser = await UserModel.findById(performedBy);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    await this.unitsService.deleteUnit(internalId, performedBy, userRole);

    if (mapping) {
      await this.entityMappingModel.delete(mapping.id);
    }

    logger.info(`[FMS] Removed unit ${unit.unit_number} (${internalId}) from FMS delete event`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      external_id: externalId,
    });
  }

  /**
   * Apply overlock flag change from webhook or manual review.
   */
  private async applyUnitOverlockChanged(
    change: FMSChange,
    _result: FMSChangeApplicationResult,
    ctx: FMSApplyContext,
  ): Promise<void> {
    const facilityId = ctx.facilityId;
    const unitId = change.internal_id
      ?? (await this.resolveUnitInternalId(facilityId, { externalUnitId: change.external_id }));

    const after = change.after_data as { is_overlocked?: boolean };
    const isOverlocked = Boolean(after?.is_overlocked);

    const unit = await this.unitModel.findById(unitId);
    if (!unit || unit.facility_id !== facilityId) {
      throw new Error(`Unit ${unitId} not found in facility ${facilityId}`);
    }

    const assignments = await this.unitAssignmentModel.findByUnitId(unitId);
    if (isOverlocked && assignments.length === 0) {
      throw new Error('Cannot overlock a vacant unit');
    }

    await this.unitModel.setOverlockStatus(unitId, isOverlocked);

    logger.info(`[FMS] Set overlock=${isOverlocked} on unit ${unitId}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });
  }

  /**
   * Auto-accept valid changes only; leave invalid or failed rows in manual review.
   */
  private async autoAcceptAndApplyChanges(
    syncLogId: string,
    changes: FMSChange[],
  ): Promise<ReturnType<typeof resolveFmsAutoApplyOutcome>> {
    const { autoAppliable } = partitionChangesForAutoApply(changes);

    let applyResult: FMSChangeApplicationResult = {
      success: true,
      changesApplied: 0,
      changesFailed: 0,
      errors: [],
      errorDetails: [],
      appliedChangeIds: [],
      failedChangeIds: [],
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    };

    if (autoAppliable.length > 0) {
      const autoIds = autoAppliable.map((c) => c.id);
      await this.reviewChanges(autoIds, true);
      applyResult = await this.applyChanges(syncLogId, autoIds);
    }

    await this.refreshSyncLogChangeCounts(syncLogId);
    const stats = await this.changeModel.getStatsBySyncLogId(syncLogId);

    return resolveFmsAutoApplyOutcome({
      totalChanges: changes.length,
      applyResult,
      pendingCount: stats.pending,
    });
  }

  /**
   * Process an inbound FMS webhook (Storable Edge CloudEvents).
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
    const config = await this.fmsConfigModel.findByFacilityId(facilityId);
    if (!config) {
      throw new Error('FMS configuration not found for facility');
    }
    if (!config.is_enabled) {
      throw new Error('FMS integration is not enabled for this facility');
    }

    const provider = this.getProvider(facilityId, config);
    if (!provider.getCapabilities().supportsWebhooks) {
      throw new Error(`Provider ${config.provider_type} does not support webhooks`);
    }

    const authResult = validateFmsWebhookAuth(
      config.config.syncSettings,
      config.config.customSettings,
      rawBody,
      requestHeaders
    );
    if (!authResult.valid) {
      throw new Error(authResult.error ?? 'Invalid webhook signature');
    }
    if (authResult.mode === FMSWebhookAuthMode.NONE) {
      logger.warn('[FMS Webhook] Processing unauthenticated webhook (webhookAuthMode=none)', {
        facilityId,
      });
    }

    const payload = await provider.parseWebhookPayload(rawBody);

    const existing = await this.webhookEventModel.findByExternalEventId(
      facilityId,
      payload.externalEventId
    );
    if (existing && this.webhookEventModel.isProcessed(existing)) {
      return { duplicate: true, message: 'Event already processed' };
    }
    if (existing && !this.webhookEventModel.isProcessed(existing)) {
      await this.webhookEventModel.deleteByExternalEventId(facilityId, payload.externalEventId);
    }

    const autoAccept = shouldAutoAcceptChanges(config.config.syncSettings, 'webhook');
    let syncLog: FMSSyncLog;
    let syncLogCreatedForEvent = false;

    if (!autoAccept) {
      const openReview = await this.syncLogModel.findOpenWebhookReviewSyncLog(facilityId);
      if (openReview) {
        syncLog = openReview;
      } else {
        syncLog = await this.syncLogModel.create({
          facility_id: facilityId,
          fms_config_id: config.id,
          triggered_by: 'webhook',
        });
        syncLogCreatedForEvent = true;
      }
    } else {
      syncLog = await this.syncLogModel.create({
        facility_id: facilityId,
        fms_config_id: config.id,
        triggered_by: 'webhook',
      });
      syncLogCreatedForEvent = true;
    }

    const webhookRecord = await this.webhookEventModel.create({
      facility_id: facilityId,
      external_event_id: payload.externalEventId,
      event_type: payload.event_type,
      sync_log_id: syncLog.id,
    });

    try {
      const { summary, summaryText } = summarizeFmsWebhookPayload(payload);

      const pendingInserts = await this.buildWebhookChanges(
        facilityId,
        syncLog.id,
        payload,
        provider
      );

      const changes: FMSChange[] = [];
      for (const insert of pendingInserts) {
        changes.push(await this.changeModel.create(insert));
      }

      const priorDetected = Number(syncLog.changes_detected ?? 0);
      const priorPending = Number(syncLog.changes_pending ?? 0);

      let changesApplied = 0;
      let changesFailed = 0;
      let applyErrors: string[] = [];
      let autoApplied = false;
      let requiresReview = false;

      if (autoAccept && changes.length > 0) {
        const outcome = await this.autoAcceptAndApplyChanges(syncLog.id, changes);
        changesApplied = outcome.changesApplied;
        changesFailed = outcome.changesFailed;
        applyErrors = outcome.applyErrors;
        autoApplied = outcome.autoApplied;
        requiresReview = outcome.requiresReview;

        await this.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected + changes.length,
          changes_applied: Number(syncLog.changes_applied ?? 0) + changesApplied,
          sync_status: requiresReview
            ? FMSSyncStatus.PENDING_REVIEW
            : FMSSyncStatus.COMPLETED,
        });
        await this.refreshSyncLogChangeCounts(syncLog.id);

        if (requiresReview) {
          await this.syncLogModel.markPendingReview(syncLog.id, {
            tenants_synced: 0,
            units_synced: 0,
            errors: applyErrors,
            warnings: [],
            changes_auto_applied: changesApplied > 0,
          });
        } else {
          await this.syncLogModel.markCompleted(syncLog.id, {
            tenants_synced: 0,
            units_synced: 0,
            errors: applyErrors,
            warnings: [],
            changes_auto_applied: true,
          });
        }
      } else if (changes.length > 0) {
        requiresReview = true;
        await this.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected + changes.length,
          changes_pending: priorPending + changes.length,
          sync_status: FMSSyncStatus.PENDING_REVIEW,
        });
        await this.syncLogModel.markPendingReview(syncLog.id, {
          tenants_synced: 0,
          units_synced: 0,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      } else {
        await this.syncLogModel.update(syncLog.id, {
          changes_detected: priorDetected,
          sync_status: FMSSyncStatus.COMPLETED,
        });
        await this.syncLogModel.markCompleted(syncLog.id, {
          tenants_synced: 0,
          units_synced: 0,
          errors: [],
          warnings: [],
          changes_auto_applied: false,
        });
      }

      const eventSummary = {
        ...summary,
        summaryText,
        changesDetected: changes.length,
        changesApplied,
        autoApplied,
        requiresReview,
      };

      await this.webhookEventModel.markProcessed(
        webhookRecord.id,
        syncLog.id,
        eventSummary,
      );

      const webhookFeedItem = this.toWebhookFeedItem({
        id: webhookRecord.id,
        facility_id: facilityId,
        external_event_id: payload.externalEventId,
        event_type: payload.event_type,
        received_at: webhookRecord.received_at,
        sync_log_id: syncLog.id,
        event_summary: eventSummary,
      });

      void this.notifyFmsWebhookReceived(facilityId, payload, webhookFeedItem);
      this.broadcastFMSSyncUpdate(facilityId, webhookFeedItem);

      return {
        duplicate: false,
        message: `Processed ${payload.event_type} webhook`,
        syncLogId: syncLog.id,
        changesDetected: changes.length,
        changesApplied,
        requiresReview,
      };
    } catch (error) {
      await this.webhookEventModel.deleteByExternalEventId(facilityId, payload.externalEventId);
      if (syncLogCreatedForEvent) {
        await this.syncLogModel.update(syncLog.id, {
          sync_status: FMSSyncStatus.FAILED,
          error_message: error instanceof Error ? error.message : 'Webhook processing failed',
        });
      }
      void this.notifyFmsWebhookFailure(
        facilityId,
        payload,
        error instanceof Error ? error.message : 'Webhook processing failed',
      );
      this.broadcastFMSSyncUpdate(facilityId);
      throw error;
    }
  }

  /**
   * Recent webhook events for the facility FMS tab feed.
   * Live-reconciles stale requiresReview flags against open pending review logs.
   */
  public async getRecentWebhookEvents(facilityId: string, limit = 5): Promise<FMSWebhookFeedItem[]> {
    const records = await this.webhookEventModel.findRecentByFacility(facilityId, limit);
    const syncLogIds = [
      ...new Set(
        records
          .map((record) => record.sync_log_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];

    const pendingCountBySyncLog = new Map<string, number>();
    await Promise.all(
      syncLogIds.map(async (syncLogId) => {
        const pending = await this.changeModel.findPendingBySyncLogId(syncLogId);
        pendingCountBySyncLog.set(syncLogId, pending.length);
      }),
    );

    return records.map((record) => {
      const item = this.toWebhookFeedItem(record);
      if (!item.requiresReview || !item.syncLogId) {
        return item;
      }

      const pendingCount = pendingCountBySyncLog.get(item.syncLogId) ?? 0;
      if (pendingCount === 0) {
        return { ...item, requiresReview: false };
      }

      return item;
    });
  }

  private toWebhookFeedItem(record: {
    id: string;
    facility_id: string;
    external_event_id: string;
    event_type: string;
    received_at: Date | string;
    sync_log_id?: string | null;
    event_summary?: Record<string, unknown> | null;
  }): FMSWebhookFeedItem {
    const eventSummary = record.event_summary ?? {};
    const changesDetected = Number(eventSummary.changesDetected ?? 0);
    const changesApplied = Number(eventSummary.changesApplied ?? 0);
    const autoApplied = eventSummary.autoApplied === true;
    const requiresReview = eventSummary.requiresReview === true;
    const summaryText =
      typeof eventSummary.summaryText === 'string'
        ? eventSummary.summaryText
        : record.event_type.replace(/\./g, ' ');

    const receivedAt =
      record.received_at instanceof Date
        ? record.received_at.toISOString()
        : new Date(record.received_at).toISOString();

    return {
      id: record.id,
      facilityId: record.facility_id,
      eventType: record.event_type,
      externalEventId: record.external_event_id,
      receivedAt,
      summary: eventSummary,
      summaryText,
      changesDetected,
      changesApplied,
      autoApplied,
      requiresReview,
      syncLogId: record.sync_log_id ?? '',
    };
  }

  private async getFacilityName(facilityId: string): Promise<string> {
    const { DatabaseService } = await import('@/services/database.service');
    const row = await DatabaseService.getInstance()
      .connection('facilities')
      .where('id', facilityId)
      .first('name');
    return (row?.name as string | undefined) || 'Facility';
  }

  private async notifyFmsWebhookReceived(
    facilityId: string,
    payload: FMSWebhookPayload,
    webhookFeedItem: FMSWebhookFeedItem,
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      const facilityName = await this.getFacilityName(facilityId);
      const dispatcher = InAppNotificationDispatcher.getInstance();

      await dispatcher.notifyFmsWebhookReceived(
        facilityId,
        facilityName,
        webhookFeedItem.id,
        payload.event_type,
        payload.data ?? {},
        {
          changesDetected: webhookFeedItem.changesDetected,
          changesApplied: webhookFeedItem.changesApplied,
          autoApplied: webhookFeedItem.autoApplied,
          requiresReview: webhookFeedItem.requiresReview,
          syncLogId: webhookFeedItem.syncLogId,
        },
        webhookFeedItem.requiresReview ? 'high' : 'low',
      );
    } catch (err) {
      logger.error('[FMS] Failed to send webhook notification:', err);
    }
  }

  private async notifyFmsWebhookFailure(
    facilityId: string,
    payload: FMSWebhookPayload,
    errorMessage: string,
  ): Promise<void> {
    try {
      const { InAppNotificationDispatcher } = await import(
        '@/services/notifications/in-app-notification-dispatcher.service'
      );
      const facilityName = await this.getFacilityName(facilityId);
      await InAppNotificationDispatcher.getInstance().notifyFmsSyncFailed(
        facilityId,
        facilityName,
        payload.externalEventId,
        `Webhook ${payload.event_type} failed: ${errorMessage}`,
      );
    } catch (err) {
      logger.error('[FMS] Failed to send webhook failure notification:', err);
    }
  }

  private async buildWebhookChanges(
    facilityId: string,
    syncLogId: string,
    payload: FMSWebhookPayload,
    provider: BaseFMSProvider
  ): Promise<Parameters<FMSChangeModel['create']>[0][]> {
    const data = payload.data;
    const inserts: Parameters<FMSChangeModel['create']>[0][] = [];

    const resolveTenantMapping = async (externalTenantId: string) =>
      this.entityMappingModel.findByExternalId(facilityId, 'user', externalTenantId);

    const resolveUnitMapping = async (externalUnitId: string) =>
      this.entityMappingModel.findByExternalId(facilityId, 'unit', externalUnitId);

    switch (payload.event_type) {
      case 'tenant.created': {
        const tenantData =
          provider instanceof StoredgeProvider
            ? provider.mapTenantBodyToFMSTenant(data)
            : this.mapGenericTenantBody(data);
        const validationErrors = this.validateTenantData(tenantData);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: tenantData.externalId,
          after_data: tenantData,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ADD_ACCESS],
          impact_summary: `Create tenant ${tenantData.email ?? tenantData.externalId} from webhook`,
          is_valid: validationErrors.length === 0,
          validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
        });
        break;
      }
      case 'tenant.updated': {
        const tenantData =
          provider instanceof StoredgeProvider
            ? provider.mapTenantBodyToFMSTenant(data)
            : this.mapGenericTenantBody(data);
        const mapping = await resolveTenantMapping(tenantData.externalId);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UPDATED,
          entity_type: 'tenant',
          external_id: tenantData.externalId,
          internal_id: mapping?.internal_id,
          after_data: tenantData,
          required_actions: [FMSChangeAction.UPDATE_USER],
          impact_summary: `Update tenant ${tenantData.email ?? tenantData.externalId} from webhook`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Tenant is not mapped in BluLok yet'],
        });
        break;
      }
      case 'ledger.moved-in': {
        const tenantExternalId = String(data.tenant_id);
        const unitExternalId = String(data.unit_id);
        let tenantMapping = await resolveTenantMapping(tenantExternalId);
        if (!tenantMapping) {
          const fetched = await provider.fetchTenant(tenantExternalId);
          if (fetched) {
            const validationErrors = this.validateTenantData(fetched);
            inserts.push({
              sync_log_id: syncLogId,
              change_type: FMSChangeType.TENANT_ADDED,
              entity_type: 'tenant',
              external_id: fetched.externalId,
              after_data: fetched,
              required_actions: [FMSChangeAction.CREATE_USER],
              impact_summary: `Create tenant before move-in (${tenantExternalId})`,
              is_valid: validationErrors.length === 0,
              validation_errors: validationErrors.length > 0 ? validationErrors : undefined,
            });
          }
        }

        let unitMapping = await resolveUnitMapping(unitExternalId);
        if (!unitMapping) {
          const resolved = await this.resolveWebhookUnit(provider, { unit_id: unitExternalId });
          if (resolved.unit) {
            inserts.push({
              sync_log_id: syncLogId,
              change_type: FMSChangeType.UNIT_ADDED,
              entity_type: 'unit',
              external_id: resolved.unit.externalId,
              after_data: resolved.unit,
              required_actions: [FMSChangeAction.ADD_ACCESS],
              impact_summary: `Create unit ${resolved.unit.unitNumber} before move-in`,
              is_valid: true,
            });
          }
        }

        tenantMapping = tenantMapping ?? (await resolveTenantMapping(tenantExternalId));
        unitMapping = unitMapping ?? (await resolveUnitMapping(unitExternalId));
        const unit = unitMapping?.internal_id
          ? await this.unitModel.findById(unitMapping.internal_id)
          : null;

        // Prefer FMS unit status (SoT) over the ledger move-in event when they disagree.
        const fetchedUnit = unitExternalId ? await provider.fetchUnit(unitExternalId) : null;
        const assignBlockers = resolveLedgerAssignAgainstUnitStatus({
          unitNumber: fetchedUnit?.unitNumber ?? unit?.unit_number ?? unitExternalId,
          fmsUnitStatus: fetchedUnit?.status,
          tenant: this.webhookTenantInfoFromInserts(inserts, tenantExternalId),
        });

        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: tenantExternalId,
          internal_id: tenantMapping?.internal_id,
          after_data: {
            action: 'assign_unit',
            unitId: unitMapping?.internal_id,
            externalUnitId: unitExternalId,
            unitNumber: unit?.unit_number ?? unitExternalId,
            webhookOnly: true,
          },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary:
            assignBlockers.length > 0
              ? `Move-in: assign tenant to unit ${unit?.unit_number ?? unitExternalId} — blocked (FMS unit is vacant)`
              : `Move-in: assign tenant to unit ${unit?.unit_number ?? unitExternalId}`,
          is_valid: assignBlockers.length === 0,
          validation_errors: assignBlockers.length > 0 ? assignBlockers : undefined,
        });

        // Companion unit_updated so webhook occupancy matches full-sync self-heal
        await this.maybeAppendWebhookUnitUpdated(inserts, {
          facilityId,
          syncLogId,
          provider,
          unitExternalId,
          unitInternalId: unitMapping?.internal_id,
          prefetchedUnit: fetchedUnit ?? undefined,
        });
        break;
      }
      case 'ledger.moved-out': {
        const tenantExternalId = String(data.tenant_id);
        const unitExternalId = String(data.unit_id);
        const tenantMapping = await resolveTenantMapping(tenantExternalId);
        const unitMapping = await resolveUnitMapping(unitExternalId);
        const unit = unitMapping?.internal_id
          ? await this.unitModel.findById(unitMapping.internal_id)
          : null;

        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: tenantExternalId,
          internal_id: tenantMapping?.internal_id,
          before_data: {
            action: 'unassign_unit',
            unitId: unitMapping?.internal_id,
            externalUnitId: unitExternalId,
            unitNumber: unit?.unit_number ?? unitExternalId,
            webhookOnly: true,
          },
          // Must stay null (not {}) so apply/order resolve the unassign action from before_data.
          after_data: null as never,
          required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Move-out: unassign tenant from unit ${unit?.unit_number ?? unitExternalId}`,
          is_valid: Boolean(tenantMapping?.internal_id && unitMapping?.internal_id),
          validation_errors: moveOutValidationErrors(
            tenantExternalId,
            unitExternalId,
            tenantMapping?.internal_id,
            unitMapping?.internal_id,
          ),
        });

        // Companion unit_updated so vacant kick-out / status write matches full sync
        await this.maybeAppendWebhookUnitUpdated(inserts, {
          facilityId,
          syncLogId,
          provider,
          unitExternalId,
          unitInternalId: unitMapping?.internal_id,
        });
        break;
      }
      case 'unit.created': {
        const resolved = await this.resolveWebhookUnit(provider, data);
        const unitExternalId = String(data.unit_id ?? '');
        if (!resolved.unit) {
          inserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_ADDED,
            entity_type: 'unit',
            external_id: unitExternalId,
            after_data: { externalId: unitExternalId },
            required_actions: [FMSChangeAction.ADD_ACCESS],
            impact_summary: `Create unit ${unitExternalId} from webhook`,
            is_valid: false,
            validation_errors: resolved.validationErrors ?? [`Could not fetch unit ${unitExternalId} from FMS API`],
          });
        } else {
          inserts.push({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_ADDED,
            entity_type: 'unit',
            external_id: resolved.unit.externalId,
            after_data: resolved.unit,
            required_actions: [FMSChangeAction.ADD_ACCESS],
            impact_summary: `Create unit ${resolved.unit.unitNumber} from webhook`,
            is_valid: true,
          });
        }
        break;
      }
      case 'unit.deleted': {
        const unitExternalId = String(data.unit_id);
        const mapping = await resolveUnitMapping(unitExternalId);
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_REMOVED,
          entity_type: 'unit',
          external_id: unitExternalId,
          internal_id: mapping?.internal_id,
          before_data: mapping ? { externalId: unitExternalId } : null,
          after_data: null,
          required_actions: [FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Remove unit ${unitExternalId} deleted in FMS`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Unit is not mapped in BluLok'],
        });
        break;
      }
      case 'unit.overlock-applied':
      case 'unit.overlock-removed': {
        const unitExternalId = String(data.unit_id);
        const mapping = await resolveUnitMapping(unitExternalId);
        const isOverlocked = payload.event_type === 'unit.overlock-applied';
        inserts.push({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_OVERLOCK_CHANGED,
          entity_type: 'unit',
          external_id: unitExternalId,
          internal_id: mapping?.internal_id,
          before_data: { is_overlocked: !isOverlocked },
          after_data: { is_overlocked: isOverlocked },
          required_actions: isOverlocked
            ? [FMSChangeAction.REMOVE_ACCESS]
            : [FMSChangeAction.ADD_ACCESS],
          impact_summary: isOverlocked
            ? `Apply overlock to unit ${unitExternalId}`
            : `Remove overlock from unit ${unitExternalId}`,
          is_valid: Boolean(mapping?.internal_id),
          validation_errors: mapping?.internal_id ? undefined : ['Unit is not mapped in BluLok'],
        });
        break;
      }
      default:
        throw new Error(`Unhandled webhook event type: ${payload.event_type}`);
    }

    return inserts;
  }

  private mapGenericTenantBody(data: Record<string, unknown>): FMSTenant {
    return {
      externalId: String(data.tenant_id ?? data.externalId ?? ''),
      email: data.email != null ? String(data.email) : null,
      firstName: data.first_name != null ? String(data.first_name) : (data.firstName != null ? String(data.firstName) : null),
      lastName: data.last_name != null ? String(data.last_name) : (data.lastName != null ? String(data.lastName) : null),
      phone: data.phone != null ? String(data.phone) : undefined,
      unitIds: [],
      status: 'active',
    };
  }

  /**
   * After ledger move-in/out, fetch the unit from FMS and emit unit_updated when BluLok status/type
   * differs — same occupancy self-heal path as full sync (vacant kick-out / occupied assign).
   * Skipped when the unit is not mapped yet (e.g. unit_added in the same webhook batch).
   */
  private async maybeAppendWebhookUnitUpdated(
    inserts: Parameters<FMSChangeModel['create']>[0][],
    options: {
      facilityId: string;
      syncLogId: string;
      provider: BaseFMSProvider;
      unitExternalId: string;
      unitInternalId?: string;
      /** When the caller already fetched the unit (e.g. move-in conflict check), reuse it. */
      prefetchedUnit?: FMSUnit | null;
    },
  ): Promise<void> {
    const { facilityId, syncLogId, provider, unitExternalId, unitInternalId, prefetchedUnit } = options;
    if (!unitInternalId || !unitExternalId) {
      return;
    }

    const blulokUnit = await this.unitModel.findById(unitInternalId);
    if (!blulokUnit || blulokUnit.facility_id !== facilityId) {
      return;
    }

    const fetched = prefetchedUnit ?? (await provider.fetchUnit(unitExternalId));
    if (!fetched) {
      logger.warn(`[FMS] Webhook occupancy: could not fetch unit ${unitExternalId} for companion unit_updated`, {
        fms_sync: true,
        sync_log_id: syncLogId,
        facility_id: facilityId,
      });
      return;
    }

    const hasChanges =
      blulokUnit.status !== fetched.status ||
      blulokUnit.unit_type !== fetched.unitType;
    if (!hasChanges) {
      return;
    }

    const occupancyBlockers = resolveOccupiedUnitBlockers(
      fetched,
      blulokUnit.status,
      await this.buildWebhookOccupancyContext(facilityId, inserts, fetched.tenantId),
    );
    if (occupancyBlockers.length > 0) {
      logger.warn(`[FMS] Webhook occupancy: unit ${fetched.unitNumber} cannot be marked occupied yet`, {
        fms_sync: true, sync_log_id: syncLogId, facility_id: facilityId, reasons: occupancyBlockers,
      });
    }

    let impactSummary = `Update unit ${fetched.unitNumber} from webhook (occupancy sync)`;
    if (isFmsUnitVacantStatus(fetched.status) && occupancyBlockers.length === 0) {
      const tenantLabel = this.webhookBatchTenantLabel(inserts, fetched.tenantId);
      const ledgerNote = formatVacantUnitLedgerConflictNote(
        fetched.unitNumber,
        tenantLabel ? [tenantLabel] : [],
      );
      if (ledgerNote) impactSummary = `${ledgerNote} (webhook)`;
    }

    inserts.push({
      sync_log_id: syncLogId,
      change_type: FMSChangeType.UNIT_UPDATED,
      entity_type: 'unit',
      external_id: fetched.externalId,
      internal_id: unitInternalId,
      before_data: { status: blulokUnit.status, unitType: blulokUnit.unit_type },
      after_data: fetched,
      required_actions: [],
      impact_summary: impactSummary,
      is_valid: occupancyBlockers.length === 0,
      validation_errors: occupancyBlockers.length > 0 ? occupancyBlockers : undefined,
    });
  }

  private webhookBatchTenantLabel(
    inserts: Parameters<FMSChangeModel['create']>[0][],
    tenantExternalId?: string | null,
  ): string | null {
    if (!tenantExternalId) return null;
    const row = inserts.find(
      (r) =>
        (r.change_type === FMSChangeType.TENANT_ADDED || r.change_type === FMSChangeType.TENANT_UNIT_CHANGED) &&
        r.external_id === tenantExternalId,
    );
    if (!row) return tenantExternalId;
    const payload = (row.after_data ?? row.before_data ?? {}) as FmsOccupancyTenantInfo;
    const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim();
    const contact = formatFmsTenantContactLabel(payload);
    return name || contact || tenantExternalId;
  }

  private webhookTenantInfoFromInserts(
    inserts: Parameters<FMSChangeModel['create']>[0][],
    tenantExternalId: string,
  ): FmsOccupancyTenantInfo | undefined {
    const row = inserts.find(
      (r) => r.change_type === FMSChangeType.TENANT_ADDED && r.external_id === tenantExternalId,
    );
    if (!row?.after_data || typeof row.after_data !== 'object') return undefined;
    return row.after_data as FmsOccupancyTenantInfo;
  }

  /**
   * Occupancy context for a single webhook batch. Unlike a full sync, the batch only knows about the
   * tenants named in this event, so unknown tenants are not treated as blockers.
   */
  private async buildWebhookOccupancyContext(
    facilityId: string,
    inserts: Parameters<FMSChangeModel['create']>[0][],
    unitTenantExternalId?: string,
  ): Promise<FmsOccupancyContext> {
    const tenantRows = inserts.filter((row) => row.change_type === FMSChangeType.TENANT_ADDED);
    const batchTenants = tenantRows.map((row) => {
      const payload = (row.after_data ?? {}) as FmsOccupancyTenantInfo;
      return {
        externalId: row.external_id,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        email: payload.email ?? null,
        phone: payload.phone,
      };
    });

    const mapping = unitTenantExternalId
      ? await this.entityMappingModel.findByExternalId(facilityId, 'user', unitTenantExternalId)
      : null;

    return buildFmsOccupancyContext({
      fmsTenants: batchTenants,
      tenantChanges: tenantRows,
      mappedTenantExternalIds: mapping && unitTenantExternalId ? [unitTenantExternalId] : [],
      treatUnknownTenantAsBlocker: false,
    });
  }

  /**
   * Storable unit.created webhooks only include unit_id — fetch full unit details from the FMS API.
   * Retries briefly in case the unit is not yet readable after creation. Non-Storable flat webhooks
   * may include inline unit fields when the API lookup is unavailable (simulated/generic providers).
   */
  private async resolveWebhookUnit(
    provider: BaseFMSProvider,
    data: Record<string, unknown>,
  ): Promise<{ unit: FMSUnit | null; validationErrors?: string[] }> {
    const unitExternalId = String(data.unit_id ?? '');
    if (!unitExternalId) {
      return { unit: null, validationErrors: ['Webhook payload missing unit_id'] };
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const fetched = await provider.fetchUnit(unitExternalId);
      if (fetched) {
        return { unit: fetched };
      }
      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    if (!(provider instanceof StoredgeProvider)) {
      const fromBody = this.mapGenericUnitBody(data);
      const bodyErrors = this.validateUnitBodyData(fromBody);
      if (bodyErrors.length === 0) {
        return { unit: fromBody };
      }
    }

    const storedgeHint = provider instanceof StoredgeProvider
      ? ' Storable unit.created webhooks only include unit_id — use a unit UUID that exists in your FMS facility.'
      : '';
    return {
      unit: null,
      validationErrors: [`Could not fetch unit ${unitExternalId} from FMS API.${storedgeHint}`],
    };
  }

  private mapGenericUnitBody(data: Record<string, unknown>): FMSUnit {
    const unitNumber =
      data.unit_number != null
        ? String(data.unit_number)
        : data.unitNumber != null
          ? String(data.unitNumber)
          : data.name != null
            ? String(data.name)
            : '';

    return {
      externalId: String(data.unit_id ?? data.externalId ?? ''),
      unitNumber,
      unitType:
        data.unit_type != null
          ? String(data.unit_type)
          : data.unitType != null
            ? String(data.unitType)
            : undefined,
      size: data.size != null ? String(data.size) : undefined,
      status: this.normalizeUnitStatus(data.status),
      tenantId: data.tenant_id != null ? String(data.tenant_id) : undefined,
      monthlyRate:
        typeof data.monthly_rate === 'number'
          ? data.monthly_rate
          : typeof data.monthlyRate === 'number'
            ? data.monthlyRate
            : undefined,
    };
  }

  private normalizeUnitStatus(status: unknown): FMSUnit['status'] {
    if (status === 'occupied' || status === 'maintenance' || status === 'reserved' || status === 'available') {
      return status;
    }
    if (status === 'vacant') {
      return 'available';
    }
    return 'available';
  }

  private validateUnitBodyData(unit: FMSUnit): string[] {
    const errors: string[] = [];
    if (!unit.externalId) {
      errors.push('Unit must have an external ID');
    }
    if (!unit.unitNumber) {
      errors.push('Unit must have a unit number in webhook payload or via FMS API');
    }
    return errors;
  }

  private validateTenantData(tenant: FMSTenant): string[] {
    return validateFmsTenantWebhookFields(tenant);
  }

  /**
   * Build sync result summary
   */
  private async buildSyncResult(
    syncLogId: string,
    changes: FMSChange[]
  ): Promise<FMSSyncResult> {
    const syncLog = await this.syncLogModel.findById(syncLogId);

    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const summary = {
      tenantsAdded: changes.filter(c => c.change_type === FMSChangeType.TENANT_ADDED).length,
      tenantsRemoved: changes.filter(c => c.change_type === FMSChangeType.TENANT_REMOVED).length,
      tenantsUpdated: changes.filter(c => c.change_type === FMSChangeType.TENANT_UPDATED).length,
      unitsAdded: changes.filter(c => c.change_type === FMSChangeType.UNIT_ADDED).length,
      unitsRemoved: changes.filter(c => c.change_type === FMSChangeType.UNIT_REMOVED).length,
      unitsUpdated: changes.filter(c => c.change_type === FMSChangeType.UNIT_UPDATED).length,
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
  public async getSyncHistory(
    facilityId: string,
    options?: { limit?: number; offset?: number }
  ) {
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
  public async reviewChanges(
    changeIds: string[],
    accepted: boolean
  ): Promise<void> {
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
   * Dismiss pending changes from review (invalid payloads or failed applies).
   * When changeIds is omitted, all dismissible pending changes for the sync log are cleared.
   */
  public async dismissChanges(
    syncLogId: string,
    changeIds?: string[],
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
   * 
   * This notifies all subscribed clients when an FMS sync completes or fails
   */
  private broadcastFMSSyncUpdate(facilityId: string, webhookEvent?: FMSWebhookFeedItem): void {
    try {
      // Lazy import to avoid circular dependencies
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      const registry = wsService.getSubscriptionRegistry();
      
      if (registry) {
        const fmsSyncManager = registry.getFMSSyncManager();
        if (fmsSyncManager) {
          // Broadcast update asynchronously (don't block the sync operation)
          setImmediate(() => {
            fmsSyncManager.broadcastUpdate(facilityId, webhookEvent).catch((error: Error) => {
              logger.error('Failed to broadcast FMS sync update:', error);
            });
          });
        }
      }
    } catch (error) {
      // Log but don't throw - WebSocket broadcast failures shouldn't break FMS sync
      logger.error('Error initiating FMS sync broadcast:', error);
    }
  }
}

