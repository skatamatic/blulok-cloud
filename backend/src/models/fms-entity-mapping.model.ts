/**
 * FMS Entity Mapping Model
 *
 * Maintains bidirectional mapping between external FMS (Facility Management System) entity IDs
 * and internal BluLok entity IDs. Ensures data consistency and prevents duplication during
 * synchronization operations across different FMS providers and facilities.
 *
 * Key Features:
 * - Bidirectional ID mapping (external ↔ internal)
 * - Entity type classification (users, units)
 * - Provider-specific mappings
 * - Facility-scoped relationships
 * - Conflict detection and resolution
 * - Metadata storage for sync context
 *
 * Entity Types:
 * - user: Maps FMS customer/tenant IDs to BluLok user IDs
 * - unit: Maps FMS unit/space IDs to BluLok unit IDs
 *
 * Mapping Lifecycle:
 * 1. Initial mapping created during first sync
 * 2. Mappings validated on subsequent syncs
 * 3. Conflicts detected and flagged for review
 * 4. Mappings updated only through explicit change approval
 * 5. Orphaned mappings cleaned up on entity deletion
 *
 * Conflict Resolution:
 * - External ID conflicts: Same external ID maps to different internal entities
 * - Internal ID conflicts: Same internal entity maps to different external IDs
 * - Provider conflicts: Different providers claim same external ID
 * - All conflicts require human review before resolution
 *
 * Security Considerations:
 * - Facility-scoped mappings prevent cross-facility data leakage
 * - Provider isolation ensures clean separation between FMS systems
 * - Audit trail for all mapping changes and conflict resolutions
 * - Validation prevents malicious ID manipulation
 */

import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export interface FMSEntityMapping {
  /** Globally unique identifier for the mapping record */
  id: string;
  /** Facility that owns this mapping relationship */
  facility_id: string;
  /** Type of entity being mapped */
  entity_type: 'user' | 'unit';
  /** External identifier from the FMS system */
  external_id: string;
  /** Internal BluLok identifier */
  internal_id: string;
  /** FMS provider type (storedge, generic_rest, etc.) */
  provider_type: string;
  /** Additional sync context and metadata */
  metadata?: any;
  /** Automatic record creation timestamp */
  created_at: Date;
  /** Automatic record update timestamp */
  updated_at: Date;
}

export class FMSEntityMappingModel {
  private db;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Ensure mapping exists and is consistent. If a mapping exists for the external_id
   * but points to a different internal_id, throws an error to let callers create
   * an explicit repair change instead of silently mutating.
   */
  async ensureMapping(data: {
    facility_id: string;
    entity_type: 'user' | 'unit';
    external_id: string;
    internal_id: string;
    provider_type: string;
    metadata?: any;
  }): Promise<FMSEntityMapping> {
    const existing = await this.findByExternalId(
      data.facility_id,
      data.entity_type,
      data.external_id
    );

    if (!existing) {
      return await this.create(data);
    }

    if (existing.internal_id !== data.internal_id) {
      // Conflict: external already mapped to a different internal
      const err = new Error('FMS mapping conflict: external mapped to different internal');
      (err as any).code = 'FMS_MAPPING_CONFLICT';
      (err as any).existing_internal_id = existing.internal_id;
      (err as any).expected_internal_id = data.internal_id;
      throw err;
    }

    // Already correct; optionally update metadata/provider
    if (data.metadata || data.provider_type !== existing.provider_type) {
      await this.db('fms_entity_mappings')
        .where({ id: existing.id })
        .update({
          provider_type: data.provider_type,
          metadata: data.metadata ? JSON.stringify(data.metadata) : existing.metadata,
          updated_at: this.db.fn.now(),
        });

      const updated = await this.findByExternalId(data.facility_id, data.entity_type, data.external_id);
      if (updated) return updated;
    }

    return existing;
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
   * Update the internal_id of an existing mapping
   */
  async updateInternalId(id: string, newInternalId: string): Promise<void> {
    try {
      await this.db('fms_entity_mappings')
        .where({ id })
        .update({ internal_id: newInternalId, updated_at: this.db.fn.now() });
    } catch (error) {
      logger.error('Error updating FMS entity mapping internal_id:', error);
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
