/**
 * Notifications Routes
 *
 * API endpoints for managing user notifications with read receipt support.
 * Provides CRUD operations for notifications with proper RBAC enforcement.
 *
 * Key Features:
 * - Get user notifications with filtering
 * - Mark notifications as read (single, multiple, or all)
 * - Delete notifications
 * - Get unread count
 *
 * Access Control:
 * - Users can only access their own notifications
 * - Admins can view any user's notifications
 * - Facility-scoped filtering supported
 *
 * Endpoints:
 * - GET /notifications - Get current user's notifications
 * - GET /notifications/unread-count - Get unread notification count
 * - GET /notifications/:id - Get single notification
 * - POST /notifications/:id/read - Mark notification as read
 * - POST /notifications/read - Mark multiple notifications as read
 * - POST /notifications/read-all - Mark all notifications as read
 * - DELETE /notifications/:id - Delete a notification
 */

import { Router, Response } from 'express';
import Joi from 'joi';
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { NotificationService } from '@/services/notification.service';
import { AuthService } from '@/services/auth.service';
import { asyncHandler, AccessDeniedError, NotFoundError } from '@/middleware/error.middleware';
import { validate } from '@/middleware/validator.middleware';
import { logger } from '@/utils/logger';

const router = Router();

// Validation schemas
const listQuerySchema = Joi.object({
  type: Joi.string().valid(
    'access_granted',
    'access_denied',
    'device_registered',
    'password_reset',
    'unit_assigned',
    'unit_unassigned',
    'system_alert',
    'maintenance_alert',
    'security_alert',
    'general'
  ).optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  isRead: Joi.boolean().optional(),
  facilityId: Joi.string().uuid().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

const markMultipleReadSchema = Joi.object({
  notificationIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
});

const markAllReadSchema = Joi.object({
  facilityId: Joi.string().uuid().optional(),
});

const unreadCountQuerySchema = Joi.object({
  facilityId: Joi.string().uuid().optional(),
});

// Path parameter validation schemas
const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/v1/notifications
 * 
 * Get notifications for the current user.
 * Supports filtering by type, priority, read status, and facility.
 */
router.get(
  '/',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { type, priority, isRead, facilityId, limit, offset } = req.query;

    const service = NotificationService.getInstance();

    const result = await service.getUserNotifications(
      user.userId,
      user.role,
      user.facilityIds,
      user.userId,
      {
        type: type as any,
        priority: priority as any,
        // Joi coerces query string 'true'/'false' to boolean; handle both coerced and raw forms
        isRead: typeof isRead === 'boolean' ? isRead : isRead === 'true' ? true : isRead === 'false' ? false : undefined,
        facilityId: facilityId as string,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      }
    );

    res.json({
      success: true,
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  })
);

/**
 * GET /api/v1/notifications/unread-count
 * 
 * Get the unread notification count for the current user.
 */
router.get(
  '/unread-count',
  validate(unreadCountQuerySchema, 'query'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const facilityId = req.query.facilityId as string | undefined;

    // Validate facility access if facilityId is provided
    if (facilityId && !AuthService.canAccessAllFacilities(user.role)) {
      if (!user.facilityIds?.includes(facilityId)) {
        throw new AccessDeniedError('Access denied to this facility');
      }
    }

    const service = NotificationService.getInstance();
    const count = await service.getUnreadCount(user.userId, facilityId);

    res.json({
      success: true,
      unreadCount: count,
    });
  })
);

/**
 * GET /api/v1/notifications/:id
 * 
 * Get a single notification by ID.
 */
router.get(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;

    const service = NotificationService.getInstance();
    const notification = await service.getNotificationById(user.userId, user.role, id);

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    res.json({
      success: true,
      notification,
    });
  })
);

/**
 * POST /api/v1/notifications/:id/read
 * 
 * Mark a single notification as read.
 */
router.post(
  '/:id/read',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;

    const service = NotificationService.getInstance();
    const notification = await service.markAsRead(user.userId, user.role, id);

    if (!notification) {
      throw new NotFoundError('Notification');
    }

    res.json({
      success: true,
      notification,
    });
  })
);

/**
 * POST /api/v1/notifications/read
 * 
 * Mark multiple notifications as read.
 */
router.post(
  '/read',
  validate(markMultipleReadSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { notificationIds } = req.body;

    const service = NotificationService.getInstance();
    const count = await service.markMultipleAsRead(user.userId, user.role, notificationIds);

    res.json({
      success: true,
      markedCount: count,
    });
  })
);

/**
 * POST /api/v1/notifications/read-all
 * 
 * Mark all notifications as read for the current user.
 */
router.post(
  '/read-all',
  validate(markAllReadSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.body;

    const service = NotificationService.getInstance();
    const count = await service.markAllAsRead(user.userId, user.role, user.userId, facilityId);

    res.json({
      success: true,
      markedCount: count,
    });
  })
);

/**
 * DELETE /api/v1/notifications/:id
 * 
 * Delete a notification.
 */
router.delete(
  '/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;

    const service = NotificationService.getInstance();
    const deleted = await service.deleteNotification(user.userId, user.role, id);

    if (!deleted) {
      throw new NotFoundError('Notification');
    }

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  })
);

export { router as notificationsRouter };
