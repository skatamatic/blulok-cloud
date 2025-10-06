/**
 * FMS Configuration Model
 * 
 * Stores FMS integration configuration for each facility
 */

import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { 
  FMSConfiguration, 
  FMSProviderType, 
  FMSSyncStatus,
  FMSProviderConfig 
} from '@/types/fms.types';
import { logger } from '@/utils/logger';

export class FMSConfigurationModel {
  private db: Knex;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new FMS configuration
   */
  async create(data: {
    facility_id: string;
    provider_type: FMSProviderType;
    config: FMSProviderConfig;
    is_enabled?: boolean;
  }): Promise<FMSConfiguration> {
    try {
      // Generate UUID in JavaScript for MySQL compatibility
      const id = randomUUID();
      
      await this.db('fms_configurations')
        .insert({
          id,
          facility_id: data.facility_id,
          provider_type: data.provider_type,
          is_enabled: data.is_enabled ?? false,
          config: JSON.stringify(data.config),
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        });

      // Fetch the created record
      const config = await this.db('fms_configurations')
        .where({ id })
        .first();

      if (!config) {
        throw new Error('Failed to retrieve created FMS configuration');
      }

      return this.mapToModel(config);
    } catch (error) {
      logger.error('Error creating FMS configuration:', error);
      throw error;
    }
  }

  /**
   * Get FMS configuration by ID
   */
  async findById(id: string): Promise<FMSConfiguration | null> {
    try {
      const config = await this.db('fms_configurations')
        .where({ id })
        .first();

      return config ? this.mapToModel(config) : null;
    } catch (error) {
      logger.error('Error fetching FMS configuration:', error);
      throw error;
    }
  }

  /**
   * Get FMS configuration by facility ID
   */
  async findByFacilityId(facilityId: string): Promise<FMSConfiguration | null> {
    try {
      const config = await this.db('fms_configurations')
        .where({ facility_id: facilityId })
        .first();

      return config ? this.mapToModel(config) : null;
    } catch (error) {
      logger.error('Error fetching FMS configuration by facility:', error);
      throw error;
    }
  }

  /**
   * Get all FMS configurations
   */
  async findAll(filters?: {
    is_enabled?: boolean;
    provider_type?: FMSProviderType;
  }): Promise<FMSConfiguration[]> {
    try {
      let query = this.db('fms_configurations').select('*');

      if (filters?.is_enabled !== undefined) {
        query = query.where({ is_enabled: filters.is_enabled });
      }

      if (filters?.provider_type) {
        query = query.where({ provider_type: filters.provider_type });
      }

      const configs = await query;
      return configs.map(config => this.mapToModel(config));
    } catch (error) {
      logger.error('Error fetching FMS configurations:', error);
      throw error;
    }
  }

  /**
   * Update FMS configuration
   */
  async update(
    id: string, 
    data: Partial<{
      provider_type: FMSProviderType;
      is_enabled: boolean;
      config: FMSProviderConfig;
      last_sync_at: Date;
      last_sync_status: FMSSyncStatus;
    }>
  ): Promise<FMSConfiguration | null> {
    try {
      const updateData: any = {
        updated_at: this.db.fn.now(),
      };

      if (data.provider_type) updateData.provider_type = data.provider_type;
      if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled;
      if (data.config) updateData.config = JSON.stringify(data.config);
      if (data.last_sync_at) updateData.last_sync_at = data.last_sync_at;
      if (data.last_sync_status) updateData.last_sync_status = data.last_sync_status;

      await this.db('fms_configurations')
        .where({ id })
        .update(updateData);

      // Fetch the updated record (MySQL doesn't support .returning())
      const config = await this.db('fms_configurations')
        .where({ id })
        .first();

      return config ? this.mapToModel(config) : null;
    } catch (error) {
      logger.error('Error updating FMS configuration:', error);
      throw error;
    }
  }

  /**
   * Delete FMS configuration
   */
  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.db('fms_configurations')
        .where({ id })
        .del();

      return deleted > 0;
    } catch (error) {
      logger.error('Error deleting FMS configuration:', error);
      throw error;
    }
  }

  /**
   * Test if FMS configuration exists for facility
   */
  async existsForFacility(facilityId: string): Promise<boolean> {
    try {
      const count = await this.db('fms_configurations')
        .where({ facility_id: facilityId })
        .count('* as count')
        .first();

      return parseInt(count?.count as string || '0') > 0;
    } catch (error) {
      logger.error('Error checking FMS configuration existence:', error);
      throw error;
    }
  }

  /**
   * Map database record to model
   */
  private mapToModel(record: any): FMSConfiguration {
    return {
      id: record.id,
      facility_id: record.facility_id,
      provider_type: record.provider_type,
      is_enabled: record.is_enabled,
      config: typeof record.config === 'string' ? JSON.parse(record.config) : record.config,
      last_sync_at: record.last_sync_at,
      last_sync_status: record.last_sync_status,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}

