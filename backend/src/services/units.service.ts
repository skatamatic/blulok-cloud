import { UserRole } from '@/types/auth.types';
import { UnitModel, UnitAssignment } from '@/models/unit.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { UnitAssignmentEventsService } from './events/unit-assignment-events.service';
import { logger } from '@/utils/logger';


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
