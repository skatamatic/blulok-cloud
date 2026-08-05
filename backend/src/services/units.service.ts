import { UserRole } from '@/types/auth.types';
import { DeviceModel } from '@/models/device.model';
import { DatabaseService } from '@/services/database.service';
import { UnitModel, UnitAssignment } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitAssignmentEventsService } from './events/unit-assignment-events.service';
import { NotificationService } from '@/services/notification.service';
import { ActivityService } from '@/services/activity.service';
import { DeviceGroupService } from '@/services/device-group.service';
import { logger } from '@/utils/logger';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';

/**
 * Units Service
 *
 * Comprehensive service for managing rental units, tenant assignments, and access control.
 * Handles the complete unit lifecycle from creation to decommissioning.
 *
 * Key Features:
 * - Role-based unit access control and filtering
 * - Real-time unit locking/unlocking operations
 * - Tenant assignment management with event tracking
 * - Facility-scoped unit operations
 * - Integration with access control and monitoring systems
 *
 * Unit Operations:
 * - CRUD operations for unit management
 * - Lock/unlock operations with device integration
 * - Tenant assignment and unassignment
 * - Unit status and maintenance tracking
 * - Occupancy and availability reporting
 *
 * Security Model:
 * - Facility-scoped access control
 * - Role-based permissions (TENANT, FACILITY_ADMIN, ADMIN)
 * - Audit logging for all operations
 * - Event-driven access revocation
 */
export class UnitsService {
  private static instance: UnitsService;
  private unitModel: UnitModel;
  private unitAssignmentModel: UnitAssignmentModel;
  private eventService: UnitAssignmentEventsService;
  private deviceModel: DeviceModel;

  private constructor() {
    this.unitModel = new UnitModel();
    this.unitAssignmentModel = new UnitAssignmentModel();
    this.eventService = UnitAssignmentEventsService.getInstance();
    this.deviceModel = new DeviceModel();
  }

  public static getInstance(): UnitsService {
    if (!UnitsService.instance) {
      UnitsService.instance = new UnitsService();
    }
    return UnitsService.instance;
  }

  /**
   * Get units for a user (supports both widget and management page)
   */
  async getUnits(userId: string, userRole: UserRole, filters: any = {}): Promise<{ units: any[]; total: number }> {
    try {
      const result = await this.unitModel.getUnitsListForUser(userId, userRole, filters);
      const enricher = DeviceReachabilityEnrichmentService.getInstance();
      const enrichedUnits = await enricher.enrichUnitList(result.units);
      return { units: enrichedUnits, total: result.total };
    } catch (error) {
      logger.error('Error getting units:', error);
      throw error;
    }
  }

  /**
   * Lock a unit
   */
  async lockUnit(unitId: string, userId: string): Promise<boolean> {
    try {
      return await this.unitModel.lockUnit(unitId, userId);
    } catch (error) {
      logger.error('Error locking unit:', error);
      throw error;
    }
  }

  /**
   * Get unit assignments for a user
   */
  async getUnitAssignments(userId: string, userRole: UserRole): Promise<UnitAssignment[]> {
    try {
      return await this.unitModel.getUnitAssignmentsForUser(userId, userRole);
    } catch (error) {
      logger.error('Error getting unit assignments:', error);
      throw error;
    }
  }

  /**
   * Get unit details by ID
   */
  async getUnitDetails(unitId: string, userId: string, userRole: UserRole): Promise<any> {
    try {
      // First check if unit exists (to distinguish between 404 and 403)
      const unitExists = await this.unitModel.findById(unitId);
      if (!unitExists) {
        return null; // Unit doesn't exist - 404
      }
      
      // Unit exists, now check if user has access
      const result = await this.unitModel.getUnitDetailsForUser(unitId, userId, userRole);
      if (!result) {
        // Unit exists but user doesn't have access - throw for 403
        throw new Error('Access denied');
      }

      const enricher = DeviceReachabilityEnrichmentService.getInstance();
      const cache = await enricher.createLivenessCache();
      return enricher.enrichUnitRow(result, cache);
    } catch (error) {
      logger.error('Error getting unit details:', error);
      throw error;
    }
  }

  /**
   * Check if a user has access to a specific unit
   */
  async hasUserAccessToUnit(unitId: string, userId: string, userRole: UserRole): Promise<boolean> {
    try {
      return await this.unitModel.hasUserAccessToUnit(unitId, userId, userRole);
    } catch (error: any) {
      // Let "Unit not found" errors bubble up so routes can return 404
      if (error.message === 'Unit not found') {
        throw error;
      }
      logger.error('Error checking user access to unit:', error);
      return false; // Fail safe - deny access on other errors
    }
  }

  /**
   * Create a new unit
   */
  async createUnit(unitData: any, userId: string, userRole: UserRole): Promise<any> {
    try {
      const unit = await this.unitModel.createUnit(unitData, userId, userRole);
      try {
        await DeviceGroupService.getInstance().assignUnitToDefaultGroup(
          String(unit.facility_id),
          String(unit.id),
        );
      } catch (groupErr) {
        logger.warn('Failed to assign new unit to default access group (non-fatal):', groupErr);
      }
      return unit;
    } catch (error) {
      logger.error('Error creating unit:', error);
      throw error;
    }
  }

  /**
   * Update an existing unit
   */
  async updateUnit(unitId: string, updateData: any, userId: string, userRole: UserRole): Promise<any> {
    try {
      const unit = await this.unitModel.updateUnit(unitId, updateData, userId, userRole);
      if (unit?.id && unit?.facility_id) {
        this.notifyDashboardUnitChanged({ id: unit.id, facility_id: unit.facility_id });
      } else {
        const existing = await this.unitModel.findById(unitId);
        if (existing) {
          this.notifyDashboardUnitChanged(existing);
        }
      }
      return unit;
    } catch (error) {
      logger.error('Error updating unit:', error);
      throw error;
    }
  }

  /**
   * Set or clear manual/FMS overlock flag on an occupied unit.
   */
  async setUnitOverlock(
    unitId: string,
    isOverlocked: boolean,
    userId: string,
    userRole: UserRole
  ): Promise<any> {
    const hasAccess = await this.hasUserAccessToUnit(unitId, userId, userRole);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have permission to update this unit');
    }

    const unit = await this.unitModel.findById(unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }

    const assignments = await this.unitAssignmentModel.findByUnitId(unitId);
    if (isOverlocked && assignments.length === 0) {
      throw new Error('Cannot overlock a vacant unit');
    }

    await this.unitModel.setOverlockStatus(unitId, isOverlocked);
    this.notifyDashboardUnitChanged(unit);
    const result = await this.unitModel.getUnitDetailsForUser(unitId, userId, userRole);
    if (!result) {
      throw new Error('Failed to load unit after overlock update');
    }
    const enricher = DeviceReachabilityEnrichmentService.getInstance();
    const cache = await enricher.createLivenessCache();
    return enricher.enrichUnitRow(result, cache);
  }

  /**
   * Assign a tenant to a unit
   */
  async assignTenant(
    unitId: string,
    tenantId: string,
    options: {
      accessType?: string;
      isPrimary?: boolean;
      expiresAt?: Date;
      notes?: string;
      performedBy: string;
      source?: 'manual' | 'fms_sync' | 'api';
      syncLogId?: string;
    }
  ): Promise<void> {
    try {
      // Get unit details to check facility
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      // Explicit primary assignment should always converge to a single primary tenant.
      if (options.isPrimary === true) {
        const primaryMutation = await this.unitAssignmentModel.assignPrimaryAtomically({
          unit_id: unitId,
          tenant_id: tenantId,
          access_type: options.accessType as any,
          expires_at: options.expiresAt,
          notes: options.notes,
        });

        for (const removedPrimary of primaryMutation.removedPrimaryAssignments) {
          const unassignMetadata: any = {
            source: options.source || 'api',
            performedBy: options.performedBy,
          };
          if (options.syncLogId) unassignMetadata.syncLogId = options.syncLogId;

          this.eventService.emitTenantUnassigned({
            unitId,
            facilityId: unit.facility_id,
            tenantId: removedPrimary.tenant_id,
            accessType: removedPrimary.access_type,
            metadata: unassignMetadata,
          });

          this.logUnassignmentSideEffects(
            unitId,
            unit.facility_id,
            unit.unit_number,
            removedPrimary.tenant_id,
            options.performedBy,
            options.source || 'api'
          ).catch(err => logger.error('Failed to log primary replacement side effects:', err));
        }

        if (primaryMutation.assigned === 'unchanged') {
          logger.info(`Primary tenant assignment is already current for unit ${unitId}`, {
            tenantId,
            source: options.source || 'api',
            replacedPrimaryCount: primaryMutation.removedPrimaryAssignments.length,
          });
          await this.unitModel.syncUnitOccupancyStatusFromAssignments(unitId);
          this.notifyDashboardUnitChanged(unit);
          return;
        }

        const eventMetadata: any = {
          source: options.source || 'api',
          performedBy: options.performedBy,
        };
        if (options.syncLogId) eventMetadata.syncLogId = options.syncLogId;

        this.eventService.emitTenantAssigned({
          unitId,
          facilityId: unit.facility_id,
          tenantId,
          accessType: primaryMutation.assignedAccessType,
          metadata: eventMetadata,
        });

        logger.info(`Primary tenant ${tenantId} set for unit ${unitId} by ${options.performedBy}`, {
          source: options.source || 'api',
          facilityId: unit.facility_id,
          replacedPrimaryCount: primaryMutation.removedPrimaryAssignments.length,
        });

        this.logAssignmentSideEffects(
          unitId, unit.facility_id, unit.unit_number, tenantId,
          options.performedBy, options.source || 'api'
        ).catch(err => logger.error('Failed to log assignment side effects:', err));

        await this.unitModel.syncUnitOccupancyStatusFromAssignments(unitId);
        this.notifyDashboardUnitChanged(unit);
        return;
      }

      // Check if assignment already exists
      const existing = await this.unitAssignmentModel.findByUnitAndTenant(unitId, tenantId);
      if (existing) {
        logger.warn(`Assignment already exists for tenant ${tenantId} to unit ${unitId}`);
        await this.unitModel.syncUnitOccupancyStatusFromAssignments(unitId);
        this.notifyDashboardUnitChanged(unit);
        return;
      }

      // Check shared access limit (max 4 non-primary assignments)
      if (!options.isPrimary) {
        const assignments = await this.unitAssignmentModel.findByUnitId(unitId);
        const sharedCount = assignments.filter(a => !a.is_primary).length;
        
        if (sharedCount >= 4) {
          throw new Error('Maximum shared access limit reached (4 tenants). Remove a tenant to add another.');
        }
      }

      // Create assignment
      const assignmentData: any = {
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: options.accessType || 'full',
        is_primary: options.isPrimary ?? true,
      };
      if (options.expiresAt) assignmentData.expires_at = options.expiresAt;
      if (options.notes) assignmentData.notes = options.notes;

      await this.unitAssignmentModel.create(assignmentData);
      await this.unitModel.syncUnitOccupancyStatusFromAssignments(unitId);

      // Emit event for gateway/hardware updates
      const eventMetadata: any = {
        source: options.source || 'api',
        performedBy: options.performedBy,
      };
      if (options.syncLogId) eventMetadata.syncLogId = options.syncLogId;

      this.eventService.emitTenantAssigned({
        unitId,
        facilityId: unit.facility_id,
        tenantId,
        accessType: options.accessType || 'full',
        metadata: eventMetadata,
      });

      logger.info(`Tenant ${tenantId} assigned to unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId: unit.facility_id,
      });

      // Fire-and-forget: Create notification and activity log for the assignment
      this.logAssignmentSideEffects(
        unitId, unit.facility_id, unit.unit_number, tenantId,
        options.performedBy, options.source || 'api'
      ).catch(err => logger.error('Failed to log assignment side effects:', err));

      this.notifyDashboardUnitChanged(unit);
    } catch (error) {
      logger.error('Error assigning tenant to unit:', error);
      throw error;
    }
  }

  /**
   * Bulk assign a tenant to multiple units.
   * PERFORMANCE: Validates all units in one query and performs bulk insert.
   * 
   * @param tenantId - Tenant to assign
   * @param unitIds - Array of unit IDs to assign to
   * @param options - Assignment options
   * @returns Object with counts of successful and failed assignments
   */
  async bulkAssignTenant(
    tenantId: string,
    unitIds: string[],
    options: {
      accessType?: string;
      isPrimary?: boolean;
      performedBy: string;
      source?: 'manual' | 'fms_sync' | 'api';
      syncLogId?: string;
      notes?: string;
    }
  ): Promise<{ assigned: number; skipped: number; errors: string[] }> {
    const result = { assigned: 0, skipped: 0, errors: [] as string[] };
    
    if (unitIds.length === 0) return result;

    try {
      const unitsList = await this.unitModel.findByIds(unitIds);
      const unitsById = new Map(unitsList.map((u) => [u.id, u]));

      // PERFORMANCE FIX: Pre-fetch all existing assignments for this tenant
      const existingAssignments = await this.unitAssignmentModel.findByTenantId(tenantId);
      const existingUnitIds = new Set(existingAssignments.map(a => a.unit_id));

      // Filter units: only assign to valid units that don't already have assignment
      const assignmentsToCreate: Array<{
        unit_id: string;
        tenant_id: string;
        access_type: string;
        is_primary: boolean;
        notes?: string;
      }> = [];

      for (const unitId of unitIds) {
        // Skip if assignment already exists
        if (existingUnitIds.has(unitId)) {
          result.skipped++;
          continue;
        }

        const unit = unitsById.get(unitId);
        if (!unit) {
          result.errors.push(`Unit ${unitId} not found`);
          continue;
        }

        assignmentsToCreate.push({
          unit_id: unitId,
          tenant_id: tenantId,
          access_type: options.accessType || 'full',
          is_primary: options.isPrimary ?? true,
          notes: options.notes,
        });
      }

      // Bulk create assignments
      if (assignmentsToCreate.length > 0) {
        // Use Promise.allSettled for parallel creation with event emission
        const createPromises = assignmentsToCreate.map(async (data) => {
          try {
            await this.unitAssignmentModel.create(data);
            await this.unitModel.syncUnitOccupancyStatusFromAssignments(data.unit_id);

            // Emit event for each assignment
            const unit = unitsById.get(data.unit_id);
            if (unit) {
              const eventMetadata: any = {
                source: options.source || 'api',
                performedBy: options.performedBy,
              };
              if (options.syncLogId) eventMetadata.syncLogId = options.syncLogId;

              this.eventService.emitTenantAssigned({
                unitId: data.unit_id,
                facilityId: unit.facility_id,
                tenantId,
                accessType: data.access_type,
                metadata: eventMetadata,
              });
            }
            return { success: true, unitId: data.unit_id };
          } catch (error: any) {
            return { success: false, unitId: data.unit_id, error: error.message };
          }
        });

        const results = await Promise.allSettled(createPromises);
        for (const res of results) {
          if (res.status === 'fulfilled') {
            if (res.value.success) {
              result.assigned++;
            } else {
              result.errors.push(`Failed to assign unit ${res.value.unitId}: ${res.value.error}`);
            }
          } else {
            result.errors.push(`Assignment failed: ${res.reason}`);
          }
        }
      }

      logger.info(`Bulk assigned tenant ${tenantId} to ${result.assigned} units`, {
        source: options.source || 'api',
        skipped: result.skipped,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      logger.error('Error in bulk assign tenant:', error);
      throw error;
    }
  }

  /**
   * Unassign a tenant from a unit
   */
  async unassignTenant(
    unitId: string,
    tenantId: string,
    options: {
      performedBy: string;
      source?: 'manual' | 'fms_sync' | 'api';
      syncLogId?: string;
    }
  ): Promise<void> {
    try {
      // Get unit details to check facility
      const unit = await this.unitModel.findById(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      // Get assignment details before deleting
      const assignment = await this.unitAssignmentModel.findByUnitAndTenant(unitId, tenantId);
      if (!assignment) {
        logger.warn(`No assignment found for tenant ${tenantId} on unit ${unitId}`);
        return;
      }

      // Delete assignment
      await this.unitAssignmentModel.deleteByUnitAndTenant(unitId, tenantId);
      await this.unitModel.syncUnitOccupancyStatusFromAssignments(unitId);

      // Emit event for gateway/hardware updates
      const eventMetadata: any = {
        source: options.source || 'api',
        performedBy: options.performedBy,
      };
      if (options.syncLogId) eventMetadata.syncLogId = options.syncLogId;

      this.eventService.emitTenantUnassigned({
        unitId,
        facilityId: unit.facility_id,
        tenantId,
        accessType: assignment.access_type,
        metadata: eventMetadata,
      });

      logger.info(`Tenant ${tenantId} unassigned from unit ${unitId} by ${options.performedBy}`, {
        source: options.source || 'api',
        facilityId: unit.facility_id,
      });

      // Fire-and-forget: Create notification and activity log for the unassignment
      this.logUnassignmentSideEffects(
        unitId, unit.facility_id, unit.unit_number, tenantId,
        options.performedBy, options.source || 'api'
      ).catch(err => logger.error('Failed to log unassignment side effects:', err));

      this.notifyDashboardUnitChanged(unit);
    } catch (error) {
      logger.error('Error unassigning tenant from unit:', error);
      throw error;
    }
  }

  /**
   * Delete a unit: unassign all tenants (denylist route pass access), revoke key shares,
   * detach any linked lock, then remove the unit row.
   */
  async deleteUnit(unitId: string, userId: string, userRole: UserRole): Promise<void> {
    const unit = await this.unitModel.findById(unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }

    const hasAccess = await this.unitModel.hasUserAccessToUnit(unitId, userId, userRole);
    if (!hasAccess) {
      throw new Error('Access denied: You do not have permission to delete this unit');
    }

    const assignments = await this.unitAssignmentModel.findByUnitId(unitId);
    for (const assignment of assignments) {
      await this.unassignTenant(unitId, assignment.tenant_id, {
        performedBy: userId,
        source: 'api',
      });
    }

    const { KeySharingService } = await import('@/services/key-sharing.service');
    const keySharingService = KeySharingService.getInstance();
    await keySharingService.revokeAllActiveSharesForUnit(unitId, userId, userRole, {
      bestEffortGatewayDenylist: true,
    });

    const linkedDevice = await this.deviceModel.findBluLokByUnitId(unitId);
    if (linkedDevice) {
      const { DevicesService } = await import('@/services/devices.service');
      await DevicesService.getInstance().unassignDeviceFromUnit(linkedDevice.id, {
        performedBy: userId,
        source: 'api',
      });
    }

    const knex = DatabaseService.getInstance().connection;
    await knex('device_group_members').where('source_unit_id', unitId).del();

    await this.unitModel.deleteUnitById(unitId);

    this.logUnitDeletedSideEffects(unit, userId, {
      tenantsUnassigned: assignments.length,
      hadDevice: Boolean(linkedDevice),
    }).catch((err) => logger.error('Failed to log unit deletion side effects:', err));

    logger.info(`Unit ${unitId} (${unit.unit_number}) deleted by ${userId}`, {
      facilityId: unit.facility_id,
      tenantsUnassigned: assignments.length,
      hadDevice: Boolean(linkedDevice),
    });
  }

  // ============================================
  // Side-effect helpers (notifications + activity logs)
  // ============================================

  private async logUnitDeletedSideEffects(
    unit: { id: string; facility_id: string; unit_number: string },
    performedBy: string,
    stats: { tenantsUnassigned: number; hadDevice: boolean },
  ): Promise<void> {
    const { UserModel } = await import('@/models/user.model');
    const performer = await UserModel.findById(performedBy) as any;
    const performerName = performer
      ? `${performer.first_name || ''} ${performer.last_name || ''}`.trim() || performer.email
      : 'System';

    await ActivityService.getInstance().logUnitDeleted(
      unit.id,
      unit.facility_id,
      unit.unit_number,
      performedBy,
      performerName,
      stats,
    );
  }

  /**
   * Log notification and activity for a tenant assignment.
   * Runs as fire-and-forget so it never blocks the main assignment flow.
   */
  private async logAssignmentSideEffects(
    unitId: string,
    facilityId: string,
    unitNumber: string,
    tenantId: string,
    performedBy: string,
    source: string
  ): Promise<void> {
    // Look up facility name for the notification message
    const { FacilityModel } = await import('@/models/facility.model');
    const facilityModel = new FacilityModel();
    const facility = await facilityModel.findById(facilityId);
    const facilityName = facility?.name || 'Unknown Facility';

    // Look up performer name for activity log
    const { UserModel } = await import('@/models/user.model');
    const performer = await UserModel.findById(performedBy) as any;
    const performerName = performer
      ? `${performer.first_name || ''} ${performer.last_name || ''}`.trim() || performer.email
      : 'System';

    // Send notification to the assigned tenant
    await NotificationService.getInstance().notifyUnitAssigned(
      tenantId,
      unitNumber,
      facilityName,
      facilityId,
      unitId
    );

    // Log the assignment in activity logs
    await ActivityService.getInstance().logAssignmentChange(
      unitId,
      facilityId,
      tenantId,
      performerName,
      true, // assigned
      performedBy,
      performerName
    );
  }

  /**
   * Log notification and activity for a tenant unassignment.
   * Runs as fire-and-forget so it never blocks the main unassignment flow.
   */
  private async logUnassignmentSideEffects(
    unitId: string,
    facilityId: string,
    unitNumber: string,
    tenantId: string,
    performedBy: string,
    source: string
  ): Promise<void> {
    const { FacilityModel } = await import('@/models/facility.model');
    const facilityModel = new FacilityModel();
    const facility = await facilityModel.findById(facilityId);
    const facilityName = facility?.name || 'Unknown Facility';

    const { UserModel } = await import('@/models/user.model');
    const performer = await UserModel.findById(performedBy) as any;
    const performerName = performer
      ? `${performer.first_name || ''} ${performer.last_name || ''}`.trim() || performer.email
      : 'System';

    // Send notification to the unassigned tenant
    await NotificationService.getInstance().notifyUnitUnassigned(
      tenantId,
      unitNumber,
      facilityName,
      facilityId,
      unitId
    );

    // Log the unassignment in activity logs
    await ActivityService.getInstance().logAssignmentChange(
      unitId,
      facilityId,
      tenantId,
      performerName,
      false, // unassigned
      performedBy,
      performerName
    );
  }

  /**
   * Push units + general-stats WebSocket updates so dashboard occupancy widgets refresh
   * without a manual page reload (covers FMS sync, API assign/unassign, and status edits).
   */
  private notifyDashboardUnitChanged(unit: { id: string; facility_id: string }): void {
    void import('@/services/websocket.service')
      .then(async ({ WebSocketService }) => {
        const ws = WebSocketService.getInstance();
        await Promise.all([
          ws.broadcastUnitsUpdate({ facilityId: unit.facility_id, unitId: unit.id }),
          ws.broadcastGeneralStatsUpdate(),
        ]);
      })
      .catch((err) => {
        logger.warn('Failed to broadcast unit occupancy dashboard update', {
          unitId: unit.id,
          facilityId: unit.facility_id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

}
