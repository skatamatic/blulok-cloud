/**
 * FMS Change Model
 *
 * Tracks and manages individual changes detected during Facility Management System (FMS)
 * synchronization operations. Provides comprehensive change tracking, validation,
 * review workflow, and application management for FMS data imports.
 *
 * Key Features:
 * - Change detection and classification (create, update, delete operations)
 * - Data validation with detailed error reporting
 * - Human review workflow for change acceptance/rejection
 * - Impact assessment and required action tracking
 * - Change application tracking and rollback support
 * - Bulk operations for efficient change management
 *
 * Change Types:
 * - CREATE: New entities detected in FMS
 * - UPDATE: Existing entities modified in FMS
 * - DELETE: Entities removed from FMS
 * - MOVE: Entities relocated between facilities
 * - MERGE: Duplicate entity consolidation
 *
 * Entity Types:
 * - tenant: User/customer accounts and profiles
 * - unit: Storage units and rental spaces
 *
 * Review Workflow:
 * 1. FMS sync detects changes and creates change records
 * 2. Changes are validated for data integrity
 * 3. Administrators review changes with impact summaries
 * 4. Approved changes are applied to the system
 * 5. Application results are tracked for audit purposes
 *
 * Security Considerations:
 * - Change validation prevents malicious data injection
 * - Review workflow ensures human oversight of critical changes
 * - Audit trail tracks all change lifecycle events
 * - Permission-based access to change management operations
 */

import { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { DatabaseService } from '@/services/database.service';
import { FMSChange, FMSChangeType, FMSChangeAction } from '@/types/fms.types';
import { logger } from '@/utils/logger';
import { isFmsChangePending } from '@/services/fms/fms-apply-order.utils';

export class FMSChangeModel {
  private db: Knex;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  /**
   * Create a new change record
   */
  async create(data: {
    sync_log_id: string;
    change_type: FMSChangeType;
    entity_type: 'tenant' | 'unit';
    external_id: string;
    internal_id?: string;
    before_data?: any;
    after_data: any;
    required_actions: FMSChangeAction[];
    impact_summary: string;
    is_valid?: boolean;
    validation_errors?: string[];
  }): Promise<FMSChange> {
    try {
      // Generate UUID in JavaScript for MySQL compatibility
      const id = randomUUID();
      
      const validationErrorsJson = data.validation_errors ? JSON.stringify(data.validation_errors) : null;

      await this.db('fms_changes')
        .insert({
          id,
          sync_log_id: data.sync_log_id,
          change_type: data.change_type,
          entity_type: data.entity_type,
          external_id: data.external_id,
          internal_id: data.internal_id,
          before_data: data.before_data ? JSON.stringify(data.before_data) : null,
          after_data: data.after_data != null ? JSON.stringify(data.after_data) : null,
          required_actions: JSON.stringify(data.required_actions),
          impact_summary: data.impact_summary,
          is_reviewed: false,
          is_valid: data.is_valid,
          validation_errors: validationErrorsJson,
          created_at: this.db.fn.now(),
        });

      // Fetch the created record
      const change = await this.db('fms_changes')
        .where({ id })
        .first();

      if (!change) {
        throw new Error('Failed to retrieve created change');
      }

      return this.mapToModel(change);
    } catch (error) {
      logger.error('Error creating FMS change:', error);
      throw error;
    }
  }

  /**
   * Get change by ID
   */
  async findById(id: string): Promise<FMSChange | null> {
    try {
      const change = await this.db('fms_changes')
        .where({ id })
        .first();

      return change ? this.mapToModel(change) : null;
    } catch (error) {
      logger.error('Error fetching FMS change:', error);
      throw error;
    }
  }

  /**
   * Batch-fetch changes by ID (single query).
   */
  async findByIds(ids: string[]): Promise<FMSChange[]> {
    if (ids.length === 0) return [];
    try {
      const rows = await this.db('fms_changes').whereIn('id', ids);
      return rows.map((row) => this.mapToModel(row));
    } catch (error) {
      logger.error('Error fetching FMS changes by IDs:', error);
      throw error;
    }
  }

  /**
   * Get all changes for a sync log
   */
  async findBySyncLogId(
    syncLogId: string,
    options?: {
      reviewed?: boolean;
      accepted?: boolean;
      changeType?: FMSChangeType;
    }
  ): Promise<FMSChange[]> {
    try {
      let query = this.db('fms_changes')
        .where({ sync_log_id: syncLogId });

      if (options?.reviewed !== undefined) {
        query = query.where({ is_reviewed: options.reviewed });
      }

      if (options?.accepted !== undefined) {
        query = query.where({ is_accepted: options.accepted });
      }

      if (options?.changeType) {
        query = query.where({ change_type: options.changeType });
      }

      query = query.orderBy('created_at', 'asc');

      const changes = await query;
      return changes.map(change => this.mapToModel(change));
    } catch (error) {
      logger.error('Error fetching FMS changes:', error);
      throw error;
    }
  }

  /**
   * Get changes that still need review or re-apply (not applied, not rejected).
   */
  async findPendingBySyncLogId(syncLogId: string): Promise<FMSChange[]> {
    const changes = await this.findBySyncLogId(syncLogId);
    return changes.filter((c) => isFmsChangePending(c));
  }

  /**
   * Update a change
   */
  async update(
    id: string,
    data: Partial<{
      is_reviewed: boolean;
      is_accepted: boolean;
      applied_at: Date;
    }>
  ): Promise<FMSChange | null> {
    try {
      const updateData: any = {};

      if (data.is_reviewed !== undefined) updateData.is_reviewed = data.is_reviewed;
      if (data.is_accepted !== undefined) updateData.is_accepted = data.is_accepted;
      if (data.applied_at) updateData.applied_at = data.applied_at;

      await this.db('fms_changes')
        .where({ id })
        .update(updateData);

      // Fetch the updated record (MySQL doesn't support .returning())
      const change = await this.db('fms_changes')
        .where({ id })
        .first();

      return change ? this.mapToModel(change) : null;
    } catch (error) {
      logger.error('Error updating FMS change:', error);
      throw error;
    }
  }

  /**
   * Mark change as reviewed and accepted/rejected
   */
  async reviewChange(id: string, accepted: boolean): Promise<FMSChange | null> {
    return this.update(id, {
      is_reviewed: true,
      is_accepted: accepted,
    });
  }

  /**
   * Mark change as applied
   */
  async markApplied(id: string): Promise<FMSChange | null> {
    return this.update(id, {
      applied_at: new Date(),
    });
  }

  /**
   * Mark multiple changes as applied in a single query.
   */
  async bulkMarkApplied(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    try {
      return await this.db('fms_changes')
        .whereIn('id', ids)
        .update({ applied_at: this.db.fn.now() });
    } catch (error) {
      logger.error('Error bulk marking FMS changes applied:', error);
      throw error;
    }
  }

  /**
   * Insert many change records in a single batch query and return them.
   * Falls back to sequential create if the batch is empty.
   */
  async bulkCreate(items: Array<{
    sync_log_id: string;
    change_type: FMSChangeType;
    entity_type: 'tenant' | 'unit';
    external_id: string;
    internal_id?: string;
    before_data?: any;
    after_data: any;
    required_actions: FMSChangeAction[];
    impact_summary: string;
    is_valid?: boolean;
    validation_errors?: string[];
  }>): Promise<FMSChange[]> {
    if (items.length === 0) return [];
    try {
      const ids: string[] = [];
      const rows = items.map(data => {
        const id = randomUUID();
        ids.push(id);
        return {
          id,
          sync_log_id: data.sync_log_id,
          change_type: data.change_type,
          entity_type: data.entity_type,
          external_id: data.external_id,
          internal_id: data.internal_id,
          before_data: data.before_data ? JSON.stringify(data.before_data) : null,
          after_data: data.after_data != null ? JSON.stringify(data.after_data) : null,
          required_actions: JSON.stringify(data.required_actions),
          impact_summary: data.impact_summary,
          is_reviewed: false,
          is_valid: data.is_valid,
          validation_errors: data.validation_errors ? JSON.stringify(data.validation_errors) : null,
          created_at: this.db.fn.now(),
        };
      });

      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await this.db('fms_changes').insert(rows.slice(i, i + BATCH_SIZE));
      }

      const records = await this.db('fms_changes')
        .whereIn('id', ids)
        .orderByRaw(`FIELD(id, ${ids.map(() => '?').join(',')})`, ids);

      return records.map((r: any) => this.mapToModel(r));
    } catch (error) {
      logger.error('Error bulk creating FMS changes:', error);
      throw error;
    }
  }

  /**
   * Bulk review changes
   */
  async bulkReview(changeIds: string[], accepted: boolean): Promise<number> {
    try {
      const updated = await this.db('fms_changes')
        .whereIn('id', changeIds)
        .update({
          is_reviewed: true,
          is_accepted: accepted,
        });

      return updated;
    } catch (error) {
      logger.error('Error bulk reviewing FMS changes:', error);
      throw error;
    }
  }

  /**
   * Delete changes for a sync log
   */
  async deleteBySyncLogId(syncLogId: string): Promise<number> {
    try {
      const deleted = await this.db('fms_changes')
        .where({ sync_log_id: syncLogId })
        .del();

      return deleted;
    } catch (error) {
      logger.error('Error deleting FMS changes:', error);
      throw error;
    }
  }

  /**
   * Get change statistics for a sync log
   */
  async getStatsBySyncLogId(syncLogId: string): Promise<{
    total: number;
    reviewed: number;
    pending: number;
    accepted: number;
    rejected: number;
    byType: Record<FMSChangeType, number>;
  }> {
    try {
      const changes = await this.findBySyncLogId(syncLogId);

      const stats = {
        total: changes.length,
        reviewed: changes.filter(c => c.is_reviewed).length,
        pending: changes.filter(c => isFmsChangePending(c)).length,
        accepted: changes.filter(c => c.is_accepted === true).length,
        rejected: changes.filter(c => c.is_accepted === false).length,
        byType: {} as Record<FMSChangeType, number>,
      };

      // Count by type
      for (const type of Object.values(FMSChangeType)) {
        stats.byType[type] = changes.filter(c => c.change_type === type).length;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting FMS change stats:', error);
      throw error;
    }
  }

  /**
   * Map database record to model
   */
  private mapToModel(record: any): FMSChange {
    // Parse JSON columns
    const parsedBefore = typeof record.before_data === 'string'
      ? JSON.parse(record.before_data)
      : record.before_data;

    const parsedAfter = typeof record.after_data === 'string'
      ? JSON.parse(record.after_data)
      : record.after_data;

    let validationErrors = typeof record.validation_errors === 'string'
      ? JSON.parse(record.validation_errors)
      : record.validation_errors;

    // Derive validation errors if missing but the change is marked invalid
    let derivedInvalid = false;
    if ((record.is_valid === false || record.is_valid === 0) && (!validationErrors || validationErrors.length === 0)) {
      const derived: string[] = [];
      const tenantPayload = parsedAfter ?? parsedBefore;
      if (record.entity_type === 'tenant' && tenantPayload) {
        const email = (tenantPayload.email ?? tenantPayload.login_identifier) as string | null | undefined;
        const firstName = (tenantPayload.firstName ?? tenantPayload.first_name) as string | null | undefined;
        const lastName = (tenantPayload.lastName ?? tenantPayload.last_name) as string | null | undefined;

        if (!email || (typeof email === 'string' && email.trim() === '')) {
          derived.push('Missing or empty email address');
        }
        if (!firstName || (typeof firstName === 'string' && firstName.trim() === '')) {
          derived.push('Missing or empty first name');
        }
        if (!lastName || (typeof lastName === 'string' && lastName.trim() === '')) {
          derived.push('Missing or empty last name');
        }
      }
      if (derived.length > 0) {
        validationErrors = derived;
        derivedInvalid = true;
      }
    }

    // Convert MySQL integer (0/1) to boolean — null/undefined means valid (legacy rows)
    let isValidBoolean: boolean;
    if (derivedInvalid) {
      isValidBoolean = false;
    } else if (record.is_valid === false || record.is_valid === 0) {
      isValidBoolean = false;
    } else {
      isValidBoolean = true;
    }

    const result: FMSChange = {
      id: record.id,
      sync_log_id: record.sync_log_id,
      change_type: record.change_type,
      entity_type: record.entity_type,
      external_id: record.external_id,
      internal_id: record.internal_id,
      before_data: parsedBefore,
      after_data: parsedAfter,
      required_actions: typeof record.required_actions === 'string'
        ? JSON.parse(record.required_actions)
        : record.required_actions,
      impact_summary: record.impact_summary,
      is_reviewed: record.is_reviewed === true || record.is_reviewed === 1,
      is_accepted:
        record.is_accepted === null || record.is_accepted === undefined
          ? undefined
          : record.is_accepted === true || record.is_accepted === 1,
      applied_at: record.applied_at,
      created_at: record.created_at,
      is_valid: isValidBoolean,
    };

    // Only set validation_errors if it has a value
    if (validationErrors !== null && validationErrors !== undefined) {
      result.validation_errors = validationErrors;
    }

    return result;
  }
}

