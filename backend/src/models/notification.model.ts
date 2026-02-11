/**
 * Notification Model
 *
 * Data access layer for user notifications with read receipt support.
 * Provides CRUD operations and specialized queries for the notification system.
 *
 * Key Features:
 * - Create and manage user notifications
 * - Track read receipts
 * - Filter by type, priority, and read status
 * - Support for facility-scoped notifications
 * - Batch operations for marking multiple as read
 * - Automatic cleanup of expired notifications
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

/**
 * Notification types supported by the system
 */
export type NotificationType =
  | 'access_granted'
  | 'access_denied'
  | 'device_registered'
  | 'password_reset'
  | 'unit_assigned'
  | 'unit_unassigned'
  | 'system_alert'
  | 'maintenance_alert'
  | 'security_alert'
  | 'general';

/**
 * Priority levels for notifications
 */
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * Notification entity interface
 */
export interface Notification {
  id: string;
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  is_read: boolean;
  read_at: Date | null;
  reference_type: string | null;
  reference_id: string | null;
  facility_id: string | null;
  metadata: Record<string, any> | null;
  expires_at: Date | null;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data for creating a new notification
 */
export interface CreateNotificationData {
  user_id: string;
  notification_type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  reference_type?: string;
  reference_id?: string;
  facility_id?: string;
  metadata?: Record<string, any>;
  expires_at?: Date;
}

/**
 * Filters for querying notifications
 */
export interface NotificationFilters {
  user_id?: string;
  notification_type?: NotificationType;
  priority?: NotificationPriority;
  is_read?: boolean;
  facility_id?: string;
  reference_type?: string;
  reference_id?: string;
  include_deleted?: boolean;
  include_expired?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'priority' | 'read_at';
  sortOrder?: 'asc' | 'desc';
}

/** Safety limits to prevent unbounded queries */
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 100;

export class NotificationModel {
  private db = DatabaseService.getInstance();

  /**
   * Create a new notification
   */
  async create(data: CreateNotificationData): Promise<Notification> {
    const knex = this.db.connection;
    const id = uuidv4();
    const now = new Date();

    const notificationRow = {
      id,
      user_id: data.user_id,
      notification_type: data.notification_type,
      title: data.title,
      message: data.message,
      priority: data.priority || 'normal',
      is_read: false,
      read_at: null,
      reference_type: data.reference_type || null,
      reference_id: data.reference_id || null,
      facility_id: data.facility_id || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      expires_at: data.expires_at || null,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    };

    await knex('notifications').insert(notificationRow);
    
    logger.info(`Created notification ${id} for user ${data.user_id}: ${data.notification_type}`);
    
    // Return constructed object instead of re-querying
    return this.parseNotification(notificationRow);
  }

  /**
   * Find a notification by ID
   */
  async findById(id: string): Promise<Notification | null> {
    const knex = this.db.connection;
    const notification = await knex('notifications').where('id', id).first();
    return notification ? this.parseNotification(notification) : null;
  }

  /**
   * Find multiple notifications by IDs (batch lookup to avoid N+1)
   */
  async findByIds(ids: string[]): Promise<Notification[]> {
    if (ids.length === 0) return [];
    const knex = this.db.connection;
    const notifications = await knex('notifications').whereIn('id', ids);
    return notifications.map((n: any) => this.parseNotification(n));
  }

  /**
   * Apply common filters to a query (DRY helper)
   */
  private applyFilters(query: any, filters: NotificationFilters): any {
    if (filters.user_id) {
      query = query.where('user_id', filters.user_id);
    }

    if (filters.notification_type) {
      query = query.where('notification_type', filters.notification_type);
    }

    if (filters.priority) {
      query = query.where('priority', filters.priority);
    }

    if (filters.is_read !== undefined) {
      query = query.where('is_read', filters.is_read);
    }

    if (filters.facility_id) {
      query = query.where('facility_id', filters.facility_id);
    }

    if (filters.reference_type) {
      query = query.where('reference_type', filters.reference_type);
    }

    if (filters.reference_id) {
      query = query.where('reference_id', filters.reference_id);
    }

    // Exclude deleted by default
    if (!filters.include_deleted) {
      query = query.where('is_deleted', false);
    }

    // Exclude expired by default
    if (!filters.include_expired) {
      query = query.where(function(this: any) {
        this.whereNull('expires_at').orWhere('expires_at', '>', new Date());
      });
    }

    return query;
  }

  /**
   * Find notifications with filters.
   * Always applies a limit (default 50, max 100) to prevent unbounded queries.
   */
  async find(filters: NotificationFilters = {}): Promise<Notification[]> {
    const knex = this.db.connection;
    let query = knex('notifications');

    // Apply common filters
    query = this.applyFilters(query, filters);

    // Sorting - always default to newest first
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.orderBy(sortBy, sortOrder);

    // Pagination - always enforce a limit to prevent unbounded queries
    const limit = Math.min(filters.limit || DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
    query = query.limit(limit);
    if (filters.offset) {
      query = query.offset(filters.offset);
    }

    const notifications = await query;
    return notifications.map((n: any) => this.parseNotification(n));
  }

  /**
   * Count notifications with filters.
   * Strips pagination/sort params since they're irrelevant for counting.
   */
  async count(filters: NotificationFilters = {}): Promise<number> {
    const knex = this.db.connection;
    // Strip pagination/sort params - irrelevant for count queries
    const countFilters = { ...filters };
    delete countFilters.limit;
    delete countFilters.offset;
    delete countFilters.sortBy;
    delete countFilters.sortOrder;

    let query = knex('notifications');

    // Apply common filters (without pagination)
    query = this.applyFilters(query, countFilters);

    const result = await query.count('* as count').first();
    return parseInt(result?.count as string) || 0;
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string, facilityId?: string): Promise<number> {
    return this.count({
      user_id: userId,
      is_read: false,
      facility_id: facilityId,
    });
  }

  /**
   * Mark a notification as read.
   * Accepts the pre-fetched notification to avoid a redundant SELECT after UPDATE.
   */
  async markAsRead(id: string, existingNotification?: Notification): Promise<Notification | null> {
    const knex = this.db.connection;
    const now = new Date();

    const updated = await knex('notifications')
      .where('id', id)
      .update({
        is_read: true,
        read_at: now,
        updated_at: now,
      });

    if (updated === 0) {
      return null;
    }

    // If we already have the notification object, construct the updated version
    // locally instead of re-querying the database
    if (existingNotification) {
      return {
        ...existingNotification,
        is_read: true,
        read_at: now,
        updated_at: now,
      };
    }

    // Fallback: re-fetch if no pre-fetched notification was provided
    return this.findById(id);
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const knex = this.db.connection;
    
    const result = await knex('notifications')
      .whereIn('id', ids)
      .update({
        is_read: true,
        read_at: new Date(),
        updated_at: new Date(),
      });

    return result;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, facilityId?: string): Promise<number> {
    const knex = this.db.connection;
    
    let query = knex('notifications')
      .where('user_id', userId)
      .where('is_read', false)
      .where('is_deleted', false);

    if (facilityId) {
      query = query.where('facility_id', facilityId);
    }

    const result = await query.update({
      is_read: true,
      read_at: new Date(),
      updated_at: new Date(),
    });

    logger.info(`Marked ${result} notifications as read for user ${userId}`);
    return result;
  }

  /**
   * Soft delete a notification
   */
  async delete(id: string): Promise<boolean> {
    const knex = this.db.connection;
    
    const result = await knex('notifications')
      .where('id', id)
      .update({
        is_deleted: true,
        updated_at: new Date(),
      });

    return result > 0;
  }

  /**
   * Soft delete multiple notifications
   */
  async deleteMultiple(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const knex = this.db.connection;
    
    const result = await knex('notifications')
      .whereIn('id', ids)
      .update({
        is_deleted: true,
        updated_at: new Date(),
      });

    return result;
  }

  /**
   * Hard delete expired notifications (for cleanup jobs)
   */
  async cleanupExpired(): Promise<number> {
    const knex = this.db.connection;
    
    const result = await knex('notifications')
      .where('expires_at', '<', new Date())
      .del();

    if (result > 0) {
      logger.info(`Cleaned up ${result} expired notifications`);
    }

    return result;
  }

  /**
   * Hard delete old deleted notifications (for cleanup jobs)
   */
  async cleanupDeleted(olderThanDays: number = 30): Promise<number> {
    const knex = this.db.connection;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    const result = await knex('notifications')
      .where('is_deleted', true)
      .where('updated_at', '<', cutoffDate)
      .del();

    if (result > 0) {
      logger.info(`Cleaned up ${result} old deleted notifications`);
    }

    return result;
  }

  /**
   * Parse notification from database row
   */
  private parseNotification(row: any): Notification {
    return {
      ...row,
      metadata: row.metadata ? this.safeParseJson(row.metadata) : null,
      is_read: Boolean(row.is_read),
      is_deleted: Boolean(row.is_deleted),
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
