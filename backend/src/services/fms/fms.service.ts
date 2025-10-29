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

import { BaseFMSProvider } from './base-fms-provider';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSChangeModel } from '@/models/fms-change.model';
import { FMSEntityMappingModel } from '@/models/fms-entity-mapping.model';
import { User, UserModel } from '@/models/user.model';
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
  FMSConfiguration,
} from '@/types/fms.types';
import { UserRole } from '@/types/auth.types';
import { logger } from '@/utils/logger';

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
      throw new Error('A sync operation is already running for this facility');
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

      // Step 1: Connect to FMS (min 2 seconds for UI visualization)
      logger.info(`[FMS] Connecting to ${config.provider_type} for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'connecting',
        percent: 5,
        message: 'Connecting to FMS provider',
      });
      checkCancelled();
      await new Promise(resolve => setTimeout(resolve, 2000));
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

      // Step 3: Detect changes (min 2 seconds for UI visualization)
      logger.info(`[FMS] Detecting changes for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'detecting',
        percent: 60,
        message: 'Detecting changes',
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      
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

      // Step 4: Prepare results (min 2 seconds for UI visualization)
      logger.info(`[FMS] Preparing results for facility ${facilityId}`);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 85,
        message: 'Preparing results',
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Progress: Updating sync log
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'preparing',
        percent: 92,
        message: 'Finalizing sync results',
      });

      // Update sync log with results
      await this.syncLogModel.update(syncLog.id, {
        changes_detected: changes.length,
        changes_pending: changes.length,
        sync_status: config.config.syncSettings.autoAcceptChanges 
          ? FMSSyncStatus.COMPLETED 
          : FMSSyncStatus.PENDING_REVIEW,
      });

      // Auto-accept and apply if configured
      if (config.config.syncSettings.autoAcceptChanges && changes.length > 0) {
        const applyResult = await this.applyChanges(
          syncLog.id,
          changes.map(c => c.id)
        );

        await this.syncLogModel.update(syncLog.id, {
          changes_applied: applyResult.changesApplied,
          sync_status: FMSSyncStatus.COMPLETED,
        });

        await this.syncLogModel.markCompleted(syncLog.id, {
          tenants_synced: fmsTenants.length,
          units_synced: fmsUnits.length,
          errors: applyResult.errors,
          warnings: [],
        });
      } else {
        await this.syncLogModel.markCompleted(syncLog.id, {
          tenants_synced: fmsTenants.length,
          units_synced: fmsUnits.length,
          errors: [],
          warnings: [],
        });
      }

      // Update config last sync time
      await this.fmsConfigModel.update(config.id, {
        last_sync_at: new Date(),
        last_sync_status: FMSSyncStatus.COMPLETED,
      });

      // Broadcast FMS sync status update via WebSocket
      this.broadcastFMSSyncUpdate(facilityId);
      this.broadcastFMSSyncProgress({
        facilityId,
        syncLogId: syncLog.id,
        step: 'complete',
        percent: 100,
        message: 'Sync complete',
      });

      return this.buildSyncResult(syncLog.id, changes);
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

      throw error;
    } finally {
      // Clean up active sync tracking
      this.activeSyncs.delete(facilityId);
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

    // Detect tenant changes (60% -> 70%)
    const tenantChanges = await this.detectTenantChanges(facilityId, fmsTenants, syncLogId, (progress: number) => {
      if (onProgress) {
        const percent = 60 + (progress / 100) * 10; // Map 0-100 to 60-70%
        onProgress(Math.round(percent), `Analyzing ${fmsTenants.length} tenants`);
      }
    });
    changes.push(...tenantChanges);

    // Detect unit changes (70% -> 78%)
    const unitChanges = await this.detectUnitChanges(facilityId, fmsUnits, syncLogId, userId, userRole, (progress: number) => {
      if (onProgress) {
        const percent = 70 + (progress / 100) * 8; // Map 0-100 to 70-78%
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
    syncLogId: string,
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];
    const total = fmsTenants.length;
    let processed = 0;

    // Get entity mappings for this facility
    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'user');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    // SECURITY: Get all existing TENANT users ONLY (never admin/maintenance)
    const existingUsers = await UserModel.findAll({ role: UserRole.TENANT });
    const usersByEmail = new Map(existingUsers.map((u: any) => [u.email.toLowerCase(), u]));
    const usersById = new Map(existingUsers.map((u: any) => [u.id, u]));

    for (const fmsTenant of fmsTenants) {
      // Log every tenant we process
      logger.info(`[FMS-TENANT] Processing tenant: externalId=${fmsTenant.externalId}, email="${fmsTenant.email}", firstName="${fmsTenant.firstName}", lastName="${fmsTenant.lastName}"`);
      
      // Validate tenant data
      const validationErrors: string[] = [];
      let isValid = true;

      // Check for required username/email (treated as username requirement)
      if (!fmsTenant.email || (typeof fmsTenant.email === 'string' && fmsTenant.email.trim() === '')) {
        validationErrors.push('Missing or empty username (email)');
        isValid = false;
      }

      // Check for required first name
      if (!fmsTenant.firstName || (typeof fmsTenant.firstName === 'string' && fmsTenant.firstName.trim() === '')) {
        validationErrors.push('Missing or empty first name');
        isValid = false;
      }

      // Check for required last name
      if (!fmsTenant.lastName || (typeof fmsTenant.lastName === 'string' && fmsTenant.lastName.trim() === '')) {
        validationErrors.push('Missing or empty last name');
        isValid = false;
      }

      if (!isValid) {
        logger.warn(`[FMS-TENANT-INVALID] Tenant ${fmsTenant.externalId} flagged as INVALID: errors=${JSON.stringify(validationErrors)}`);
      }

      const mapping = mappingsByExternalId.get(fmsTenant.externalId);
      const existingUser = mapping
        ? usersById.get(mapping.internal_id)
        : (fmsTenant.email ? usersByEmail.get(fmsTenant.email.toLowerCase()) : null);

      // Report progress every 10 items or at final item
      processed++;
      if (onProgress && (processed % 10 === 0 || processed === total)) {
        onProgress(Math.round((processed / total) * 100));
      }

      if (!existingUser) {
        // New tenant - needs to be added
        const changeData: any = {
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          after_data: fmsTenant,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ASSIGN_UNIT],
          impact_summary: `New tenant: ${fmsTenant.firstName || 'Unknown'} ${fmsTenant.lastName || 'Unknown'} (${fmsTenant.email || 'no email'}) - Will be added to ${fmsTenant.unitIds.length} unit(s)`,
          is_valid: isValid,
          validation_errors: validationErrors,
        };

        const change = await this.changeModel.create(changeData);
        logger.info(`[FMS-TENANT] Created TENANT_ADDED change: id=${change.id}, externalId=${fmsTenant.externalId}, is_valid=${change.is_valid}, errors=${JSON.stringify(change.validation_errors)}`);
        changes.push(change);
      } else {
        // Existing tenant - check for info changes
        const user = existingUser as any;

        // CRITICAL: If user exists but has no mapping, this is a data integrity issue that needs repair
        // This can happen if a user was created manually or if a previous sync failed to create the mapping
        if (!mapping) {
          logger.warn(`[FMS] User ${user.email} exists but has no FMS mapping. Creating mapping.`, {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            user_id: user.id,
            external_id: fmsTenant.externalId,
          });

          // Create the missing mapping immediately during detection
          // This is safe because it's a read-only operation from FMS perspective
          const config = await this.fmsConfigModel.findByFacilityId(facilityId);
          await this.entityMappingModel.ensureMapping({
            facility_id: facilityId,
            entity_type: 'user',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            provider_type: config?.provider_type || 'generic_rest',
            metadata: {
              email: fmsTenant.email,
              phone: fmsTenant.phone,
              leaseStartDate: fmsTenant.leaseStartDate,
              leaseEndDate: fmsTenant.leaseEndDate,
            },
          });

          // Now that mapping is created, set it for the rest of this iteration
          const newMapping = await this.entityMappingModel.findByExternalId(facilityId, 'user', fmsTenant.externalId);
          if (newMapping) {
            mappingsByExternalId.set(fmsTenant.externalId, newMapping);
          }
        }
        
        // Get phone from entity mapping metadata (since it's not in users table)
        let currentPhone: string | undefined;
        if (mapping) {
          currentPhone = mapping.metadata?.phone as string | undefined;
        }
        
        const hasInfoChanges = 
          user.first_name !== fmsTenant.firstName ||
          user.last_name !== fmsTenant.lastName ||
          currentPhone !== fmsTenant.phone;

        // Debug logging to trace tenant comparison
        if (hasInfoChanges) {
          logger.info(`[FMS] Tenant ${fmsTenant.email} has changes`, {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            has_mapping: !!mapping,
            changes: {
              firstName: { before: user.first_name, after: fmsTenant.firstName, changed: user.first_name !== fmsTenant.firstName },
              lastName: { before: user.last_name, after: fmsTenant.lastName, changed: user.last_name !== fmsTenant.lastName },
              phone: { before: currentPhone, after: fmsTenant.phone, changed: currentPhone !== fmsTenant.phone },
            },
          });
        }

        if (hasInfoChanges) {
          const changeData: any = {
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UPDATED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            before_data: {
              firstName: user.first_name,
              lastName: user.last_name,
              phone: currentPhone,
            },
            after_data: fmsTenant,
            required_actions: [FMSChangeAction.UPDATE_USER],
            impact_summary: `Updated tenant info for: ${fmsTenant.email || 'no email'}`,
            is_valid: isValid,
            validation_errors: validationErrors,
          };

          const change = await this.changeModel.create(changeData);
          changes.push(change);
        }

        // Check for unit assignment changes
        const unitChanges = await this.detectTenantUnitChanges(facilityId, user.id, fmsTenant, syncLogId);
        changes.push(...unitChanges);
      }
    }

    // Check for removed tenants (mapped in our system but not in FMS)
    const fmsTenantExtIds = new Set(fmsTenants.map(t => t.externalId));
    
    for (const mapping of existingMappings) {
      if (!fmsTenantExtIds.has(mapping.external_id)) {
        const user = usersById.get(mapping.internal_id) as any;
        if (user) {
          const change = await this.changeModel.create({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_REMOVED,
            entity_type: 'tenant',
            external_id: mapping.external_id,
            internal_id: mapping.internal_id,
            before_data: user,
            after_data: null,
            required_actions: [FMSChangeAction.REMOVE_ACCESS, FMSChangeAction.DEACTIVATE_USER],
            impact_summary: `Tenant removed: ${user.email} - Will be deactivated and access revoked from all units`,
          });
          changes.push(change);
        }
      }
    }

    return changes;
  }

  /**
   * Detect unit assignment changes for a tenant
   */
  private async detectTenantUnitChanges(
    facilityId: string,
    tenantId: string,
    fmsTenant: FMSTenant,
    syncLogId: string
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    // Get current unit assignments
    const currentAssignments = await this.unitAssignmentModel.findByTenantId(tenantId);
    const currentUnitIds = new Set(currentAssignments.map(a => a.unit_id));

    // Get unit mappings to convert FMS unit IDs to our unit IDs
    const fmsUnitMappings = await Promise.all(
      fmsTenant.unitIds.map(extId => 
        this.entityMappingModel.findByExternalId(facilityId, 'unit', extId)
      )
    );

    const fmsInternalUnitIds = new Set(
      fmsUnitMappings.filter(m => m !== null).map(m => m!.internal_id)
    );

    // Detect units to add
    for (const mapping of fmsUnitMappings) {
      if (mapping && !currentUnitIds.has(mapping.internal_id)) {
        const unit = await this.unitModel.findById(mapping.internal_id);
        
        // Validate unit exists and belongs to the correct facility
        if (!unit) {
          logger.warn(`[FMS] Skipping tenant-unit assignment: unit ${mapping.internal_id} not found`, {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            tenant_id: tenantId,
            external_unit_id: mapping.external_id,
            internal_unit_id: mapping.internal_id,
          });
          continue;
        }
        
        if (unit.facility_id !== facilityId) {
          logger.warn(`[FMS] Skipping tenant-unit assignment: unit ${mapping.internal_id} belongs to different facility`, {
            fms_sync: true,
            sync_log_id: syncLogId,
            expected_facility_id: facilityId,
            actual_facility_id: unit.facility_id,
            tenant_id: tenantId,
            unit_id: mapping.internal_id,
            unit_number: unit.unit_number,
          });
          continue;
        }
        
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          after_data: { action: 'assign_unit', unitId: mapping.internal_id, unitNumber: unit.unit_number },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary: `Assign ${fmsTenant.email} to unit ${unit.unit_number} - Gateway access will be granted`,
          is_valid: true,
        });
        changes.push(change);
      }
    }

    // Detect units to remove
    for (const assignment of currentAssignments) {
      if (!fmsInternalUnitIds.has(assignment.unit_id)) {
        const unit = await this.unitModel.findById(assignment.unit_id);
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          before_data: { action: 'unassign_unit', unitId: assignment.unit_id, unitNumber: unit?.unit_number },
          after_data: null,
          required_actions: [FMSChangeAction.UNASSIGN_UNIT, FMSChangeAction.REMOVE_ACCESS],
          impact_summary: `Remove ${fmsTenant.email} from unit ${unit?.unit_number || assignment.unit_id} - Gateway access will be revoked`,
          is_valid: true,
        });
        changes.push(change);
      }
    }

    return changes;
  }

  /**
   * Detect unit changes  
   */
  private async detectUnitChanges(
    facilityId: string,
    fmsUnits: FMSUnit[],
    syncLogId: string,
    userId?: string,
    userRole?: UserRole,
    onProgress?: (percent: number) => void
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];
    const total = fmsUnits.length;
    let processed = 0;

    // Get entity mappings for units
    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'unit');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    // Get all units for this facility using the actual requesting user's credentials
    // SECURITY: Use the user who initiated the sync, not hardcoded admin
    // If no user provided, default to admin for system-initiated syncs
    const effectiveUserId = userId || 'system';
    const effectiveUserRole = userRole || UserRole.ADMIN;
    
    const result = await this.unitModel.getUnitsListForUser(
      effectiveUserId,
      effectiveUserRole,
      { facility_id: facilityId, limit: 1000, offset: 0 }
    );
    const existingUnits = result.units || [];
    const unitsByNumber = new Map(existingUnits.map((u: any) => [u.unit_number, u]));
    const unitsById = new Map(existingUnits.map((u: any) => [u.id, u]));

    for (const fmsUnit of fmsUnits) {
      const mapping = mappingsByExternalId.get(fmsUnit.externalId);
      
      // If we have a mapping, validate that the unit it points to exists and belongs to this facility
      let existingUnit = mapping ? unitsById.get(mapping.internal_id) : null;
      
      logger.info(`[FMS] Checking unit ${fmsUnit.unitNumber}`, {
        fms_sync: true,
        sync_log_id: syncLogId,
        facility_id: facilityId,
        external_id: fmsUnit.externalId,
        has_mapping: !!mapping,
        mapping_internal_id: mapping?.internal_id,
        found_by_mapping: !!existingUnit,
        unit_count: unitsById.size,
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
        const numberMatch = (existingUnit as any).unit_number === fmsUnit.unitNumber;
        if (!numberMatch) {
          const correctUnit = unitsByNumber.get(fmsUnit.unitNumber);
          if (correctUnit) {
            logger.warn('[FMS] Mapping points to a different unit number. Repairing mapping.', {
              fms_sync: true,
              sync_log_id: syncLogId,
              facility_id: facilityId,
              external_id: fmsUnit.externalId,
              mapping_internal_id: mapping.internal_id,
              mapped_unit_number: (existingUnit as any).unit_number,
              expected_unit_number: fmsUnit.unitNumber,
              correct_internal_id: (correctUnit as any).id,
            });
            // Self-heal mapping in DB
            await this.entityMappingModel.updateInternalId(mapping.id, (correctUnit as any).id);
            // Update local state to reflect corrected mapping for this run
            existingUnit = correctUnit;
            mappingsByExternalId.set(fmsUnit.externalId, {
              ...mapping,
              internal_id: (correctUnit as any).id,
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
        // New unit - needs to be added
        logger.info(`[FMS] Detected new unit to add`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          unit_number: fmsUnit.unitNumber,
          external_id: fmsUnit.externalId,
          has_mapping: !!mapping,
          mapping_internal_id: mapping?.internal_id,
        });
        
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_ADDED,
          entity_type: 'unit',
          external_id: fmsUnit.externalId,
          after_data: fmsUnit,
          required_actions: [],
          impact_summary: `New unit: ${fmsUnit.unitNumber} - Will be added to facility`,
          is_valid: true,
        });
        changes.push(change);
      } else if (!mapping || mapping.internal_id !== (existingUnit as any).id) {
        // With the simplified approach, don't mutate or emit mapping-only changes during detection.
        const reason = !mapping ? 'no mapping' : 'stale mapping';
        logger.info(`[FMS] Unit ${fmsUnit.unitNumber} exists (${reason}), no detection-side repair`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          unit_id: (existingUnit as any).id,
          external_id: fmsUnit.externalId,
          mapping_internal_id: mapping?.internal_id,
        });
      } else {
        // Existing unit - check for changes
        // NOTE: We don't compare size_sqft because FMS gives us dimensional strings like "10x15"
        // but our database stores numeric square footage. We store FMS size in metadata instead.
        const unit = existingUnit as any;
        const hasChanges = 
          unit.status !== fmsUnit.status ||
          unit.unit_type !== fmsUnit.unitType;

        logger.info(`[FMS] Unit ${fmsUnit.unitNumber} change detection`, {
          fms_sync: true,
          sync_log_id: syncLogId,
          facility_id: facilityId,
          unit_id: unit.id,
          unit_status_in_db: unit.status,
          fms_status: fmsUnit.status,
          unit_type_in_db: unit.unit_type,
          fms_unit_type: fmsUnit.unitType,
          has_changes: hasChanges,
        });

        if (hasChanges) {
          logger.info(`[FMS] Unit ${fmsUnit.unitNumber} has data changes`, {
            fms_sync: true,
            sync_log_id: syncLogId,
            facility_id: facilityId,
            unit_id: unit.id,
            unit_status_in_db: unit.status,
            fms_status: fmsUnit.status,
            unit_type_in_db: unit.unit_type,
            fms_unit_type: fmsUnit.unitType,
            changes: {
              status: { before: unit.status, after: fmsUnit.status, changed: unit.status !== fmsUnit.status },
              unitType: { before: unit.unit_type, after: fmsUnit.unitType, changed: unit.unit_type !== fmsUnit.unitType },
            },
          });

          const change = await this.changeModel.create({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_UPDATED,
            entity_type: 'unit',
            external_id: fmsUnit.externalId,
            internal_id: unit.id,
            before_data: {
              status: unit.status,
              unitType: unit.unit_type,
            },
            after_data: fmsUnit,
            required_actions: [],
            impact_summary: `Update unit ${fmsUnit.unitNumber}`,
            is_valid: true,
          });
          changes.push(change);
        }
      }
    }

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
      accessChanges: {
        usersCreated: [],
        usersDeactivated: [],
        accessGranted: [],
        accessRevoked: [],
      },
    };

    // Get all changes to apply
    const allChanges = await Promise.all(
      changeIds.map(id => this.changeModel.findById(id))
    );

    // Sort changes by priority to ensure dependencies are handled correctly:
    // 1. Units first (UNIT_ADDED, UNIT_UPDATED) - must exist before assignments
    // 2. Tenants second (TENANT_ADDED, TENANT_UPDATED, TENANT_REMOVED) - must exist before assignments
    // 3. Tenant-unit assignments last (TENANT_UNIT_CHANGED) - requires both units and tenants to exist
    const changeTypePriority = {
      [FMSChangeType.UNIT_ADDED]: 1,
      [FMSChangeType.UNIT_UPDATED]: 1,
      [FMSChangeType.UNIT_REMOVED]: 1,
      [FMSChangeType.TENANT_ADDED]: 2,
      [FMSChangeType.TENANT_UPDATED]: 2,
      [FMSChangeType.TENANT_REMOVED]: 2,
      [FMSChangeType.TENANT_UNIT_CHANGED]: 3,
    };

    const changes = allChanges
      .filter(c => c !== null)
      .sort((a, b) => {
        const priorityA = changeTypePriority[a!.change_type] || 999;
        const priorityB = changeTypePriority[b!.change_type] || 999;
        return priorityA - priorityB;
      });

    logger.info(`[FMS] Applying ${changes.length} changes in dependency order`, {
      fms_sync: true,
      sync_log_id: syncLogId,
      order: changes.map(c => c!.change_type),
    });

    for (const change of changes) {
      if (!change) continue;

      try {
        await this.applyChange(change, result);
        await this.changeModel.markApplied(change.id);
        result.changesApplied++;
      } catch (error) {
        logger.error(`Failed to apply change ${change.id}:`, error);
        result.changesFailed++;
        result.errors.push(
          `Failed to apply ${change.change_type} for ${change.external_id}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    // Update sync log
    await this.syncLogModel.update(syncLogId, {
      changes_applied: result.changesApplied,
    });

    // Get facility ID from sync log to broadcast update
    const syncLog = await this.syncLogModel.findById(syncLogId);
    if (syncLog) {
      this.broadcastFMSSyncUpdate(syncLog.facility_id);
    }

    return result;
  }

  /**
   * Apply a single change
   */
  private async applyChange(
    change: FMSChange,
    result: FMSChangeApplicationResult
  ): Promise<void> {
    switch (change.change_type) {
      case FMSChangeType.TENANT_ADDED:
        await this.applyTenantAdded(change, result);
        break;

      case FMSChangeType.TENANT_REMOVED:
        await this.applyTenantRemoved(change, result);
        break;

      case FMSChangeType.TENANT_UPDATED:
        await this.applyTenantUpdated(change, result);
        break;

      case FMSChangeType.TENANT_UNIT_CHANGED:
        await this.applyTenantUnitChanged(change, result);
        break;

      case FMSChangeType.UNIT_ADDED:
        await this.applyUnitAdded(change, result);
        break;

      case FMSChangeType.UNIT_UPDATED:
        await this.applyUnitUpdated(change, result);
        break;

      default:
        logger.warn(`Unhandled change type: ${change.change_type}`);
    }
  }

  /**
   * Apply tenant added change
   * 
   * SECURITY: Only creates users with TENANT role. FMS never creates admin/maintenance users.
   */
  private async applyTenantAdded(
    change: FMSChange,
    result: FMSChangeApplicationResult
  ): Promise<void> {
    const tenantData = change.after_data as FMSTenant;
    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';
    const config = await this.fmsConfigModel.findByFacilityId(facilityId);

    // Determine preferred login identifier: email (preferred) or normalized phone
    const rawEmail = tenantData.email?.trim() || '';
    const rawPhone = tenantData.phone?.trim() || '';
    const preferredIdentifier = rawEmail ? rawEmail.toLowerCase() : (rawPhone ? rawPhone.replace(/[^\d+]/g, '') : '');

    // Check if user already exists by login identifier when available, fallback to email scan
    let existingUser: User | undefined;
    if (preferredIdentifier) {
      existingUser = await UserModel.findByLoginIdentifier(preferredIdentifier);
    }
    if (!existingUser && rawEmail) {
      const existingUsers = await UserModel.findAll({ role: UserRole.TENANT });
      existingUser = existingUsers.find((u: any) => (u.email || '').toLowerCase() === rawEmail.toLowerCase()) as any;
    }

    let user: User;
    if (existingUser) {
      // User already exists - just ensure they're associated with the facility and have a mapping
      logger.info(`[FMS] User ${tenantData.email} already exists. Ensuring facility association and mapping.`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        user_id: existingUser.id,
      });
      user = existingUser;

      // Ensure facility association
      await UserFacilityAssociationModel.addUserToFacility(user.id, facilityId);
    } else {
      // SECURITY: Create user with TENANT role ONLY (FMS never creates admin/maintenance)
      // Backfill fields: login_identifier and phone_number
      user = await UserModel.create({
        login_identifier: preferredIdentifier || (tenantData.email?.toLowerCase() || tenantData.externalId),
        email: rawEmail || null,
        phone_number: rawPhone || null,
        first_name: tenantData.firstName,
        last_name: tenantData.lastName,
        role: UserRole.TENANT, // ← ALWAYS TENANT, never admin/maintenance
        password_hash: '$2b$10$dummyhashforinvitationflow', // Temporary - should send invitation
        is_active: true,
        requires_password_reset: true,
      }) as any;

      // Trigger first-time invite notification
      try {
        const { FirstTimeUserService } = await import('@/services/first-time-user.service');
        await FirstTimeUserService.getInstance().sendInvite(user);
      } catch (e) {
        logger.warn(`[FMS] Failed to send first-time invite for user ${user.id}:`, e);
      }

    result.accessChanges.usersCreated.push(user.id);
    logger.info(`[FMS] Created tenant user: ${user.email} (${user.id}) by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });

    // Associate user with facility
    await UserFacilityAssociationModel.addUserToFacility(user.id, facilityId);
    }

    // Create or ensure FMS entity mapping (store phone in metadata since it's not in users table)
    // Check if mapping already exists to avoid duplicates
    const existingMapping = await this.entityMappingModel.findByExternalId(
      facilityId,
      'user',
      tenantData.externalId
    );

    if (!existingMapping) {
    await this.entityMappingModel.create({
      facility_id: facilityId,
      entity_type: 'user',
      external_id: tenantData.externalId,
      internal_id: user.id,
      provider_type: config?.provider_type || 'generic_rest',
      metadata: {
        email: tenantData.email,
        phone: tenantData.phone, // Store phone in metadata
        leaseStartDate: tenantData.leaseStartDate,
        leaseEndDate: tenantData.leaseEndDate,
      },
    });
    } else {
      logger.info(`[FMS] User entity mapping already exists for external_id ${tenantData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        existing_internal_id: existingMapping.internal_id,
        new_internal_id: user.id,
      });
    }

    // Assign to units using UnitsService (which will emit events)
    for (const externalUnitId of tenantData.unitIds) {
      const unitMapping = await this.entityMappingModel.findByExternalId(
        facilityId,
        'unit',
        externalUnitId
      );

      if (unitMapping) {
        // SECURITY: Validate unit belongs to this facility
        const unit = await this.unitModel.findById(unitMapping.internal_id);
        if (!unit || unit.facility_id !== facilityId) {
          logger.error(`Security violation: Unit ${unitMapping.internal_id} does not belong to facility ${facilityId}`);
          continue; // Skip this assignment
        }

        // Use UnitsService to assign tenant (it will emit events)
        await this.unitsService.assignTenant(
          unitMapping.internal_id,
          user.id,
          {
            accessType: 'full',
            isPrimary: true,
            performedBy,
            source: 'fms_sync',
            syncLogId: change.sync_log_id,
            notes: `FMS sync: ${tenantData.externalId}`,
          }
        );

        result.accessChanges.accessGranted.push({
          userId: user.id,
          unitId: unitMapping.internal_id,
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
  private async applyTenantRemoved(
    change: FMSChange,
    result: FMSChangeApplicationResult
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';

    // SECURITY: Verify this is a TENANT user (never remove admin/maintenance users)
    const user = await UserModel.findById(change.internal_id);
    if (!user) {
      throw new Error('User not found');
    }
    
    if ((user as any).role !== UserRole.TENANT) {
      logger.error(`[FMS] Security violation: Attempted to remove non-tenant user`, {
        user_id: change.internal_id,
        user_role: (user as any).role,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      throw new Error(`Security violation: FMS can only modify TENANT users, found ${(user as any).role}`);
    }

    // Get all unit assignments for this tenant
    const allAssignments = await this.unitAssignmentModel.findByTenantId(change.internal_id);

    // SECURITY: Only remove assignments for units in THIS facility
    const assignments = [];
    for (const assignment of allAssignments) {
      const unit = await this.unitModel.findById(assignment.unit_id);
      if (unit && unit.facility_id === facilityId) {
        assignments.push(assignment);
      }
    }

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

    // Only deactivate user if they have no other assignments (in other facilities)
    const remainingAssignments = allAssignments.length - assignments.length;
    if (remainingAssignments === 0) {
      await UserModel.deactivateUser(change.internal_id);
      result.accessChanges.usersDeactivated.push(change.internal_id);
      logger.info(`[FMS] Deactivated tenant user: ${change.internal_id}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        performed_by: performedBy,
      });
    } else {
      logger.info(`[FMS] Tenant user ${change.internal_id} not deactivated (has ${remainingAssignments} assignment(s) in other facilities)`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
      });
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
    _result: FMSChangeApplicationResult
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal user ID not found');
    }

    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';
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

    // SECURITY: Validate user is associated with this facility
    const userFacilities = await UserFacilityAssociationModel.getUserFacilityIds(change.internal_id);
    if (!userFacilities.includes(facilityId)) {
      throw new Error(`Security violation: User ${change.internal_id} is not associated with facility ${facilityId}`);
    }

    // Update user (phone is not in users table, store in entity mapping metadata)
    await UserModel.updateById(change.internal_id, {
      first_name: tenantData.firstName,
      last_name: tenantData.lastName,
    });

    // Update or create entity mapping for this tenant
    const config = await this.fmsConfigModel.findByFacilityId(facilityId);
    const mapping = await this.entityMappingModel.findByInternalId(
      facilityId,
      'user',
      change.internal_id
    );
    
    if (mapping) {
      // Update existing mapping metadata
      await this.entityMappingModel.updateMetadata(mapping.id, {
        ...mapping.metadata,
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
      },
    });
  }

  /**
   * Apply tenant unit assignment change (assign or unassign)
   */
  private async applyTenantUnitChanged(
    change: FMSChange,
    result: FMSChangeApplicationResult
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal tenant ID not found');
    }

    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';
    const actionData = (change.after_data || change.before_data) as any;

    if (change.after_data && actionData.action === 'assign_unit') {
      // Assign tenant to unit using UnitsService (which will emit events)
      const unitId = actionData.unitId;

      // SECURITY: Validate unit belongs to this facility
      const unit = await this.unitModel.findById(unitId);
      
      if (!unit) {
        logger.error(`[FMS] Unit ${unitId} not found in database`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          change_id: change.id,
          tenant_id: change.internal_id,
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
          tenant_id: change.internal_id,
          unit_id: unitId,
          unit_number: unit.unit_number,
        });
        throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
      }

      await this.unitsService.assignTenant(
        unitId,
        change.internal_id,
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
        userId: change.internal_id,
        unitId,
      });

    } else if (change.before_data && actionData.action === 'unassign_unit') {
      // Unassign tenant from unit using UnitsService (which will emit events)
      const unitId = actionData.unitId;

      // SECURITY: Validate unit belongs to this facility
      const unit = await this.unitModel.findById(unitId);
      if (!unit || unit.facility_id !== facilityId) {
        throw new Error(`Security violation: Unit ${unitId} does not belong to facility ${facilityId}`);
      }

      await this.unitsService.unassignTenant(
        unitId,
        change.internal_id,
        {
          performedBy,
          source: 'fms_sync',
          syncLogId: change.sync_log_id,
        }
      );

      result.accessChanges.accessRevoked.push({
        userId: change.internal_id,
        unitId,
      });
    }
  }

  /**
   * Apply unit added change
   */
  private async applyUnitAdded(
    change: FMSChange,
    _result: FMSChangeApplicationResult
  ): Promise<void> {
    const unitData = change.after_data as FMSUnit;
    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';

    // Get the user's role for proper authorization
    let userRole = UserRole.ADMIN; // Default fallback
    if (syncLog.triggered_by_user_id) {
      const triggeringUser = await UserModel.findById(syncLog.triggered_by_user_id);
      if (triggeringUser) {
        userRole = (triggeringUser as any).role;
      }
    }

    const config = await this.fmsConfigModel.findByFacilityId(facilityId);

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
        unit_id: (existingUnit as any).id,
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
        existing_unit_id: (existingUnit as any).id,
        existing_unit_number: (existingUnit as any).unit_number,
        existing_mapping: !!existingUnitMapping,
      });

      if (!existingUnitMapping) {
      // Create the FMS entity mapping for the existing unit
      await this.entityMappingModel.create({
        facility_id: facilityId,
        entity_type: 'unit',
        external_id: unitData.externalId,
        internal_id: (existingUnit as any).id,
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
          internal_id: (existingUnit as any).id,
        });
      } else {
        logger.info(`[FMS] Unit entity mapping already exists for external_id ${unitData.externalId}`, {
          fms_sync: true,
          sync_log_id: change.sync_log_id,
          facility_id: facilityId,
          existing_internal_id: existingUnitMapping.internal_id,
          expected_internal_id: (existingUnit as any).id,
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
   * Apply unit updated change
   */
  private async applyUnitUpdated(
    change: FMSChange,
    _result: FMSChangeApplicationResult
  ): Promise<void> {
    if (!change.internal_id) {
      throw new Error('Internal unit ID not found');
    }

    const unitData = change.after_data as FMSUnit;
    const syncLog = await this.syncLogModel.findById(change.sync_log_id);
    
    if (!syncLog) {
      throw new Error('Sync log not found');
    }

    const facilityId = syncLog.facility_id;
    const performedBy = syncLog.triggered_by_user_id || 'fms-system';

    // SECURITY: Validate unit belongs to this facility
    const unit = await this.unitModel.findById(change.internal_id);
    if (!unit) {
      throw new Error(`Unit ${change.internal_id} not found`);
    }
    
    if (unit.facility_id !== facilityId) {
      logger.error(`[FMS] Security violation: Attempted to update unit from different facility`, {
        unit_id: change.internal_id,
        unit_facility_id: unit.facility_id,
        sync_facility_id: facilityId,
        sync_log_id: change.sync_log_id,
      });
      throw new Error(`Security violation: Unit ${change.internal_id} does not belong to facility ${facilityId}`);
    }

    // Get the user's role for proper authorization
    let userRole = UserRole.ADMIN; // Default fallback
    if (syncLog.triggered_by_user_id) {
      const triggeringUser = await UserModel.findById(syncLog.triggered_by_user_id);
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
      change.internal_id
    );

    // If mapping by external_id exists but points to wrong internal_id (stale), delete it
    if (mappingByExternalId && mappingByExternalId.internal_id !== change.internal_id) {
      logger.info(`[FMS] Deleting stale mapping for external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        old_internal_id: mappingByExternalId.internal_id,
        new_internal_id: change.internal_id,
      });
      
      await this.entityMappingModel.delete(mappingByExternalId.id);
    }

    // If no correct mapping exists, create one
    if (!mappingByInternalId || mappingByInternalId.external_id !== unitData.externalId) {
      logger.info(`[FMS] Creating/updating FMS entity mapping for unit ${change.internal_id}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        external_id: unitData.externalId,
        is_update: !!mappingByInternalId,
      });

      // Double-check mapping doesn't exist before creating (safety check)
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
        internal_id: change.internal_id,
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
          expected_internal_id: change.internal_id,
        });
      }

      logger.info(`[FMS] Linked unit ${change.internal_id} to FMS external_id ${unitData.externalId}`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
      });
      return;
    }

    // Otherwise, this is a real update - modify the unit data
    // NOTE: We don't update size_sqft from FMS since FMS provides dimensional strings like "10x15"
    // but our database expects numeric square footage. Store dimensional size in metadata instead.

    logger.info(`[FMS] Updating unit ${change.internal_id} status from DB to FMS value`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      unit_id: change.internal_id,
      before_status: change.before_data?.status || 'unknown',
      new_status: unitData.status,
      unit_number: unitData.unitNumber,
    });

    try {
      const updateResult = await this.unitsService.updateUnit(
      change.internal_id,
      {
        unit_type: unitData.unitType,
        // size_sqft: not updated from FMS - it's a DECIMAL column but FMS gives us strings like "10x15"
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_size: unitData.size, // Store dimensional size string here
          fms_custom_fields: unitData.customFields,
          last_fms_sync: new Date(),
        },
      },
      performedBy, // Use the user who triggered the sync
        userRole // Use the actual user's role for proper authorization
      );

      logger.info(`[FMS] Unit ${change.internal_id} updated successfully`, {
        fms_sync: true,
        sync_log_id: change.sync_log_id,
        facility_id: facilityId,
        before_status: change.before_data?.status || 'unknown',
        after_status: unitData.status,
        update_result_status: updateResult.status,
      });

      _result.changesApplied++;
    } catch (updateError) {
      logger.error(`[FMS] Failed to update unit ${change.internal_id}:`, updateError);
      _result.changesFailed++;
      _result.errors.push(`Unit update failed for ${change.external_id}: ${(updateError as Error).message}`);
      return;
    }

    logger.info(`[FMS] Updated unit ${change.internal_id} by ${performedBy}: status=${unitData.status}, type=${unitData.unitType}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
    });
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
      requiresReview: !syncLog.sync_summary || changes.some(c => !c.is_reviewed),
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
  }

  /**
   * Broadcast FMS sync status update via WebSocket
   * 
   * This notifies all subscribed clients when an FMS sync completes or fails
   */
  private broadcastFMSSyncUpdate(facilityId: string): void {
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
            fmsSyncManager.broadcastUpdate(facilityId).catch((error: Error) => {
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

