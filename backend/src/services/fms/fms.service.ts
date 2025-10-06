/**
 * FMS Service
 * 
 * Orchestrates FMS sync operations, change detection, and provider management
 */

import { BaseFMSProvider } from './base-fms-provider';
import { FMSConfigurationModel } from '@/models/fms-configuration.model';
import { FMSSyncLogModel } from '@/models/fms-sync-log.model';
import { FMSChangeModel } from '@/models/fms-change.model';
import { FMSEntityMappingModel } from '@/models/fms-entity-mapping.model';
import { UserModel } from '@/models/user.model';
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

export class FMSService {
  private static instance: FMSService;
  private fmsConfigModel: FMSConfigurationModel;
  private syncLogModel: FMSSyncLogModel;
  private changeModel: FMSChangeModel;
  private entityMappingModel: FMSEntityMappingModel;
  private unitModel: UnitModel;
  private unitsService: UnitsService;
  private unitAssignmentModel: UnitAssignmentModel;
  private providerRegistry: Map<FMSProviderType, typeof BaseFMSProvider>;

  private constructor() {
    this.fmsConfigModel = new FMSConfigurationModel();
    this.syncLogModel = new FMSSyncLogModel();
    this.changeModel = new FMSChangeModel();
    this.entityMappingModel = new FMSEntityMappingModel();
    this.unitModel = new UnitModel();
    this.unitsService = UnitsService.getInstance();
    this.unitAssignmentModel = new UnitAssignmentModel();
    this.providerRegistry = new Map();
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

    // Create sync log
    const syncLog = await this.syncLogModel.create({
      facility_id: facilityId,
      fms_config_id: config.id,
      triggered_by: 'manual',
      ...(userId ? { triggered_by_user_id: userId } : {}),
    });

    try {
      logger.info(`[FMS] Starting sync for facility ${facilityId}`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        triggered_by: userId || 'system',
        facility_id: facilityId,
      });

      // Step 1: Connect to FMS (min 2 seconds for UI visualization)
      logger.info(`[FMS] Connecting to ${config.provider_type} for facility ${facilityId}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const provider = this.getProvider(facilityId, config);

      // Step 2: Fetch data from FMS (providers have their own throttling)
      logger.info(`[FMS] Fetching data from ${config.provider_type} for facility ${facilityId}`);
      
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

      logger.info(`[FMS] Fetched ${fmsTenants.length} tenants and ${fmsUnits.length} units from FMS`, {
        fms_sync: true,
        sync_log_id: syncLog.id,
        facility_id: facilityId,
      });

      // Step 3: Detect changes (min 2 seconds for UI visualization)
      logger.info(`[FMS] Detecting changes for facility ${facilityId}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const changes = await this.detectChanges(facilityId, fmsTenants, fmsUnits, syncLog.id);

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
      await new Promise(resolve => setTimeout(resolve, 2000));

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

      throw error;
    }
  }

  /**
   * Detect changes between FMS and our system
   */
  private async detectChanges(
    facilityId: string,
    fmsTenants: FMSTenant[],
    fmsUnits: FMSUnit[],
    syncLogId: string
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    // Detect tenant changes
    const tenantChanges = await this.detectTenantChanges(facilityId, fmsTenants, syncLogId);
    changes.push(...tenantChanges);

    // Detect unit changes
    const unitChanges = await this.detectUnitChanges(facilityId, fmsUnits, syncLogId);
    changes.push(...unitChanges);

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
    syncLogId: string
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    // Get entity mappings for this facility
    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'user');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    // SECURITY: Get all existing TENANT users ONLY (never admin/maintenance)
    const existingUsers = await UserModel.findAll({ role: UserRole.TENANT });
    const usersByEmail = new Map(existingUsers.map((u: any) => [u.email.toLowerCase(), u]));
    const usersById = new Map(existingUsers.map((u: any) => [u.id, u]));

    for (const fmsTenant of fmsTenants) {
      const mapping = mappingsByExternalId.get(fmsTenant.externalId);
      const existingUser = mapping ? usersById.get(mapping.internal_id) : usersByEmail.get(fmsTenant.email.toLowerCase());

      if (!existingUser) {
        // New tenant - needs to be added
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_ADDED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          after_data: fmsTenant,
          required_actions: [FMSChangeAction.CREATE_USER, FMSChangeAction.ASSIGN_UNIT],
          impact_summary: `New tenant: ${fmsTenant.firstName} ${fmsTenant.lastName} (${fmsTenant.email}) - Will be added to ${fmsTenant.unitIds.length} unit(s)`,
        });
        changes.push(change);
      } else {
        // Existing tenant - check for info changes
        const user = existingUser as any;
        const hasInfoChanges = 
          user.first_name !== fmsTenant.firstName ||
          user.last_name !== fmsTenant.lastName ||
          user.phone !== fmsTenant.phone;

        if (hasInfoChanges) {
          const change = await this.changeModel.create({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.TENANT_UPDATED,
            entity_type: 'tenant',
            external_id: fmsTenant.externalId,
            internal_id: user.id,
            before_data: {
              firstName: user.first_name,
              lastName: user.last_name,
              phone: user.phone,
            },
            after_data: fmsTenant,
            required_actions: [FMSChangeAction.UPDATE_USER],
            impact_summary: `Updated tenant info for: ${fmsTenant.email}`,
          });
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
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.TENANT_UNIT_CHANGED,
          entity_type: 'tenant',
          external_id: fmsTenant.externalId,
          internal_id: tenantId,
          after_data: { action: 'assign_unit', unitId: mapping.internal_id, unitNumber: unit?.unit_number },
          required_actions: [FMSChangeAction.ASSIGN_UNIT, FMSChangeAction.ADD_ACCESS],
          impact_summary: `Assign ${fmsTenant.email} to unit ${unit?.unit_number || mapping.internal_id} - Gateway access will be granted`,
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
    syncLogId: string
  ): Promise<FMSChange[]> {
    const changes: FMSChange[] = [];

    // Get entity mappings for units
    const existingMappings = await this.entityMappingModel.findByFacility(facilityId, 'unit');
    const mappingsByExternalId = new Map(existingMappings.map(m => [m.external_id, m]));

    // Get all units for this facility using the model
    const result = await this.unitModel.getUnitsListForUser(
      'admin', // Use admin role to get all units
      UserRole.ADMIN,
      { facility_id: facilityId, limit: 1000, offset: 0 }
    );
    const existingUnits = result.units || [];
    const unitsByNumber = new Map(existingUnits.map((u: any) => [u.unit_number, u]));
    const unitsById = new Map(existingUnits.map((u: any) => [u.id, u]));

    for (const fmsUnit of fmsUnits) {
      const mapping = mappingsByExternalId.get(fmsUnit.externalId);
      const existingUnit = mapping ? unitsById.get(mapping.internal_id) : unitsByNumber.get(fmsUnit.unitNumber);

      if (!existingUnit) {
        // New unit - needs to be added
        const change = await this.changeModel.create({
          sync_log_id: syncLogId,
          change_type: FMSChangeType.UNIT_ADDED,
          entity_type: 'unit',
          external_id: fmsUnit.externalId,
          after_data: fmsUnit,
          required_actions: [],
          impact_summary: `New unit: ${fmsUnit.unitNumber} - Will be added to facility`,
        });
        changes.push(change);
      } else {
        // Existing unit - check for changes
        const unit = existingUnit as any;
        const hasChanges = 
          unit.status !== fmsUnit.status ||
          unit.unit_type !== fmsUnit.unitType ||
          unit.size !== fmsUnit.size;

        if (hasChanges) {
          const change = await this.changeModel.create({
            sync_log_id: syncLogId,
            change_type: FMSChangeType.UNIT_UPDATED,
            entity_type: 'unit',
            external_id: fmsUnit.externalId,
            internal_id: unit.id,
            before_data: {
              status: unit.status,
              unitType: unit.unit_type,
              size: unit.size,
            },
            after_data: fmsUnit,
            required_actions: [],
            impact_summary: `Updated unit info for: ${fmsUnit.unitNumber}`,
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
    const changes = await Promise.all(
      changeIds.map(id => this.changeModel.findById(id))
    );

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

    // SECURITY: Create user with TENANT role ONLY (FMS never creates admin/maintenance)
    const user = await UserModel.create({
      email: tenantData.email,
      first_name: tenantData.firstName,
      last_name: tenantData.lastName,
      phone: tenantData.phone,
      role: UserRole.TENANT, // ← ALWAYS TENANT, never admin/maintenance
      password_hash: '$2b$10$dummyhashforinvitationflow', // Temporary - should send invitation
      is_active: true,
    }) as any;

    result.accessChanges.usersCreated.push(user.id);
    logger.info(`[FMS] Created tenant user: ${user.email} (${user.id}) by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
    });

    // Associate user with facility
    await UserFacilityAssociationModel.addUserToFacility(user.id, facilityId);

    // Create FMS entity mapping
    await this.entityMappingModel.create({
      facility_id: facilityId,
      entity_type: 'user',
      external_id: tenantData.externalId,
      internal_id: user.id,
      provider_type: config?.provider_type || 'generic_rest',
      metadata: {
        email: tenantData.email,
        leaseStartDate: tenantData.leaseStartDate,
        leaseEndDate: tenantData.leaseEndDate,
      },
    });

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

    await UserModel.updateById(change.internal_id, {
      first_name: tenantData.firstName,
      last_name: tenantData.lastName,
      phone: tenantData.phone,
    });

    logger.info(`[FMS] Updated tenant user: ${change.internal_id} by ${performedBy}`, {
      fms_sync: true,
      sync_log_id: change.sync_log_id,
      facility_id: facilityId,
      changes: {
        firstName: tenantData.firstName,
        lastName: tenantData.lastName,
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
      if (!unit || unit.facility_id !== facilityId) {
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
    const config = await this.fmsConfigModel.findByFacilityId(facilityId);

    // Create unit using UnitsService with ADMIN role (FMS sync is privileged operation)
    const newUnit = await this.unitsService.createUnit(
      {
        facility_id: facilityId,
        unit_number: unitData.unitNumber,
        unit_type: unitData.unitType || 'storage',
        size: unitData.size,
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_custom_fields: unitData.customFields,
        },
      },
      performedBy, // Use the user who triggered the sync
      UserRole.ADMIN // FMS sync operates with admin privileges
    );

    // Create FMS entity mapping
    await this.entityMappingModel.create({
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

    const performedBy = syncLog.triggered_by_user_id || 'fms-system';

    // Update unit using UnitsService with ADMIN role (FMS sync is privileged operation)
    await this.unitsService.updateUnit(
      change.internal_id,
      {
        unit_type: unitData.unitType,
        size: unitData.size,
        status: unitData.status,
        monthly_rate: unitData.monthlyRate,
        metadata: {
          fms_synced: true,
          fms_external_id: unitData.externalId,
          fms_custom_fields: unitData.customFields,
          last_fms_sync: new Date(),
        },
      },
      performedBy, // Use the user who triggered the sync
      UserRole.ADMIN // FMS sync operates with admin privileges
    );

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

