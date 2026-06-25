/**
 * Activity Log Model
 *
 * Data access layer for activity logs tracking unit and device state changes.
 * Provides CRUD operations and specialized queries for historical activity data.
 *
 * Key Features:
 * - Log device and unit state changes
 * - Track lock/unlock events
 * - Record access attempts
 * - Filter by entity, actor, time range
 * - Support for facility-scoped queries
 */

import { v4 as uuidv4 } from 'uuid';
import { HISTOGRAM_ACTIVITY_TYPES } from '@/constants/access-history.constants';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

/**
 * Entity types that can have activity logged
 */
export type ActivityEntityType = 'unit' | 'device' | 'facility' | 'user' | 'gateway';

/**
 * Activity types supported by the system
 */
export type ActivityType =
  | 'lock'
  | 'unlock'
  | 'locking'
  | 'unlocking'
  | 'access_attempt'
  | 'status_change'
  | 'error'
  | 'maintenance_start'
  | 'maintenance_end'
  | 'assignment_change'
  | 'configuration_change'
  | 'connection_change'
  | 'general';

/**
 * Actor types (who/what performed the action)
 */
export type ActorType = 'user' | 'system' | 'device' | 'gateway';

/**
 * Result/outcome of the activity
 */
export type ActivityResult = 'success' | 'failure' | 'pending' | 'unknown';

/**
 * Activity Log entity interface
 */
export interface ActivityLog {
  id: string;
  entity_type: ActivityEntityType;
  entity_id: string;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  actor_type: ActorType;
  actor_id: string | null;
  actor_name: string | null;
  result: ActivityResult;
  result_message: string | null;
  facility_id: string | null;
  unit_id: string | null;
  device_id: string | null;
  metadata: Record<string, any> | null;
  ip_address: string | null;
  occurred_at: Date;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data for creating a new activity log
 */
export interface CreateActivityLogData {
  entity_type: ActivityEntityType;
  entity_id: string;
  activity_type: ActivityType;
  title: string;
  description?: string;
  actor_type: ActorType;
  actor_id?: string;
  actor_name?: string;
  result?: ActivityResult;
  result_message?: string;
  facility_id?: string;
  unit_id?: string;
  device_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  occurred_at?: Date;
}

/**
 * Filters for querying activity logs
 */
export interface ActivityLogFilters {
  id?: string;
  entity_type?: ActivityEntityType;
  entity_id?: string;
  activity_type?: ActivityType;
  /** Match any of these activity types (takes precedence over activity_type) */
  activity_types?: ActivityType[];
  actor_type?: ActorType;
  actor_id?: string;
  result?: ActivityResult;
  facility_id?: string;
  /** Filter by multiple facilities (alternative to facility_id) */
  facility_ids?: string[];
  unit_id?: string;
  /** Filter by multiple units (alternative to unit_id) */
  unit_ids?: string[];
  device_id?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  /** Override default max limit (e.g. for export, capped at 5000) */
  max_limit?: number;
  offset?: number;
  sortBy?: 'occurred_at' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Activity log with enriched context for API responses
 */
export interface ActivityLogWithContext extends ActivityLog {
  unit_number?: string;
  device_serial?: string;
  blulok_device_settings?: Record<string, unknown> | null;
  device_location?: string;
  access_control_device_name?: string;
  facility_name?: string;
  actor_user_first_name?: string | null;
  actor_user_last_name?: string | null;
  actor_user_email?: string | null;
}

/** Safety limits to prevent unbounded queries */
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 100;

export class ActivityLogModel {
  private db = DatabaseService.getInstance();

  /**
   * Create a new activity log entry
   */
  async create(data: CreateActivityLogData): Promise<ActivityLog> {
    const knex = this.db.connection;
    const id = uuidv4();
    const now = new Date();

    const activityLogRow = {
      id,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      activity_type: data.activity_type,
      title: data.title,
      description: data.description || null,
      actor_type: data.actor_type,
      actor_id: data.actor_id || null,
      actor_name: data.actor_name || null,
      result: data.result || 'success',
      result_message: data.result_message || null,
      facility_id: data.facility_id || null,
      unit_id: data.unit_id || null,
      device_id: data.device_id || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      ip_address: data.ip_address || null,
      occurred_at: data.occurred_at || now,
      created_at: now,
      updated_at: now,
    };

    await knex('activity_logs').insert(activityLogRow);
    
    logger.debug(`Created activity log ${id}: ${data.activity_type} on ${data.entity_type}/${data.entity_id}`);
    
    // Return constructed object instead of re-querying
    return this.parseActivityLog(activityLogRow);
  }

  /**
   * Find an activity log by ID
   */
  async findById(id: string): Promise<ActivityLog | null> {
    const knex = this.db.connection;
    const log = await knex('activity_logs').where('id', id).first();
    return log ? this.parseActivityLog(log) : null;
  }

  /**
   * Apply common filters to a query (DRY helper)
   * @param query - Knex query builder
   * @param filters - Activity log filters
   * @param tablePrefix - Optional table prefix for joined queries (e.g., 'activity_logs.')
   */
  private applyFilters(query: any, filters: ActivityLogFilters, tablePrefix: string = ''): any {
    if (filters.id) {
      query = query.where(`${tablePrefix}id`, filters.id);
    }

    if (filters.entity_type) {
      query = query.where(`${tablePrefix}entity_type`, filters.entity_type);
    }

    if (filters.entity_id) {
      query = query.where(`${tablePrefix}entity_id`, filters.entity_id);
    }

    if (filters.activity_types && filters.activity_types.length > 0) {
      query = query.whereIn(`${tablePrefix}activity_type`, filters.activity_types);
    } else if (filters.activity_type) {
      query = query.where(`${tablePrefix}activity_type`, filters.activity_type);
    }

    if (filters.actor_type) {
      query = query.where(`${tablePrefix}actor_type`, filters.actor_type);
    }

    if (filters.actor_id) {
      query = query.where(`${tablePrefix}actor_id`, filters.actor_id);
    }

    if (filters.result) {
      query = query.where(`${tablePrefix}result`, filters.result);
    }

    if (filters.facility_id) {
      query = query.where(`${tablePrefix}facility_id`, filters.facility_id);
    } else if (filters.facility_ids && filters.facility_ids.length > 0) {
      query = query.whereIn(`${tablePrefix}facility_id`, filters.facility_ids);
    }

    if (filters.unit_id) {
      query = query.where(`${tablePrefix}unit_id`, filters.unit_id);
    } else if (filters.unit_ids && filters.unit_ids.length > 0) {
      query = query.whereIn(`${tablePrefix}unit_id`, filters.unit_ids);
    }

    if (filters.device_id) {
      query = query.where(`${tablePrefix}device_id`, filters.device_id);
    }

    if (filters.from_date) {
      query = query.where(`${tablePrefix}occurred_at`, '>=', filters.from_date);
    }

    if (filters.to_date) {
      query = query.where(`${tablePrefix}occurred_at`, '<=', filters.to_date);
    }

    return query;
  }

  /**
   * Find activity logs with filters.
   * Always applies a limit (default 50, max 100) to prevent unbounded queries.
   */
  async find(filters: ActivityLogFilters = {}): Promise<ActivityLog[]> {
    const knex = this.db.connection;
    let query = knex('activity_logs');

    // Apply common filters
    query = this.applyFilters(query, filters);

    // Sorting - always default to newest first
    const sortBy = filters.sortBy || 'occurred_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.orderBy(sortBy, sortOrder);

    // Pagination - always enforce a limit to prevent unbounded queries
    const maxCap = filters.max_limit ?? MAX_QUERY_LIMIT;
    const limit = Math.min(filters.limit || DEFAULT_QUERY_LIMIT, maxCap);
    query = query.limit(limit);
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const logs = await query;
    return logs.map((l: any) => this.parseActivityLog(l));
  }

  /**
   * Find activity logs with enriched context (unit number, device serial, etc.)
   * Uses LEFT JOINs to fetch related data in a single query (avoids N+1).
   * Always applies a limit (default 50, max 100) to prevent unbounded queries.
   */
  async findWithContext(filters: ActivityLogFilters = {}): Promise<ActivityLogWithContext[]> {
    const knex = this.db.connection;
    let query = knex('activity_logs')
      .select(
        'activity_logs.*',
        'units.unit_number',
        'blulok_devices.device_serial',
        'blulok_devices.device_settings as blulok_device_settings_raw',
        'access_control_devices.name as access_control_device_name',
        'access_control_devices.location_description as device_location',
        'facilities.name as facility_name',
        'actor_users.first_name as actor_user_first_name',
        'actor_users.last_name as actor_user_last_name',
        'actor_users.email as actor_user_email',
      )
      .leftJoin('units', 'activity_logs.unit_id', 'units.id')
      .leftJoin('blulok_devices', 'activity_logs.device_id', 'blulok_devices.id')
      .leftJoin('access_control_devices', 'activity_logs.device_id', 'access_control_devices.id')
      .leftJoin('facilities', 'activity_logs.facility_id', 'facilities.id')
      .leftJoin('users as actor_users', 'activity_logs.actor_id', 'actor_users.id');

    // Apply common filters with table prefix for joined query
    query = this.applyFilters(query, filters, 'activity_logs.');

    // Sorting - always default to newest first
    const sortBy = filters.sortBy || 'occurred_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.orderBy(`activity_logs.${sortBy}`, sortOrder);

    // Pagination - always enforce a limit to prevent unbounded queries
    const maxCap = filters.max_limit ?? MAX_QUERY_LIMIT;
    const limit = Math.min(filters.limit || DEFAULT_QUERY_LIMIT, maxCap);
    query = query.limit(limit);
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const logs = await query;
    return logs.map((l: any) => ({
      ...this.parseActivityLog(l),
      unit_number: l.unit_number,
      device_serial: l.device_serial,
      blulok_device_settings: l.blulok_device_settings_raw
        ? this.safeParseJson(l.blulok_device_settings_raw)
        : null,
      device_location: l.device_location,
      access_control_device_name: l.access_control_device_name,
      facility_name: l.facility_name,
      actor_user_first_name: l.actor_user_first_name ?? null,
      actor_user_last_name: l.actor_user_last_name ?? null,
      actor_user_email: l.actor_user_email ?? null,
    }));
  }

  /**
   * Aggregated dashboard activity counts for histogram (matches Activity Monitor scope).
   */
  async getActivityStats(options: {
    startDate: Date;
    endDate: Date;
    facilityIds?: string[];
    groupBy: 'hour' | 'day' | 'week';
  }): Promise<
    Array<{
      date: string;
      facility_id: string;
      facility_name: string;
      activity_type: ActivityType;
      activity_count: number;
    }>
  > {
    const knex = this.db.connection;

    let dateTrunc: string;
    switch (options.groupBy) {
      case 'hour':
        dateTrunc = "DATE_FORMAT(occurred_at, '%Y-%m-%d %H:00:00')";
        break;
      case 'week':
        dateTrunc = "DATE(DATE_SUB(occurred_at, INTERVAL WEEKDAY(occurred_at) DAY))";
        break;
      case 'day':
      default:
        dateTrunc = 'DATE(occurred_at)';
        break;
    }

    let query = knex('activity_logs')
      .leftJoin('units', 'activity_logs.unit_id', 'units.id')
      .select(
        knex.raw(`${dateTrunc} as date`),
        knex.raw('COALESCE(activity_logs.facility_id, units.facility_id) as facility_id'),
        'facilities.name as facility_name',
        'activity_logs.activity_type as activity_type',
        knex.raw('COUNT(*) as activity_count'),
      )
      .leftJoin('facilities', function (this: import('knex').Knex.JoinClause) {
        this.on('facilities.id', '=', knex.raw('COALESCE(activity_logs.facility_id, units.facility_id)'));
      })
      .whereIn('activity_logs.activity_type', HISTOGRAM_ACTIVITY_TYPES)
      .whereBetween('activity_logs.occurred_at', [options.startDate, options.endDate])
      .whereRaw('COALESCE(activity_logs.facility_id, units.facility_id) IS NOT NULL')
      .groupByRaw(
        `${dateTrunc}, COALESCE(activity_logs.facility_id, units.facility_id), facilities.name, activity_logs.activity_type`,
      )
      .orderByRaw(`${dateTrunc} ASC, facilities.name ASC`);

    if (options.facilityIds && options.facilityIds.length > 0) {
      const placeholders = options.facilityIds.map(() => '?').join(', ');
      query = query.whereRaw(
        `COALESCE(activity_logs.facility_id, units.facility_id) IN (${placeholders})`,
        options.facilityIds,
      );
    }

    const results = await query;
    return results.map((row: any) => ({
      date: ActivityLogModel.formatStatsBucketDate(row.date, options.groupBy),
      facility_id: row.facility_id,
      facility_name: row.facility_name || 'Unknown Facility',
      activity_type: row.activity_type,
      activity_count: parseInt(row.activity_count, 10) || 0,
    }));
  }

  /** Normalize MySQL bucket values for chart labels and grouping. */
  static formatStatsBucketDate(value: unknown, groupBy: 'hour' | 'day' | 'week'): string {
    if (value == null) return '';
    if (typeof value === 'string') {
      return value;
    }
    if (value instanceof Date) {
      if (groupBy === 'hour') {
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:00:00`;
      }
      if (groupBy === 'week') {
        const day = value.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const weekStart = new Date(value);
        weekStart.setDate(value.getDate() + diff);
        weekStart.setHours(0, 0, 0, 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}`;
      }
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    return String(value);
  }

  /**
   * Count activity logs with filters.
   * Strips pagination/sort params since they're irrelevant for counting.
   */
  async count(filters: ActivityLogFilters = {}): Promise<number> {
    const knex = this.db.connection;
    // Strip pagination/sort params - irrelevant for count queries
    const countFilters = { ...filters };
    delete countFilters.limit;
    delete countFilters.offset;
    delete countFilters.sortBy;
    delete countFilters.sortOrder;

    let query = knex('activity_logs');

    // Apply common filters (without pagination)
    query = this.applyFilters(query, countFilters);

    const result = await query.count('* as count').first();
    return parseInt(result?.count as string) || 0;
  }

  /**
   * Get activity logs for a specific unit
   */
  async getUnitActivity(unitId: string, options: { limit?: number; offset?: number } = {}): Promise<ActivityLogWithContext[]> {
    return this.findWithContext({
      unit_id: unitId,
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Get activity logs for a specific device
   */
  async getDeviceActivity(deviceId: string, options: { limit?: number; offset?: number } = {}): Promise<ActivityLogWithContext[]> {
    return this.findWithContext({
      device_id: deviceId,
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Get activity logs for a specific facility
   */
  async getFacilityActivity(facilityId: string, options: { limit?: number; offset?: number; from_date?: Date; to_date?: Date } = {}): Promise<ActivityLogWithContext[]> {
    return this.findWithContext({
      facility_id: facilityId,
      from_date: options.from_date,
      to_date: options.to_date,
      limit: options.limit || 50,
      offset: options.offset || 0,
    });
  }

  /**
   * Delete old activity logs (for cleanup jobs)
   */
  async cleanupOld(olderThanDays: number = 90): Promise<number> {
    const knex = this.db.connection;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await knex('activity_logs')
      .where('occurred_at', '<', cutoffDate)
      .del();

    if (result > 0) {
      logger.info(`Cleaned up ${result} old activity logs (older than ${olderThanDays} days)`);
    }

    return result;
  }

  /**
   * Parse activity log from database row
   */
  private parseActivityLog(row: any): ActivityLog {
    return {
      ...row,
      metadata: row.metadata ? this.safeParseJson(row.metadata) : null,
    };
  }

  /**
   * Safely parse JSON fields
   */
  private safeParseJson(value: any): any {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'object') {
      return value;
    }
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return null;
  }
}
