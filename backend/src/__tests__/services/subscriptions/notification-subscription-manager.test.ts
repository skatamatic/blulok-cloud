import { NotificationSubscriptionManager } from '@/services/subscriptions/notification-subscription-manager';
import { NotificationModel } from '@/models/notification.model';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { UserRole } from '@/types/auth.types';

// Mock dependencies
jest.mock('@/models/notification.model');
jest.mock('@/services/events/notification-events.service');

describe('NotificationSubscriptionManager', () => {
  let manager: NotificationSubscriptionManager;
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
    facility_id: 'facility-1',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockClient = {
    userId: 'user-1',
    userRole: UserRole.TENANT,
    subscriptions: new Map(),
    facilityIds: ['facility-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockNotificationModel = {
      getUnreadCount: jest.fn().mockResolvedValue(5),
      find: jest.fn().mockResolvedValue([mockNotification]),
    } as any;

    mockEventService = {
      onNotificationCreated: jest.fn().mockReturnValue(() => {}),
      onNotificationRead: jest.fn().mockReturnValue(() => {}),
      onBatchRead: jest.fn().mockReturnValue(() => {}),
      onBatchHidden: jest.fn().mockReturnValue(() => {}),
      onNotificationDeleted: jest.fn().mockReturnValue(() => {}),
    } as any;

    (NotificationModel as jest.MockedClass<typeof NotificationModel>).mockImplementation(() => mockNotificationModel);
    (NotificationEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);

    manager = new NotificationSubscriptionManager();
  });

  describe('getSubscriptionType', () => {
    it('should return notifications', () => {
      expect(manager.getSubscriptionType()).toBe('notifications');
    });
  });

  describe('canSubscribe', () => {
    it('should allow all user roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
    });
  });

  describe('handleSubscription', () => {
    it('should subscribe and send initial data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const result = await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'notifications' },
        mockClient
      );

      expect(result).toBe(true);
      expect(mockNotificationModel.getUnreadCount).toHaveBeenCalledWith('user-1', {
        facilityId: undefined,
        facilityIds: ['facility-1'],
        excludeNotificationTypes: ['backend_error'],
      });
      expect(mockNotificationModel.find).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalled();

      // Verify the message format
      const sentMessage = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('notifications_update');
      expect(sentMessage.data.unreadCount).toBe(5);
      expect(sentMessage.data.recentNotifications).toHaveLength(1);
    });
  });

  describe('event listeners', () => {
    it('should setup event listeners on construction', () => {
      expect(mockEventService.onNotificationCreated).toHaveBeenCalled();
      expect(mockEventService.onNotificationRead).toHaveBeenCalled();
      expect(mockEventService.onBatchRead).toHaveBeenCalled();
    });

    it('should setup onNotificationDeleted listener', () => {
      expect(mockEventService.onNotificationDeleted).toHaveBeenCalled();
    });
  });

  describe('read event broadcasting', () => {
    let mockWs: any;

    beforeEach(async () => {
      mockWs = {
        send: jest.fn(),
        readyState: 1, // WebSocket.OPEN
      };

      // Subscribe the mock client so they are tracked as a watcher
      await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'notifications' },
        mockClient
      );

      // Clear the initial subscription send calls
      mockWs.send.mockClear();
    });

    it('should broadcast notification_read when single read event fires', async () => {
      // Get the handler that was registered for onNotificationRead
      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];

      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'user-1',
        notificationType: 'access_granted',
        priority: 'normal',
        readAt: new Date('2025-01-15T10:00:00Z'),
        timestamp: new Date(),
      });

      // Should have sent 2 messages: notification_read + notifications_count_update
      expect(mockWs.send).toHaveBeenCalled();
      const messages = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));

      const readMsg = messages.find((m: any) => m.type === 'notification_read');
      expect(readMsg).toBeDefined();
      expect(readMsg.data.notificationId).toBe('notification-1');
      expect(readMsg.data.readAt).toBe('2025-01-15T10:00:00.000Z');

      // Should also broadcast updated unread count
      const countMsg = messages.find((m: any) => m.type === 'notifications_count_update');
      expect(countMsg).toBeDefined();
      expect(countMsg.data.unreadCount).toBe(5);
    });

    it('should broadcast notifications_batch_read when batch read event fires', async () => {
      const batchHandler = mockEventService.onBatchRead.mock.calls[0][0];

      await batchHandler({
        userId: 'user-1',
        notificationIds: ['notification-1', 'notification-2'],
        facilityId: 'facility-1',
        timestamp: new Date(),
      });

      expect(mockWs.send).toHaveBeenCalled();
      const messages = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));

      const batchMsg = messages.find((m: any) => m.type === 'notifications_batch_read');
      expect(batchMsg).toBeDefined();
      expect(batchMsg.data.notificationIds).toEqual(['notification-1', 'notification-2']);
      expect(batchMsg.data.facilityId).toBe('facility-1');

      // Should also broadcast updated unread count
      const countMsg = messages.find((m: any) => m.type === 'notifications_count_update');
      expect(countMsg).toBeDefined();
    });

    it('should broadcast updated unread count after read events', async () => {
      mockNotificationModel.getUnreadCount.mockResolvedValue(3);

      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];

      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'user-1',
        notificationType: 'access_granted',
        priority: 'normal',
        readAt: new Date(),
        timestamp: new Date(),
      });

      const messages = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      const countMsg = messages.find((m: any) => m.type === 'notifications_count_update');
      expect(countMsg.data.unreadCount).toBe(3);
    });

    it('should not broadcast to a different user', async () => {
      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];

      // Fire event for a different user
      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'different-user',
        notificationType: 'access_granted',
        priority: 'normal',
        readAt: new Date(),
        timestamp: new Date(),
      });

      // Should not have received any messages since the subscribed user is 'user-1'
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should not send to closed WebSocket connections', async () => {
      // Simulate the WebSocket being closed
      mockWs.readyState = 3; // WebSocket.CLOSED

      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];

      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'user-1',
        notificationType: 'access_granted',
        priority: 'normal',
        readAt: new Date(),
        timestamp: new Date(),
      });

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should broadcast batch read with mark-all (empty IDs array)', async () => {
      const batchHandler = mockEventService.onBatchRead.mock.calls[0][0];

      // mark-all sends empty notificationIds array
      await batchHandler({
        userId: 'user-1',
        notificationIds: [],
        facilityId: undefined,
        timestamp: new Date(),
      });

      expect(mockWs.send).toHaveBeenCalled();
      const messages = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));

      const batchMsg = messages.find((m: any) => m.type === 'notifications_batch_read');
      expect(batchMsg).toBeDefined();
      expect(batchMsg.data.notificationIds).toEqual([]);
    });
  });

  describe('destroy', () => {
    it('should call cleanup functions when destroyed', () => {
      // The cleanup functions are returned by the on* event handlers
      const cleanupCreated = jest.fn();
      const cleanupRead = jest.fn();
      const cleanupBatch = jest.fn();
      const cleanupDeleted = jest.fn();

      mockEventService.onNotificationCreated.mockReturnValue(cleanupCreated);
      mockEventService.onNotificationRead.mockReturnValue(cleanupRead);
      mockEventService.onBatchRead.mockReturnValue(cleanupBatch);
      mockEventService.onNotificationDeleted.mockReturnValue(cleanupDeleted);

      // Create a new manager to pick up these return values
      const newManager = new NotificationSubscriptionManager();
      newManager.destroy();

      expect(cleanupCreated).toHaveBeenCalled();
      expect(cleanupRead).toHaveBeenCalled();
      expect(cleanupBatch).toHaveBeenCalled();
      expect(cleanupDeleted).toHaveBeenCalled();
    });
  });
});
