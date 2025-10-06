/**
 * Unit Assignment Model
 * 
 * Manages tenant-to-unit assignments (access control)
 */

import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export interface UnitAssignment {
  id: string;
  unit_id: string;
  tenant_id: string;
  access_type: 'full' | 'temporary' | 'maintenance';
  is_primary: boolean;
  expires_at?: Date;
  notes?: string;
  created_at: Date;
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
      
      await this.db('unit_assignments')
        .insert({
          id,
          unit_id: data.unit_id,
          tenant_id: data.tenant_id,
          access_type: data.access_type || 'full',
          is_primary: data.is_primary ?? true,
          expires_at: data.expires_at,
          notes: data.notes,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        });

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
