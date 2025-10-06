/**
 * FMS Entity Mapping Model
 * 
 * Maps FMS external IDs to our internal IDs for tracking sync relationships
 */

import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export interface FMSEntityMapping {
  id: string;
  facility_id: string;
  entity_type: 'user' | 'unit';
  external_id: string;
  internal_id: string;
  provider_type: string;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export class FMSEntityMappingModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new mapping
   */
  async create(data: {
    facility_id: string;
    entity_type: 'user' | 'unit';
    external_id: string;
    internal_id: string;
    provider_type: string;
    metadata?: any;
  }): Promise<FMSEntityMapping> {
    try {
      // Generate UUID in JavaScript for MySQL compatibility
      const id = randomUUID();
      
      await this.db('fms_entity_mappings')
        .insert({
          id,
          ...data,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        });

      // Fetch the created record
      const mapping = await this.db('fms_entity_mappings')
        .where({ id })
        .first();

      if (!mapping) {
        throw new Error('Failed to retrieve created mapping');
      }

      return this.mapToModel(mapping);
    } catch (error) {
      logger.error('Error creating FMS entity mapping:', error);
      throw error;
    }
  }

  /**
   * Find mapping by external ID
   */
  async findByExternalId(
    facilityId: string,
    entityType: 'user' | 'unit',
    externalId: string
  ): Promise<FMSEntityMapping | null> {
    try {
      const mapping = await this.db('fms_entity_mappings')
        .where({
          facility_id: facilityId,
          entity_type: entityType,
          external_id: externalId,
        })
        .first();

      return mapping ? this.mapToModel(mapping) : null;
    } catch (error) {
      logger.error('Error finding FMS entity mapping:', error);
      throw error;
    }
  }

  /**
   * Find mapping by internal ID
   */
  async findByInternalId(
    facilityId: string,
    entityType: 'user' | 'unit',
    internalId: string
  ): Promise<FMSEntityMapping | null> {
    try {
      const mapping = await this.db('fms_entity_mappings')
        .where({
          facility_id: facilityId,
          entity_type: entityType,
          internal_id: internalId,
        })
        .first();

      return mapping ? this.mapToModel(mapping) : null;
    } catch (error) {
      logger.error('Error finding FMS entity mapping:', error);
      throw error;
    }
  }

  /**
   * Get all mappings for a facility
   */
  async findByFacility(
    facilityId: string,
    entityType?: 'user' | 'unit'
  ): Promise<FMSEntityMapping[]> {
    try {
      let query = this.db('fms_entity_mappings')
        .where({ facility_id: facilityId });

      if (entityType) {
        query = query.where({ entity_type: entityType });
      }

      const mappings = await query;
      return mappings.map(m => this.mapToModel(m));
    } catch (error) {
      logger.error('Error finding FMS entity mappings:', error);
      throw error;
    }
  }

  /**
   * Update mapping metadata
   */
  async updateMetadata(id: string, metadata: any): Promise<void> {
    try {
      await this.db('fms_entity_mappings')
        .where({ id })
        .update({
          metadata: JSON.stringify(metadata),
          updated_at: this.db.fn.now(),
        });
    } catch (error) {
      logger.error('Error updating FMS entity mapping:', error);
      throw error;
    }
  }

  /**
   * Delete mapping
   */
  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.db('fms_entity_mappings')
        .where({ id })
        .del();

      return deleted > 0;
    } catch (error) {
      logger.error('Error deleting FMS entity mapping:', error);
      throw error;
    }
  }

  /**
   * Delete all mappings for a facility
   */
  async deleteByFacility(facilityId: string): Promise<number> {
    try {
      return await this.db('fms_entity_mappings')
        .where({ facility_id: facilityId })
        .del();
    } catch (error) {
      logger.error('Error deleting FMS entity mappings:', error);
      throw error;
    }
  }

  private mapToModel(record: any): FMSEntityMapping {
    return {
      id: record.id,
      facility_id: record.facility_id,
      entity_type: record.entity_type,
      external_id: record.external_id,
      internal_id: record.internal_id,
      provider_type: record.provider_type,
      metadata: typeof record.metadata === 'string' 
        ? JSON.parse(record.metadata) 
        : record.metadata,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}
