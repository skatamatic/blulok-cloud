/**
 * Notification Service
 *
 * Business logic layer for the notification system. Provides high-level
 * operations for creating, managing, and querying notifications with
 * proper RBAC enforcement and event emission.
 *
 * Key Features:
 * - Create notifications for various system events
 * - Role-based notification targeting
 * - Facility-scoped notifications
 * - Read receipt management
 * - Event-driven updates via NotificationEventsService
 */

import { NotificationModel, Notification, CreateNotificationData, NotificationFilters, NotificationType, NotificationPriority } from '@/models/notification.model';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { AccessDeniedError, NotFoundError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';
import {
  canViewNotificationType,
  excludedNotificationTypesForRole,
} from '@/utils/in-app-notification-visibility.utils';

/**
 * Notification response format for API
 */
export interface NotificationResponse {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  isRead: boolean;
  readAt: Date | null;
  reference: { type: string; id: string } | null;
  facilityId: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

/**
 * Options for creating notifications
 */
export interface CreateNotificationOptions {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  referenceType?: string;
  referenceId?: string;
  facilityId?: string;
  metadata?: Record<string, any>;
  expiresInDays?: number;
}

/**
 * Options for querying notifications
 */
export interface QueryNotificationsOptions {
  type?: NotificationType;
  priority?: NotificationPriority;
  isRead?: boolean;
  facilityId?: string;
  /** All-facilities mode: restrict to these facility IDs */
  facilityIds?: string[];
  /** Include expired notifications (for historical views) */
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
}

export class NotificationService {
  private static instance: NotificationService;
  private notificationModel: NotificationModel;
  private eventService: NotificationEventsService;

  private constructor() {
    this.notificationModel = new NotificationModel();
    this.eventService = NotificationEventsService.getInstance();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Create a new notification
   */
  async createNotification(options: CreateNotificationOptions): Promise<NotificationResponse> {
    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : undefined;

    const data: CreateNotificationData = {
      user_id: options.userId,
      notification_type: options.type,
      title: options.title,
      message: options.message,
      priority: options.priority || 'normal',
      reference_type: options.referenceType,
      reference_id: options.referenceId,
      facility_id: options.facilityId,
      metadata: options.metadata,
      expires_at: expiresAt,
    };

    const notification = await this.notificationModel.create(data);

    // Emit event for real-time updates
    this.eventService.emitNotificationCreated({
      notificationId: notification.id,
      userId: notification.user_id,
      notificationType: notification.notification_type,
      priority: notification.priority,
      facilityId: notification.facility_id || undefined,
      reference: notification.reference_type && notification.reference_id
        ? { type: notification.reference_type, id: notification.reference_id }
        : undefined,
      title: notification.title,
      message: notification.message,
    });

    return this.formatNotification(notification);
  }

  /**
   * Get notifications for a user with access control
   */
  async getUserNotifications(
    requestingUserId: string,
    requestingUserRole: UserRole,
    requestingUserFacilityIds: string[] | undefined,
    targetUserId: string,
    options: QueryNotificationsOptions = {}
  ): Promise<{ notifications: NotificationResponse[]; total: number; unreadCount: number }> {
    // Users can only see their own notifications unless they're admins
    if (requestingUserId !== targetUserId && !AuthService.isAdmin(requestingUserRole)) {
      throw new AccessDeniedError('Cannot view other user notifications');
    }

    const excludedTypes = excludedNotificationTypesForRole(requestingUserRole);

    // Build filters
    const filters: NotificationFilters = {
      user_id: targetUserId,
      notification_type: options.type,
      priority: options.priority,
      is_read: options.isRead,
      include_expired: options.includeExpired === true,
      exclude_notification_types: excludedTypes.length > 0 ? excludedTypes : undefined,
      limit: options.limit || 50,
      offset: options.offset || 0,
      sortBy: 'created_at',
      sortOrder: 'desc',
    };

    // Apply facility scope
    const facilityScope = this.resolveFacilityScope(
      requestingUserRole,
      requestingUserFacilityIds,
      options.facilityId,
      options.facilityIds,
    );
    if (facilityScope.facilityId) {
      filters.facility_id = facilityScope.facilityId;
    } else if (facilityScope.facilityIds && facilityScope.facilityIds.length > 0) {
      filters.facility_ids = facilityScope.facilityIds;
    }

    const unreadScope = facilityScope.facilityId
      ? {
          facilityId: facilityScope.facilityId,
          excludeNotificationTypes: excludedTypes.length > 0 ? excludedTypes : undefined,
        }
      : facilityScope.facilityIds?.length
        ? {
            facilityIds: facilityScope.facilityIds,
            excludeNotificationTypes: excludedTypes.length > 0 ? excludedTypes : undefined,
          }
        : excludedTypes.length > 0
          ? { excludeNotificationTypes: excludedTypes }
          : undefined;

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel.find(filters),
      this.notificationModel.count(filters),
      this.notificationModel.getUnreadCount(targetUserId, unreadScope),
    ]);

    void this.notificationModel.purgeStaleForUser(targetUserId).catch((err) => {
      logger.warn(`Failed to purge stale notifications for user ${targetUserId}:`, err);
    });

    return {
      notifications: notifications.map(n => this.formatNotification(n)),
      total,
      unreadCount,
    };
  }

  /**
   * Get a single notification by ID
   */
  async getNotificationById(
    requestingUserId: string,
    requestingUserRole: UserRole,
    notificationId: string
  ): Promise<NotificationResponse | null> {
    const notification = await this.notificationModel.findById(notificationId);

    if (!notification) {
      return null;
    }

    // Check access
    if (notification.user_id !== requestingUserId && !AuthService.isAdmin(requestingUserRole)) {
      throw new AccessDeniedError('Cannot view this notification');
    }

    if (!canViewNotificationType(requestingUserRole, notification.notification_type)) {
      return null;
    }

    return this.formatNotification(notification);
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(
    requestingUserId: string,
    requestingUserRole: UserRole,
    notificationId: string
  ): Promise<NotificationResponse | null> {
    const notification = await this.notificationModel.findById(notificationId);

    if (!notification) {
      return null;
    }

    // Check access
    if (notification.user_id !== requestingUserId && !AuthService.isAdmin(requestingUserRole)) {
      throw new AccessDeniedError('Cannot modify this notification');
    }

    // Pass the pre-fetched notification to avoid a redundant SELECT after UPDATE
    const updated = await this.notificationModel.markAsRead(notificationId, notification);

    if (updated) {
      // Emit event
      this.eventService.emitNotificationRead({
        notificationId: updated.id,
        userId: updated.user_id,
        notificationType: updated.notification_type,
        priority: updated.priority,
        facilityId: updated.facility_id || undefined,
        readAt: updated.read_at!,
      });
    }

    return updated ? this.formatNotification(updated) : null;
  }

  /**
   * Mark multiple notifications as read
   */
  async markMultipleAsRead(
    requestingUserId: string,
    requestingUserRole: UserRole,
    notificationIds: string[]
  ): Promise<number> {
    if (notificationIds.length === 0) return 0;

    // Batch lookup all notifications to avoid N+1
    const notifications = await this.notificationModel.findByIds(notificationIds);

    // Verify all requested IDs were found (prevents enumeration attacks)
    if (notifications.length !== notificationIds.length) {
      const foundIds = new Set(notifications.map(n => n.id));
      const missingIds = notificationIds.filter(id => !foundIds.has(id));
      logger.warn(`Batch read attempted on non-existent notifications: ${missingIds.join(', ')}`);
      throw new NotFoundError('Some notifications');
    }

    // Verify ownership of all found notifications
    for (const notification of notifications) {
      if (notification.user_id !== requestingUserId && !AuthService.isAdmin(requestingUserRole)) {
        throw new AccessDeniedError('Cannot modify some notifications');
      }
    }

    const count = await this.notificationModel.markMultipleAsRead(notificationIds);

    // Emit batch event
    this.eventService.emitBatchRead(requestingUserId, notificationIds);

    return count;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(
    requestingUserId: string,
    requestingUserRole: UserRole,
    targetUserId: string,
    scope?: { facilityId?: string; facilityIds?: string[] },
    requestingUserFacilityIds?: string[],
  ): Promise<number> {
    // Users can only mark their own notifications unless they're admins
    if (requestingUserId !== targetUserId && !AuthService.isAdmin(requestingUserRole)) {
      throw new AccessDeniedError('Cannot modify other user notifications');
    }

    const facilityScope = this.resolveFacilityScope(
      requestingUserRole,
      requestingUserFacilityIds,
      scope?.facilityId,
      scope?.facilityIds,
    );

    const count = await this.notificationModel.markAllAsRead(targetUserId, {
      facilityId: facilityScope.facilityId,
      facilityIds: facilityScope.facilityIds,
    });

    // Emit batch event
    this.eventService.emitBatchRead(targetUserId, [], {
      facilityId: facilityScope.facilityId,
      facilityIds: facilityScope.facilityIds,
    });

    return count;
  }

  /**
   * Get unread count for a user with optional facility scope
   */
  async getUnreadCount(
    userId: string,
    userRole: UserRole,
    scope?: { facilityId?: string; facilityIds?: string[] },
  ): Promise<number> {
    const excludedTypes = excludedNotificationTypesForRole(userRole);
    return this.notificationModel.getUnreadCount(userId, {
      ...scope,
      excludeNotificationTypes: excludedTypes.length > 0 ? excludedTypes : undefined,
    });
  }

  /**
   * Delete a notification
   */
  async deleteNotification(
    requestingUserId: string,
    requestingUserRole: UserRole,
    notificationId: string
  ): Promise<boolean> {
    const notification = await this.notificationModel.findById(notificationId);

    if (!notification) {
      return false;
    }

    // Check access
    if (notification.user_id !== requestingUserId && !AuthService.isAdmin(requestingUserRole)) {
      throw new AccessDeniedError('Cannot delete this notification');
    }

    const deleted = await this.notificationModel.delete(notificationId);

    if (deleted) {
      // Emit event
      this.eventService.emitNotificationDeleted({
        notificationId: notification.id,
        userId: notification.user_id,
        notificationType: notification.notification_type,
        priority: notification.priority,
        facilityId: notification.facility_id || undefined,
      });
    }

    return deleted;
  }

  // ============================================
  // Convenience methods for creating specific notification types
  // ============================================

  /**
   * Create an access granted notification
   */
  async notifyAccessGranted(
    userId: string,
    unitNumber: string,
    facilityId: string,
    unitId?: string,
    grantedBy?: string
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'access_granted',
      title: 'Access Granted',
      message: `You have been granted access to unit ${unitNumber}.`,
      priority: 'normal',
      referenceType: 'unit',
      referenceId: unitId,
      facilityId,
      metadata: { grantedBy },
    });
  }

  /**
   * Create an access denied notification
   */
  async notifyAccessDenied(
    userId: string,
    unitNumber: string,
    facilityId: string,
    unitId?: string,
    reason?: string
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'access_denied',
      title: 'Access Denied',
      message: `Access to unit ${unitNumber} was denied${reason ? `: ${reason}` : '.'}`,
      priority: 'high',
      referenceType: 'unit',
      referenceId: unitId,
      facilityId,
      metadata: { reason },
    });
  }

  /**
   * Create a device registered notification
   */
  async notifyDeviceRegistered(
    userId: string,
    deviceInfo: { name: string; type: string; id?: string },
    facilityId?: string
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'device_registered',
      title: 'New Device Registered',
      message: `A new ${deviceInfo.type} device "${deviceInfo.name}" has been registered.`,
      priority: 'normal',
      referenceType: 'device',
      referenceId: deviceInfo.id,
      facilityId,
      metadata: deviceInfo,
    });
  }

  /**
   * Create a password reset notification
   */
  async notifyPasswordReset(userId: string): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'password_reset',
      title: 'Password Reset',
      message: 'Your password has been successfully reset.',
      priority: 'normal',
    });
  }

  /**
   * Create a unit assigned notification
   */
  async notifyUnitAssigned(
    userId: string,
    unitNumber: string,
    facilityName: string,
    facilityId: string,
    unitId?: string
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'unit_assigned',
      title: 'Unit Assigned',
      message: `You have been assigned to unit ${unitNumber} at ${facilityName}.`,
      priority: 'normal',
      referenceType: 'unit',
      referenceId: unitId,
      facilityId,
    });
  }

  /**
   * Create a unit unassigned notification
   */
  async notifyUnitUnassigned(
    userId: string,
    unitNumber: string,
    facilityName: string,
    facilityId: string,
    unitId?: string
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'unit_unassigned',
      title: 'Unit Access Removed',
      message: `Your access to unit ${unitNumber} at ${facilityName} has been removed.`,
      priority: 'normal',
      referenceType: 'unit',
      referenceId: unitId,
      facilityId,
    });
  }

  /**
   * Create a system alert notification
   */
  async notifySystemAlert(
    userId: string,
    title: string,
    message: string,
    priority: NotificationPriority = 'normal',
    metadata?: Record<string, any>
  ): Promise<NotificationResponse> {
    return this.createNotification({
      userId,
      type: 'system_alert',
      title,
      message,
      priority,
      metadata,
    });
  }

  // ============================================
  // Helper methods
  // ============================================

  /**
   * Check if user can access a facility
   */
  private canAccessFacility(
    userRole: UserRole,
    facilityId: string,
    userFacilityIds: string[] | undefined
  ): boolean {
    if (AuthService.canAccessAllFacilities(userRole)) {
      return true;
    }
    return userFacilityIds?.includes(facilityId) || false;
  }

  /**
   * Resolve REST/WS facility scope from explicit filter or user's assigned facilities.
   */
  private resolveFacilityScope(
    userRole: UserRole,
    userFacilityIds: string[] | undefined,
    facilityId?: string,
    facilityIds?: string[],
  ): { facilityId?: string; facilityIds?: string[] } {
    if (facilityId) {
      if (!this.canAccessFacility(userRole, facilityId, userFacilityIds)) {
        throw new AccessDeniedError('Access denied to this facility');
      }
      return { facilityId };
    }

    if (facilityIds && facilityIds.length > 0) {
      if (!AuthService.canAccessAllFacilities(userRole)) {
        const allowed = userFacilityIds ?? [];
        const filtered = facilityIds.filter((id) => allowed.includes(id));
        return { facilityIds: filtered };
      }
      return { facilityIds };
    }

    if (!AuthService.canAccessAllFacilities(userRole) && userFacilityIds && userFacilityIds.length > 0) {
      return { facilityIds: userFacilityIds };
    }

    return {};
  }

  /**
   * Format notification for API response
   */
  private formatNotification(notification: Notification): NotificationResponse {
    return {
      id: notification.id,
      type: notification.notification_type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      isRead: notification.is_read,
      readAt: notification.read_at,
      reference: notification.reference_type && notification.reference_id
        ? { type: notification.reference_type, id: notification.reference_id }
        : null,
      facilityId: notification.facility_id,
      metadata: notification.metadata,
      createdAt: notification.created_at,
    };
  }
}
