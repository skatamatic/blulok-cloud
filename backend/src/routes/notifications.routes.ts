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
import { authenticateToken } from '@/middleware/auth.middleware';
import { AuthenticatedRequest } from '@/types/auth.types';
import { NotificationService } from '@/services/notification.service';
import { AuthService } from '@/services/auth.service';
import { asyncHandler, AccessDeniedError, NotFoundError } from '@/middleware/error.middleware';
import { registerGet, registerPost, registerDelete } from '@/openapi/register-route';
import {
  notificationListQuerySchema,
  markMultipleReadSchema,
  markAllReadSchema,
  unreadCountQuerySchema,
  notificationIdParamSchema,
  notificationListResponseSchema,
  unreadCountResponseSchema,
  notificationResponseSchema,
  markedCountResponseSchema,
  deleteNotificationResponseSchema,
} from '@/schemas/notifications.schemas';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import { parseQueryBoolean } from '@/utils/query-boolean.util';

const router = Router();
const MOUNT = '/api/v1/notifications';

router.use(authenticateToken);

registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Notifications'],
    summary: 'Get notifications for the current user',
    security: 'bearer',
    query: notificationListQuerySchema,
    responses: {
      200: notificationListResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { type, priority, isRead, facilityId, includeExpired, limit, offset } = req.query;

    const service = NotificationService.getInstance();

    const result = await service.getUserNotifications(
      user.userId,
      user.role,
      user.facilityIds,
      user.userId,
      {
        type: type as any,
        priority: priority as any,
        isRead: parseQueryBoolean(isRead),
        facilityId: facilityId as string | undefined,
        facilityIds: !facilityId && !AuthService.canAccessAllFacilities(user.role) ? user.facilityIds : undefined,
        includeExpired: parseQueryBoolean(includeExpired),
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
      },
    );

    res.json({
      success: true,
      notifications: result.notifications,
      total: result.total,
      unreadCount: result.unreadCount,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }),
);

registerGet(
  router,
  '/unread-count',
  {
    openApiPath: `${MOUNT}/unread-count`,
    tags: ['Notifications'],
    summary: 'Get unread notification count for the current user',
    security: 'bearer',
    query: unreadCountQuerySchema,
    responses: {
      200: unreadCountResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const facilityId = req.query.facilityId as string | undefined;

    if (facilityId && !AuthService.canAccessAllFacilities(user.role)) {
      if (!user.facilityIds?.includes(facilityId)) {
        throw new AccessDeniedError('Access denied to this facility');
      }
    }

    const service = NotificationService.getInstance();
    const scope = facilityId
      ? { facilityId }
      : !AuthService.canAccessAllFacilities(user.role) && user.facilityIds?.length
        ? { facilityIds: user.facilityIds }
        : undefined;
    const count = await service.getUnreadCount(user.userId, user.role, scope);

    res.json({
      success: true,
      unreadCount: count,
    });
  }),
);

registerGet(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Notifications'],
    summary: 'Get a single notification by ID',
    security: 'bearer',
    params: notificationIdParamSchema,
    responses: {
      200: notificationResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
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
  }),
);

registerPost(
  router,
  '/:id/read',
  {
    openApiPath: `${MOUNT}/{id}/read`,
    tags: ['Notifications'],
    summary: 'Mark a single notification as read',
    security: 'bearer',
    params: notificationIdParamSchema,
    responses: {
      200: notificationResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
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
  }),
);

registerPost(
  router,
  '/read',
  {
    openApiPath: `${MOUNT}/read`,
    tags: ['Notifications'],
    summary: 'Mark multiple notifications as read',
    security: 'bearer',
    body: markMultipleReadSchema,
    responses: {
      200: markedCountResponseSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { notificationIds } = req.body;

    const service = NotificationService.getInstance();
    const count = await service.markMultipleAsRead(user.userId, user.role, notificationIds);

    res.json({
      success: true,
      markedCount: count,
    });
  }),
);

registerPost(
  router,
  '/read-all',
  {
    openApiPath: `${MOUNT}/read-all`,
    tags: ['Notifications'],
    summary: 'Mark all notifications as read for the current user',
    security: 'bearer',
    body: markAllReadSchema,
    responses: {
      200: markedCountResponseSchema,
      403: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { facilityId } = req.body;

    if (facilityId && !AuthService.canAccessAllFacilities(user.role)) {
      if (!user.facilityIds?.includes(facilityId)) {
        throw new AccessDeniedError('Access denied to this facility');
      }
    }

    const service = NotificationService.getInstance();
    const scope = facilityId
      ? { facilityId }
      : !AuthService.canAccessAllFacilities(user.role) && user.facilityIds?.length
        ? { facilityIds: user.facilityIds }
        : undefined;
    const count = await service.markAllAsRead(
      user.userId,
      user.role,
      user.userId,
      scope,
      user.facilityIds,
    );

    res.json({
      success: true,
      markedCount: count,
    });
  }),
);

registerDelete(
  router,
  '/:id',
  {
    openApiPath: `${MOUNT}/{id}`,
    tags: ['Notifications'],
    summary: 'Delete a notification',
    security: 'bearer',
    params: notificationIdParamSchema,
    responses: {
      200: deleteNotificationResponseSchema,
      404: errorEnvelopeSchema,
    },
  },
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
  }),
);

export { router as notificationsRouter };
