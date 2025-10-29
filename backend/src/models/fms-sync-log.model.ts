/**
 * FMS Sync Log Model
 *
 * Comprehensive audit trail and operational tracking for Facility Management System (FMS)
 * synchronization operations. Records every sync attempt, its progress, results, and
 * any issues encountered during the data synchronization process.
 *
 * Key Features:
 * - Complete sync lifecycle tracking (start → progress → completion/failure)
 * - Detailed statistics and performance metrics
 * - Error logging and failure analysis
 * - Trigger source tracking (manual, automatic, webhook)
 * - Change summary and impact assessment
 * - Retry and rollback tracking
 *
 * Sync Status Lifecycle:
 * - IN_PROGRESS: Sync operation actively running
 * - COMPLETED: Sync finished successfully
 * - FAILED: Sync terminated with errors
 * - CANCELLED: Sync stopped by user/admin
 * - ROLLED_BACK: Sync changes were reverted
 *
 * Trigger Types:
 * - manual: User-initiated sync via admin interface
 * - automatic: Scheduled sync based on configuration
 * - webhook: Sync triggered by external FMS webhook
 *
 * Statistics Tracked:
 * - Changes detected, applied, pending, rejected counts
 * - Processing duration and performance metrics
 * - Error counts and types
 * - Data volume processed (tenants, units)
 *
 * Security Considerations:
 * - Audit trail for all sync operations
 * - User attribution for manual operations
 * - Facility-scoped access control
 * - Sensitive data handling in logs
 * - Compliance-ready retention policies
 */

import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { FMSSyncLog, FMSSyncStatus } from '@/types/fms.types';
import { logger } from '@/utils/logger';

export class FMSSyncLogModel {
  private db: Knex;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new sync log entry
   */
  async create(data: {
    facility_id: string;
    fms_config_id: string;
    triggered_by: 'manual' | 'automatic' | 'webhook';
    triggered_by_user_id?: string;
  }): Promise<FMSSyncLog> {
    try {
      // Generate UUID in JavaScript for MySQL compatibility
      const id = randomUUID();
      
      await this.db('fms_sync_logs')
        .insert({
          id,
          facility_id: data.facility_id,
          fms_config_id: data.fms_config_id,
          sync_status: FMSSyncStatus.IN_PROGRESS,
          started_at: this.db.fn.now(),
          triggered_by: data.triggered_by,
          triggered_by_user_id: data.triggered_by_user_id,
          changes_detected: 0,
          changes_applied: 0,
          changes_pending: 0,
          changes_rejected: 0,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        });

      // Fetch the created record
      const log = await this.db('fms_sync_logs')
        .where({ id })
        .first();

      if (!log) {
        throw new Error('Failed to retrieve created sync log');
      }

      return this.mapToModel(log);
    } catch (error) {
      logger.error('Error creating FMS sync log:', error);
      throw error;
    }
  }

  /**
   * Get sync log by ID
   */
  async findById(id: string): Promise<FMSSyncLog | null> {
    try {
      const log = await this.db('fms_sync_logs')
        .where({ id })
        .first();

      return log ? this.mapToModel(log) : null;
    } catch (error) {
      logger.error('Error fetching FMS sync log:', error);
      throw error;
    }
  }

  /**
   * Get sync logs for a facility
   */
  async findByFacilityId(
    facilityId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: FMSSyncStatus;
    }
  ): Promise<{ logs: FMSSyncLog[]; total: number }> {
    try {
      let query = this.db('fms_sync_logs')
        .where({ facility_id: facilityId });

      if (options?.status) {
        query = query.where({ sync_status: options.status });
      }

      // Get total count
      const countQuery = query.clone().count('* as count').first();
      
      // Apply pagination
      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.offset(options.offset);
      }

      query = query.orderBy('created_at', 'desc');

      const [logs, countResult] = await Promise.all([
        query,
        countQuery
      ]);

      return {
        logs: logs.map(log => this.mapToModel(log)),
        total: parseInt(countResult?.count as string || '0')
      };
    } catch (error) {
      logger.error('Error fetching FMS sync logs:', error);
      throw error;
    }
  }

  /**
   * Get latest sync log for a facility
   */
  async findLatestByFacilityId(facilityId: string): Promise<FMSSyncLog | null> {
    try {
      const log = await this.db('fms_sync_logs')
        .where({ facility_id: facilityId })
        .orderBy('created_at', 'desc')
        .first();

      return log ? this.mapToModel(log) : null;
    } catch (error) {
      logger.error('Error fetching latest FMS sync log:', error);
      throw error;
    }
  }

  /**
   * Update sync log
   */
  async update(
    id: string,
    data: Partial<{
      sync_status: FMSSyncStatus;
      completed_at: Date;
      changes_detected: number;
      changes_applied: number;
      changes_pending: number;
      changes_rejected: number;
      error_message: string;
      sync_summary: any;
    }>
  ): Promise<FMSSyncLog | null> {
    try {
      const updateData: any = {
        updated_at: this.db.fn.now(),
      };

      if (data.sync_status) updateData.sync_status = data.sync_status;
      if (data.completed_at) updateData.completed_at = data.completed_at;
      if (data.changes_detected !== undefined) updateData.changes_detected = data.changes_detected;
      if (data.changes_applied !== undefined) updateData.changes_applied = data.changes_applied;
      if (data.changes_pending !== undefined) updateData.changes_pending = data.changes_pending;
      if (data.changes_rejected !== undefined) updateData.changes_rejected = data.changes_rejected;
      if (data.error_message) updateData.error_message = data.error_message;
      if (data.sync_summary) updateData.sync_summary = JSON.stringify(data.sync_summary);

      await this.db('fms_sync_logs')
        .where({ id })
        .update(updateData);

      // Fetch the updated record (MySQL doesn't support .returning())
      const log = await this.db('fms_sync_logs')
        .where({ id })
        .first();

      return log ? this.mapToModel(log) : null;
    } catch (error) {
      logger.error('Error updating FMS sync log:', error);
      throw error;
    }
  }

  /**
   * Mark sync as completed
   */
  async markCompleted(id: string, summary?: any): Promise<void> {
    try {
      await this.update(id, {
        sync_status: FMSSyncStatus.COMPLETED,
        completed_at: new Date(),
        sync_summary: summary,
      });
    } catch (error) {
      logger.error('Error marking sync as completed:', error);
      throw error;
    }
  }

  /**
   * Mark sync as failed
   */
  async markFailed(id: string, errorMessage: string): Promise<void> {
    try {
      await this.update(id, {
        sync_status: FMSSyncStatus.FAILED,
        completed_at: new Date(),
        error_message: errorMessage,
      });
    } catch (error) {
      logger.error('Error marking sync as failed:', error);
      throw error;
    }
  }

  /**
   * Map database record to model
   */
  private mapToModel(record: any): FMSSyncLog {
    return {
      id: record.id,
      facility_id: record.facility_id,
      fms_config_id: record.fms_config_id,
      sync_status: record.sync_status,
      started_at: record.started_at,
      completed_at: record.completed_at,
      triggered_by: record.triggered_by,
      triggered_by_user_id: record.triggered_by_user_id,
      changes_detected: record.changes_detected,
      changes_applied: record.changes_applied,
      changes_pending: record.changes_pending,
      changes_rejected: record.changes_rejected,
      error_message: record.error_message,
      sync_summary: typeof record.sync_summary === 'string' 
        ? JSON.parse(record.sync_summary) 
        : record.sync_summary,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }
}

