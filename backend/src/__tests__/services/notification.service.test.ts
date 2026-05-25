import { NotificationService } from '@/services/notification.service';
import { NotificationModel } from '@/models/notification.model';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { UserRole } from '@/types/auth.types';

// Mock dependencies
jest.mock('@/models/notification.model');
jest.mock('@/services/events/notification-events.service');

describe('NotificationService', () => {
  let service: NotificationService;
  let mockNotificationModel: jest.Mocked<NotificationModel>;
  let mockEventService: jest.Mocked<NotificationEventsService>;

  const mockNotification = {
    id: 'notification-1',
    user_id: 'user-1',
    notification_type: 'access_granted' as const,
    title: 'Access Granted',
    message: 'You have been granted access.',
    priority: 'normal' as const,
    is_read: false,
    read_at: null,
    reference_type: 'unit',
    reference_id: 'unit-1',
    facility_id: 'facility-1',
    metadata: null,
    expires_at: null,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockNotification2 = {
    ...mockNotification,
    id: 'notification-2',
    notification_type: 'unit_assigned' as const,
    title: 'Unit Assigned',
    message: 'You have been assigned to unit B-201.',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockNotificationModel = {
      create: jest.fn().mockResolvedValue(mockNotification),
      findById: jest.fn().mockResolvedValue(mockNotification),
      findByIds: jest.fn().mockResolvedValue([mockNotification]),
      find: jest.fn().mockResolvedValue([mockNotification]),
      count: jest.fn().mockResolvedValue(1),
      getUnreadCount: jest.fn().mockResolvedValue(5),
      markAsRead: jest.fn().mockResolvedValue({ ...mockNotification, is_read: true, read_at: new Date() }),
      markMultipleAsRead: jest.fn().mockResolvedValue(3),
      markAllAsRead: jest.fn().mockResolvedValue(10),
      delete: jest.fn().mockResolvedValue(true),
    } as any;

    mockEventService = {
      emitNotificationCreated: jest.fn(),
      emitNotificationRead: jest.fn(),
      emitNotificationDeleted: jest.fn(),
      emitBatchRead: jest.fn(),
    } as any;

    (NotificationModel as jest.MockedClass<typeof NotificationModel>).mockImplementation(() => mockNotificationModel);
    (NotificationEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);

    // Reset the singleton
    (NotificationService as any).instance = undefined;
    service = NotificationService.getInstance();
  });

  describe('createNotification', () => {
    it('should create a notification and emit event', async () => {
      const result = await service.createNotification({
        userId: 'user-1',
        type: 'access_granted',
        title: 'Access Granted',
        message: 'You have been granted access.',
      });

      expect(result).toBeDefined();
      expect(result.type).toBe('access_granted');
      expect(result.title).toBe('Access Granted');
      expect(result.message).toBe('You have been granted access.');
      expect(result.isRead).toBe(false);
      expect(mockNotificationModel.create).toHaveBeenCalled();
      expect(mockEventService.emitNotificationCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notification-1',
          userId: 'user-1',
          notificationType: 'access_granted',
        })
      );
    });

    it('should create notification with all options including expiry', async () => {
      const result = await service.createNotification({
        userId: 'user-1',
        type: 'unit_assigned',
        title: 'Unit Assigned',
        message: 'You have been assigned to unit A-101.',
        priority: 'high',
        referenceType: 'unit',
        referenceId: 'unit-1',
        facilityId: 'facility-1',
        metadata: { assignedBy: 'admin-1' },
        expiresInDays: 7,
      });

      expect(result).toBeDefined();
      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          notification_type: 'unit_assigned',
          priority: 'high',
          reference_type: 'unit',
          reference_id: 'unit-1',
          facility_id: 'facility-1',
          metadata: { assignedBy: 'admin-1' },
          expires_at: expect.any(Date),
        })
      );
    });

    it('should default priority to normal when not specified', async () => {
      await service.createNotification({
        userId: 'user-1',
        type: 'general',
        title: 'Test',
        message: 'Test message',
      });

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'normal',
        })
      );
    });

    it('should not set expires_at when expiresInDays is not provided', async () => {
      await service.createNotification({
        userId: 'user-1',
        type: 'general',
        title: 'Test',
        message: 'Test message',
      });

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          expires_at: undefined,
        })
      );
    });

    it('should include reference in emitted event when present', async () => {
      await service.createNotification({
        userId: 'user-1',
        type: 'access_granted',
        title: 'Access Granted',
        message: 'Granted',
      });

      expect(mockEventService.emitNotificationCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          reference: { type: 'unit', id: 'unit-1' },
        })
      );
    });
  });

  describe('getNotificationById', () => {
    it('should return notification for the owner', async () => {
      const result = await service.getNotificationById('user-1', UserRole.TENANT, 'notification-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('notification-1');
      expect(result!.type).toBe('access_granted');
      expect(mockNotificationModel.findById).toHaveBeenCalledWith('notification-1');
    });

    it('should return null for non-existent notification', async () => {
      mockNotificationModel.findById.mockResolvedValue(null);

      const result = await service.getNotificationById('user-1', UserRole.TENANT, 'non-existent');

      expect(result).toBeNull();
    });

    it('should throw error when non-owner non-admin tries to view', async () => {
      await expect(
        service.getNotificationById('user-2', UserRole.TENANT, 'notification-1')
      ).rejects.toThrow('Cannot view this notification');
    });

    it('should allow admin to view any notification', async () => {
      const result = await service.getNotificationById('admin-1', UserRole.ADMIN, 'notification-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('notification-1');
    });

    it('should format reference correctly in response', async () => {
      const result = await service.getNotificationById('user-1', UserRole.TENANT, 'notification-1');

      expect(result!.reference).toEqual({ type: 'unit', id: 'unit-1' });
    });

    it('should return null reference when reference fields are missing', async () => {
      mockNotificationModel.findById.mockResolvedValue({
        ...mockNotification,
        reference_type: null,
        reference_id: null,
      } as any);

      const result = await service.getNotificationById('user-1', UserRole.TENANT, 'notification-1');

      expect(result!.reference).toBeNull();
    });
  });

  describe('getUserNotifications', () => {
    it('should get notifications for the requesting user', async () => {
      const result = await service.getUserNotifications(
        'user-1',
        UserRole.TENANT,
        ['facility-1'],
        'user-1',
        {}
      );

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unreadCount).toBe(5);
    });

    it('should throw error when non-admin tries to view other user notifications', async () => {
      await expect(
        service.getUserNotifications(
          'user-1',
          UserRole.TENANT,
          ['facility-1'],
          'user-2',
          {}
        )
      ).rejects.toThrow('Cannot view other user notifications');
    });

    it('should allow admin to view other user notifications', async () => {
      const result = await service.getUserNotifications(
        'admin-1',
        UserRole.ADMIN,
        undefined,
        'user-1',
        {}
      );

      expect(result.notifications).toHaveLength(1);
    });

    it('should pass facility filter when provided and user has access', async () => {
      await service.getUserNotifications(
        'user-1',
        UserRole.FACILITY_ADMIN,
        ['facility-1'],
        'user-1',
        { facilityId: 'facility-1' }
      );

      expect(mockNotificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_id: 'facility-1',
        })
      );
    });

    it('should throw error when user lacks access to requested facility', async () => {
      await expect(
        service.getUserNotifications(
          'user-1',
          UserRole.FACILITY_ADMIN,
          ['facility-1'],
          'user-1',
          { facilityId: 'facility-2' }
        )
      ).rejects.toThrow('Access denied to this facility');
    });

    it('should pass type and priority filters to model', async () => {
      await service.getUserNotifications(
        'user-1',
        UserRole.TENANT,
        ['facility-1'],
        'user-1',
        { type: 'access_granted', priority: 'high', isRead: false }
      );

      expect(mockNotificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'access_granted',
          priority: 'high',
          is_read: false,
        })
      );
    });

    it('should use default limit and offset', async () => {
      await service.getUserNotifications(
        'user-1',
        UserRole.TENANT,
        ['facility-1'],
        'user-1',
        {}
      );

      expect(mockNotificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
          offset: 0,
        })
      );
    });

    it('should use custom limit and offset when provided', async () => {
      await service.getUserNotifications(
        'user-1',
        UserRole.TENANT,
        ['facility-1'],
        'user-1',
        { limit: 10, offset: 20 }
      );

      expect(mockNotificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });
  });

  describe('markAsRead', () => {
    it('should mark notification as read and emit event', async () => {
      const result = await service.markAsRead('user-1', UserRole.TENANT, 'notification-1');

      expect(result).toBeDefined();
      expect(result?.isRead).toBe(true);
      // Service passes pre-fetched notification to avoid redundant SELECT after UPDATE
      expect(mockNotificationModel.markAsRead).toHaveBeenCalledWith('notification-1', expect.objectContaining({ id: 'notification-1' }));
      expect(mockEventService.emitNotificationRead).toHaveBeenCalled();
    });

    it('should throw error when user tries to mark other user notification', async () => {
      mockNotificationModel.findById.mockResolvedValue({ ...mockNotification, user_id: 'other-user' });

      await expect(
        service.markAsRead('user-1', UserRole.TENANT, 'notification-1')
      ).rejects.toThrow('Cannot modify this notification');
    });

    it('should return null when notification does not exist', async () => {
      mockNotificationModel.findById.mockResolvedValue(null);

      const result = await service.markAsRead('user-1', UserRole.TENANT, 'non-existent');

      expect(result).toBeNull();
      expect(mockNotificationModel.markAsRead).not.toHaveBeenCalled();
    });

    it('should allow admin to mark any notification as read', async () => {
      mockNotificationModel.findById.mockResolvedValue({ ...mockNotification, user_id: 'other-user' });

      const result = await service.markAsRead('admin-1', UserRole.ADMIN, 'notification-1');

      expect(result).toBeDefined();
      expect(mockNotificationModel.markAsRead).toHaveBeenCalledWith('notification-1', expect.objectContaining({ user_id: 'other-user' }));
    });

    it('should emit event with correct data', async () => {
      await service.markAsRead('user-1', UserRole.TENANT, 'notification-1');

      expect(mockEventService.emitNotificationRead).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: mockNotification.id,
          userId: mockNotification.user_id,
          notificationType: mockNotification.notification_type,
        })
      );
    });
  });

  describe('markMultipleAsRead', () => {
    it('should mark multiple notifications as read and emit batch event', async () => {
      const ids = ['notification-1', 'notification-2', 'notification-3'];
      mockNotificationModel.findByIds.mockResolvedValue([
        { ...mockNotification, id: 'notification-1' },
        { ...mockNotification, id: 'notification-2' },
        { ...mockNotification, id: 'notification-3' },
      ] as any);

      const result = await service.markMultipleAsRead('user-1', UserRole.TENANT, ids);

      expect(result).toBe(3);
      expect(mockNotificationModel.markMultipleAsRead).toHaveBeenCalledWith(ids);
      expect(mockEventService.emitBatchRead).toHaveBeenCalledWith('user-1', ids);
    });

    it('should return 0 for empty array without calling model', async () => {
      const result = await service.markMultipleAsRead('user-1', UserRole.TENANT, []);

      expect(result).toBe(0);
      expect(mockNotificationModel.markMultipleAsRead).not.toHaveBeenCalled();
    });

    it('should throw when some notification IDs are not found (enumeration protection)', async () => {
      mockNotificationModel.findByIds.mockResolvedValue([
        { ...mockNotification, id: 'notification-1' },
      ] as any);

      await expect(
        service.markMultipleAsRead('user-1', UserRole.TENANT, ['notification-1', 'notification-2'])
      ).rejects.toThrow('Some notifications');
    });

    it('should throw when user does not own all notifications', async () => {
      mockNotificationModel.findByIds.mockResolvedValue([
        { ...mockNotification, id: 'notification-1', user_id: 'user-1' },
        { ...mockNotification, id: 'notification-2', user_id: 'other-user' },
      ] as any);

      await expect(
        service.markMultipleAsRead('user-1', UserRole.TENANT, ['notification-1', 'notification-2'])
      ).rejects.toThrow('Cannot modify some notifications');
    });

    it('should allow admin to mark any user notifications as read', async () => {
      mockNotificationModel.findByIds.mockResolvedValue([
        { ...mockNotification, id: 'notification-1', user_id: 'user-1' },
        { ...mockNotification, id: 'notification-2', user_id: 'user-2' },
      ] as any);

      const result = await service.markMultipleAsRead('admin-1', UserRole.ADMIN, ['notification-1', 'notification-2']);

      expect(result).toBe(3);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all own notifications as read', async () => {
      const result = await service.markAllAsRead('user-1', UserRole.TENANT, 'user-1');

      expect(result).toBe(10);
      expect(mockNotificationModel.markAllAsRead).toHaveBeenCalledWith('user-1', {
        facilityId: undefined,
        facilityIds: undefined,
      });
      expect(mockEventService.emitBatchRead).toHaveBeenCalledWith('user-1', [], {
        facilityId: undefined,
        facilityIds: undefined,
      });
    });

    it('should mark all notifications as read with facility filter', async () => {
      const result = await service.markAllAsRead(
        'user-1',
        UserRole.FACILITY_ADMIN,
        'user-1',
        { facilityId: 'facility-1' },
        ['facility-1'],
      );

      expect(result).toBe(10);
      expect(mockNotificationModel.markAllAsRead).toHaveBeenCalledWith('user-1', {
        facilityId: 'facility-1',
        facilityIds: undefined,
      });
      expect(mockEventService.emitBatchRead).toHaveBeenCalledWith('user-1', [], {
        facilityId: 'facility-1',
        facilityIds: undefined,
      });
    });

    it('should throw error when non-admin tries to mark other user notifications', async () => {
      await expect(
        service.markAllAsRead('user-1', UserRole.TENANT, 'user-2')
      ).rejects.toThrow('Cannot modify other user notifications');
    });

    it('should allow admin to mark all notifications for any user', async () => {
      const result = await service.markAllAsRead('admin-1', UserRole.ADMIN, 'user-1');

      expect(result).toBe(10);
      expect(mockNotificationModel.markAllAsRead).toHaveBeenCalledWith('user-1', {
        facilityId: undefined,
        facilityIds: undefined,
      });
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification and emit event', async () => {
      const result = await service.deleteNotification('user-1', UserRole.TENANT, 'notification-1');

      expect(result).toBe(true);
      expect(mockNotificationModel.delete).toHaveBeenCalledWith('notification-1');
      expect(mockEventService.emitNotificationDeleted).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notification-1',
          userId: 'user-1',
          notificationType: 'access_granted',
        })
      );
    });

    it('should return false when notification does not exist', async () => {
      mockNotificationModel.findById.mockResolvedValue(null);

      const result = await service.deleteNotification('user-1', UserRole.TENANT, 'non-existent');

      expect(result).toBe(false);
      expect(mockNotificationModel.delete).not.toHaveBeenCalled();
      expect(mockEventService.emitNotificationDeleted).not.toHaveBeenCalled();
    });

    it('should throw error when non-owner non-admin tries to delete', async () => {
      mockNotificationModel.findById.mockResolvedValue({ ...mockNotification, user_id: 'other-user' });

      await expect(
        service.deleteNotification('user-1', UserRole.TENANT, 'notification-1')
      ).rejects.toThrow('Cannot delete this notification');
    });

    it('should allow admin to delete any notification', async () => {
      mockNotificationModel.findById.mockResolvedValue({ ...mockNotification, user_id: 'other-user' });

      const result = await service.deleteNotification('admin-1', UserRole.ADMIN, 'notification-1');

      expect(result).toBe(true);
      expect(mockNotificationModel.delete).toHaveBeenCalledWith('notification-1');
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(5);
      expect(mockNotificationModel.getUnreadCount).toHaveBeenCalledWith('user-1', undefined);
    });

    it('should return unread count scoped to facility', async () => {
      const result = await service.getUnreadCount('user-1', { facilityId: 'facility-1' });

      expect(result).toBe(5);
      expect(mockNotificationModel.getUnreadCount).toHaveBeenCalledWith('user-1', {
        facilityId: 'facility-1',
      });
    });
  });

  describe('convenience methods', () => {
    it('should create access granted notification with correct fields', async () => {
      await service.notifyAccessGranted('user-1', 'A-101', 'facility-1', 'unit-1', 'admin-1');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          notification_type: 'access_granted',
          reference_type: 'unit',
          reference_id: 'unit-1',
          facility_id: 'facility-1',
          metadata: { grantedBy: 'admin-1' },
        })
      );
    });

    it('should create access denied notification with high priority', async () => {
      await service.notifyAccessDenied('user-1', 'A-101', 'facility-1', 'unit-1', 'Outside access hours');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'access_denied',
          priority: 'high',
          metadata: { reason: 'Outside access hours' },
        })
      );
    });

    it('should create password reset notification', async () => {
      await service.notifyPasswordReset('user-1');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          notification_type: 'password_reset',
        })
      );
    });

    it('should create unit assigned notification', async () => {
      await service.notifyUnitAssigned('user-1', 'A-101', 'Test Facility', 'facility-1', 'unit-1');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'unit_assigned',
          reference_type: 'unit',
          reference_id: 'unit-1',
          facility_id: 'facility-1',
        })
      );
    });

    it('should create unit unassigned notification', async () => {
      await service.notifyUnitUnassigned('user-1', 'A-101', 'Test Facility', 'facility-1', 'unit-1');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'unit_unassigned',
          reference_type: 'unit',
          reference_id: 'unit-1',
          facility_id: 'facility-1',
        })
      );
    });

    it('should create device registered notification', async () => {
      await service.notifyDeviceRegistered(
        'user-1',
        { name: 'Lock-01', type: 'blulok', id: 'device-1' },
        'facility-1'
      );

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'device_registered',
          reference_type: 'device',
          reference_id: 'device-1',
          facility_id: 'facility-1',
        })
      );
    });

    it('should create system alert notification with custom priority', async () => {
      await service.notifySystemAlert(
        'user-1',
        'System Maintenance',
        'Planned maintenance at midnight.',
        'urgent',
        { scheduledAt: '2026-02-10T00:00:00Z' }
      );

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'system_alert',
          priority: 'urgent',
          metadata: { scheduledAt: '2026-02-10T00:00:00Z' },
        })
      );
    });

    it('should default system alert priority to normal', async () => {
      await service.notifySystemAlert('user-1', 'Info', 'Info message.');

      expect(mockNotificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notification_type: 'system_alert',
          priority: 'normal',
        })
      );
    });
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = NotificationService.getInstance();
      const instance2 = NotificationService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
