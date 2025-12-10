import { UserRole } from '@/types/auth.types';
import { UnitModel, UnitAssignment } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitAssignmentEventsService } from './events/unit-assignment-events.service';
import { logger } from '@/utils/logger';

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

  private constructor() {
    this.unitModel = new UnitModel();
    this.unitAssignmentModel = new UnitAssignmentModel();
    this.eventService = UnitAssignmentEventsService.getInstance();
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
      // Get units with pagination and filtering
      const result = await this.unitModel.getUnitsListForUser(userId, userRole, filters);
      return result;

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
      
      return result;
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
      return await this.unitModel.createUnit(unitData, userId, userRole);
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
      return await this.unitModel.updateUnit(unitId, updateData, userId, userRole);
    } catch (error) {
      logger.error('Error updating unit:', error);
      throw error;
    }
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

      // Check if assignment already exists
      const existing = await this.unitAssignmentModel.findByUnitAndTenant(unitId, tenantId);
      if (existing) {
        logger.warn(`Assignment already exists for tenant ${tenantId} to unit ${unitId}`);
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
      // PERFORMANCE FIX: Pre-fetch all units in one query instead of N queries
      const allUnitsResult = await this.unitModel.getUnitsListForUser(
        'system',
        'admin' as any,
        { limit: unitIds.length * 2, offset: 0 }
      );
      const unitsById = new Map((allUnitsResult.units || []).map((u: any) => [u.id, u]));

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
    } catch (error) {
      logger.error('Error unassigning tenant from unit:', error);
      throw error;
    }
  }

}
