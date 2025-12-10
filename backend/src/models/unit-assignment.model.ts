/**
 * Unit Assignment Model
 *
 * Manages the relationship between tenants (users) and storage units, controlling
 * access permissions and assignment lifecycle. Provides the foundation for
 * access control in the BluLok system by defining who can access which units
 * and under what conditions.
 *
 * Key Features:
 * - Multi-tenant unit assignments with access levels
 * - Primary vs secondary tenant relationships
 * - Temporary access with expiration dates
 * - Access type classification (full, temporary, maintenance)
 * - Assignment history and audit trail
 * - Conflict resolution for overlapping assignments
 *
 * Access Types:
 * - full: Complete access equivalent to ownership
 * - temporary: Time-limited access (e.g., guest access)
 * - maintenance: Service/maintenance personnel access
 *
 * Assignment Rules:
 * - One primary tenant per unit (enforced)
 * - Multiple secondary tenants allowed
 * - Expiration dates for temporary assignments
 * - Automatic cleanup of expired assignments
 * - Facility-scoped assignment isolation
 *
 * Security Considerations:
 * - Tenant isolation prevents unauthorized access
 * - Assignment validation before access granting
 * - Audit logging for all assignment changes
 * - Permission inheritance from assignment type
 * - Secure assignment transfer workflows
 */

import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export interface UnitAssignment {
  /** Globally unique identifier for the assignment */
  id: string;
  /** Storage unit being assigned */
  unit_id: string;
  /** Tenant (user) receiving access */
  tenant_id: string;
  /** Level of access granted */
  access_type: 'full' | 'temporary' | 'maintenance';
  /** Whether this is the primary tenant for the unit */
  is_primary: boolean;
  /** Optional expiration date for temporary assignments */
  expires_at?: Date;
  /** Additional notes about the assignment */
  notes?: string;
  /** Assignment creation timestamp */
  created_at: Date;
  /** Assignment last update timestamp */
  updated_at: Date;
}

export class UnitAssignmentModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new unit assignment
   */
  async create(data: {
    unit_id: string;
    tenant_id: string;
    access_type?: string;
    is_primary?: boolean;
    expires_at?: Date;
    notes?: string;
  }): Promise<UnitAssignment> {
    try {
      // Generate UUID in JavaScript for MySQL compatibility
      const id = randomUUID();
      
      const insertData: any = {
        id,
        unit_id: data.unit_id,
        tenant_id: data.tenant_id,
        access_type: data.access_type || 'full',
        is_primary: data.is_primary ?? true,
        notes: data.notes,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      };

      // Only include expires_at if it's provided and the column exists
      if (data.expires_at) {
        insertData.expires_at = data.expires_at;
      }

      await this.db('unit_assignments').insert(insertData);

      // Fetch the created record
      const assignment = await this.db('unit_assignments')
        .where({ id })
        .first();

      if (!assignment) {
        throw new Error('Failed to retrieve created assignment');
      }

      return assignment;
    } catch (error) {
      logger.error('Error creating unit assignment:', error);
      throw error;
    }
  }

  /**
   * Get assignment by ID
   */
  async findById(id: string): Promise<UnitAssignment | null> {
    try {
      const assignment = await this.db('unit_assignments')
        .where({ id })
        .first();

      return assignment || null;
    } catch (error) {
      logger.error('Error finding unit assignment:', error);
      throw error;
    }
  }

  /**
   * Get all assignments for a unit
   */
  async findByUnitId(unitId: string): Promise<UnitAssignment[]> {
    try {
      return await this.db('unit_assignments')
        .where({ unit_id: unitId })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error finding unit assignments:', error);
      throw error;
    }
  }

  /**
   * Get all assignments for a tenant
   */
  async findByTenantId(tenantId: string): Promise<UnitAssignment[]> {
    try {
      return await this.db('unit_assignments')
        .where({ tenant_id: tenantId })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error finding tenant assignments:', error);
      throw error;
    }
  }

  /**
   * Get all assignments for multiple tenants in a single query.
   * PERFORMANCE: Avoids N+1 queries when processing many tenants.
   * 
   * @param tenantIds - Array of tenant IDs to fetch assignments for
   * @returns Array of all assignments for the specified tenants
   */
  async findByTenantIds(tenantIds: string[]): Promise<UnitAssignment[]> {
    try {
      if (tenantIds.length === 0) {
        return [];
      }
      return await this.db('unit_assignments')
        .whereIn('tenant_id', tenantIds)
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error finding tenant assignments by IDs:', error);
      throw error;
    }
  }

  /**
   * Get all assignments for units in a specific facility.
   * PERFORMANCE: Fetches all assignments for a facility in one query.
   * 
   * @param facilityId - Facility ID to get assignments for
   * @returns Array of assignments with unit_id included
   */
  async findByFacilityId(facilityId: string): Promise<UnitAssignment[]> {
    try {
      return await this.db('unit_assignments as ua')
        .join('units as u', 'ua.unit_id', 'u.id')
        .where('u.facility_id', facilityId)
        .select('ua.*')
        .orderBy('ua.created_at', 'desc');
    } catch (error) {
      logger.error('Error finding facility assignments:', error);
      throw error;
    }
  }

  /**
   * Get specific assignment
   */
  async findByUnitAndTenant(unitId: string, tenantId: string): Promise<UnitAssignment | null> {
    try {
      const assignment = await this.db('unit_assignments')
        .where({ unit_id: unitId, tenant_id: tenantId })
        .first();

      return assignment || null;
    } catch (error) {
      logger.error('Error finding assignment:', error);
      throw error;
    }
  }

  /**
   * Update assignment
   */
  async update(id: string, data: Partial<{
    access_type: string;
    is_primary: boolean;
    expires_at: Date;
    notes: string;
  }>): Promise<UnitAssignment | null> {
    try {
      const [assignment] = await this.db('unit_assignments')
        .where({ id })
        .update({
          ...data,
          updated_at: this.db.fn.now(),
        })
        .returning('*');

      return assignment || null;
    } catch (error) {
      logger.error('Error updating unit assignment:', error);
      throw error;
    }
  }

  /**
   * Delete assignment
   */
  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.db('unit_assignments')
        .where({ id })
        .del();

      return deleted > 0;
    } catch (error) {
      logger.error('Error deleting unit assignment:', error);
      throw error;
    }
  }

  /**
   * Delete assignment by unit and tenant
   */
  async deleteByUnitAndTenant(unitId: string, tenantId: string): Promise<boolean> {
    try {
      const deleted = await this.db('unit_assignments')
        .where({ unit_id: unitId, tenant_id: tenantId })
        .del();

      return deleted > 0;
    } catch (error) {
      logger.error('Error deleting assignment:', error);
      throw error;
    }
  }

  /**
   * Delete all assignments for a tenant
   */
  async deleteByTenantId(tenantId: string): Promise<number> {
    try {
      return await this.db('unit_assignments')
        .where({ tenant_id: tenantId })
        .del();
    } catch (error) {
      logger.error('Error deleting tenant assignments:', error);
      throw error;
    }
  }

  /**
   * Check if assignment exists
   */
  async exists(unitId: string, tenantId: string): Promise<boolean> {
    try {
      const count = await this.db('unit_assignments')
        .where({ unit_id: unitId, tenant_id: tenantId })
        .count('* as count')
        .first();

      return parseInt(count?.count as string || '0') > 0;
    } catch (error) {
      logger.error('Error checking assignment existence:', error);
      throw error;
    }
  }
}
