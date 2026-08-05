import { NotificationSubscriptionManager } from '@/services/subscriptions/notification-subscription-manager';
import { NotificationModel } from '@/models/notification.model';
import { NotificationEventsService } from '@/services/events/notification-events.service';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

jest.mock('@/models/notification.model');
jest.mock('@/services/events/notification-events.service');

const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_FACILITY_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';

const openWs = () =>
  ({
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  }) as any;

describe('NotificationSubscriptionManager', () => {
  let manager: NotificationSubscriptionManager;
  let mockNotificationModel: {
    getUnreadCount: jest.Mock;
    find: jest.Mock;
  };
  let mockEventService: {
    onNotificationCreated: jest.Mock;
    onNotificationRead: jest.Mock;
    onBatchRead: jest.Mock;
    onBatchHidden: jest.Mock;
    onNotificationDeleted: jest.Mock;
  };

  const mockNotification = {
    id: 'notification-1',
    user_id: 'user-1',
    notification_type: 'access_granted' as const,
    title: 'Access Granted',
    message: 'You have been granted access.',
    priority: 'normal' as const,
    is_read: false,
    read_at: null,
    facility_id: TEST_FACILITY_ID,
    reference_type: 'unit',
    reference_id: 'unit-1',
    metadata: { foo: 'bar' },
    created_at: new Date('2025-01-01T00:00:00Z'),
    updated_at: new Date(),
  };

  const tenantClient = {
    userId: 'user-1',
    userRole: UserRole.TENANT,
    subscriptions: new Map(),
    facilityIds: [TEST_FACILITY_ID],
  };

  const adminClient = {
    userId: 'user-1',
    userRole: UserRole.ADMIN,
    subscriptions: new Map(),
    facilityIds: undefined as string[] | undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockNotificationModel = {
      getUnreadCount: jest.fn().mockResolvedValue(5),
      find: jest.fn().mockResolvedValue([mockNotification]),
    };

    mockEventService = {
      onNotificationCreated: jest.fn().mockReturnValue(() => {}),
      onNotificationRead: jest.fn().mockReturnValue(() => {}),
      onBatchRead: jest.fn().mockReturnValue(() => {}),
      onBatchHidden: jest.fn().mockReturnValue(() => {}),
      onNotificationDeleted: jest.fn().mockReturnValue(() => {}),
    };

    (NotificationModel as jest.MockedClass<typeof NotificationModel>).mockImplementation(
      () => mockNotificationModel as any,
    );
    (NotificationEventsService.getInstance as jest.Mock).mockReturnValue(mockEventService);

    manager = new NotificationSubscriptionManager();
  });

  describe('basics', () => {
    it('returns notifications type and allows all roles', () => {
      expect(manager.getSubscriptionType()).toBe('notifications');
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    });

    it('registers all event listeners', () => {
      expect(mockEventService.onNotificationCreated).toHaveBeenCalled();
      expect(mockEventService.onNotificationRead).toHaveBeenCalled();
      expect(mockEventService.onBatchRead).toHaveBeenCalled();
      expect(mockEventService.onBatchHidden).toHaveBeenCalled();
      expect(mockEventService.onNotificationDeleted).toHaveBeenCalled();
    });

    it('destroy invokes cleanup functions', () => {
      const cleanups = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()];
      mockEventService.onNotificationCreated.mockReturnValue(cleanups[0]);
      mockEventService.onNotificationRead.mockReturnValue(cleanups[1]);
      mockEventService.onBatchRead.mockReturnValue(cleanups[2]);
      mockEventService.onNotificationDeleted.mockReturnValue(cleanups[3]);
      mockEventService.onBatchHidden.mockReturnValue(cleanups[4]);

      const m = new NotificationSubscriptionManager();
      m.destroy();
      cleanups.forEach((fn) => expect(fn).toHaveBeenCalled());
    });

    it('broadcastUpdate is a no-op', async () => {
      await expect(manager.broadcastUpdate()).resolves.toBeUndefined();
    });
  });

  describe('handleSubscription', () => {
    it('subscribes and formats notifications with reference', async () => {
      const ws = openWs();
      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-1' },
        tenantClient,
      );

      expect(result).toBe(true);
      expect(mockNotificationModel.getUnreadCount).toHaveBeenCalledWith('user-1', {
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID],
        excludeNotificationTypes: ['backend_error'],
      });

      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('notifications_update');
      expect(msg.data.recentNotifications[0]).toMatchObject({
        id: 'notification-1',
        reference: { type: 'unit', id: 'unit-1' },
        metadata: { foo: 'bar' },
        isRead: false,
      });
    });

    it('rejects facility the user cannot access', async () => {
      const ws = openWs();
      const result = await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          data: { facilityId: TEST_FACILITY_ID_2 },
        },
        tenantClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('facility');
    });

    it('accepts facility_id alias and scopes subscription', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-fac',
          data: { facility_id: TEST_FACILITY_ID },
        },
        tenantClient,
      );

      expect(mockNotificationModel.getUnreadCount).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ facilityId: TEST_FACILITY_ID }),
      );
    });

    it('filters facilityIds to allowed facilities for non-admins', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-ids',
          data: { facilityIds: [TEST_FACILITY_ID, TEST_FACILITY_ID_2] },
        },
        tenantClient,
      );

      expect(mockNotificationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          facility_ids: [TEST_FACILITY_ID],
        }),
      );
    });

    it('uses facility_ids snake_case alias', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-snake',
          data: { facility_ids: [TEST_FACILITY_ID] },
        },
        tenantClient,
      );

      expect((manager as any).subscriptionFilters.get('sub-snake')).toEqual({
        facilityIds: [TEST_FACILITY_ID],
      });
    });

    it('admin with no filters keeps empty scope', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-admin' },
        adminClient,
      );
      expect((manager as any).subscriptionFilters.get('sub-admin')).toEqual({});
    });

    it('sends error when initial load fails', async () => {
      const ws = openWs();
      mockNotificationModel.getUnreadCount.mockRejectedValue(new Error('db'));
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-err' },
        tenantClient,
      );
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Failed to load initial notification data');
    });

    it('formats notifications without reference as null', async () => {
      const ws = openWs();
      mockNotificationModel.find.mockResolvedValue([
        { ...mockNotification, reference_type: null, reference_id: null },
      ]);
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-noref' },
        tenantClient,
      );
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.recentNotifications[0].reference).toBeNull();
    });
  });

  describe('handleUnsubscription / cleanup', () => {
    it('requires subscription ID', () => {
      const ws = openWs();
      manager.handleUnsubscription(ws, { type: 'unsubscription' }, tenantClient);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Subscription ID required');
    });

    it('removes subscription state', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-u' },
        tenantClient,
      );
      manager.handleUnsubscription(
        ws,
        { type: 'unsubscription', subscriptionId: 'sub-u' },
        tenantClient,
      );
      expect((manager as any).subscriptionFilters.has('sub-u')).toBe(false);
    });

    it('cleanup removes empty watcher sets', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-c' },
        tenantClient,
      );
      manager.cleanup(ws, tenantClient);
      expect((manager as any).watchers.has('sub-c')).toBe(false);
    });
  });

  describe('created / deleted / hidden events', () => {
    let ws: any;

    beforeEach(async () => {
      ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-evt' },
        tenantClient,
      );
      ws.send.mockClear();
    });

    it('broadcasts notification_created and unread count', async () => {
      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-2',
        userId: 'user-1',
        notificationType: 'access_granted',
        title: 'Hi',
        message: 'There',
        priority: 'normal',
        facilityId: TEST_FACILITY_ID,
        reference: { type: 'unit', id: 'u1' },
        metadata: null,
        timestamp: new Date('2025-01-02T00:00:00Z'),
      });

      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_created')).toMatchObject({
        data: { notificationId: 'n-2', facilityId: TEST_FACILITY_ID },
      });
      expect(messages.find((m: any) => m.type === 'notifications_count_update')).toBeDefined();
    });

    it('skips created events for other users', async () => {
      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-2',
        userId: 'other',
        notificationType: 'access_granted',
        title: 'Hi',
        message: 'There',
        priority: 'normal',
        facilityId: TEST_FACILITY_ID,
        timestamp: new Date(),
      });
      expect(ws.send).not.toHaveBeenCalled();
    });

    it('skips created events outside facility scope', async () => {
      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-2',
        userId: 'user-1',
        notificationType: 'access_granted',
        title: 'Hi',
        message: 'There',
        priority: 'normal',
        facilityId: TEST_FACILITY_ID_2,
        timestamp: new Date(),
      });
      // count update may still fire; created should not
      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_created')).toBeUndefined();
    });

    it('skips backend_error created events for non-dev roles', async () => {
      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-2',
        userId: 'user-1',
        notificationType: 'backend_error',
        title: 'Err',
        message: 'Boom',
        priority: 'high',
        facilityId: TEST_FACILITY_ID,
        timestamp: new Date(),
      });
      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_created')).toBeUndefined();
    });

    it('broadcasts notification_deleted', async () => {
      const handler = mockEventService.onNotificationDeleted.mock.calls[0][0];
      await handler({
        notificationId: 'notification-1',
        userId: 'user-1',
        facilityId: TEST_FACILITY_ID,
        timestamp: new Date(),
      });
      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_deleted')).toBeDefined();
    });

    it('broadcasts notifications_batch_hidden', async () => {
      const handler = mockEventService.onBatchHidden.mock.calls[0][0];
      await handler({
        userId: 'user-1',
        facilityId: TEST_FACILITY_ID,
        facilityIds: undefined,
        timestamp: new Date(),
      });
      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_hidden')).toBeDefined();
    });

    it('matches batch scope via facilityIds overlap', async () => {
      // Re-subscribe with facilityIds scope
      const scopedWs = openWs();
      await manager.handleSubscription(
        scopedWs,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-batch-scope',
          data: { facilityIds: [TEST_FACILITY_ID] },
        },
        tenantClient,
      );
      scopedWs.send.mockClear();

      const handler = mockEventService.onBatchRead.mock.calls[0][0];
      await handler({
        userId: 'user-1',
        notificationIds: ['a'],
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID, TEST_FACILITY_ID_2],
        timestamp: new Date(),
      });

      const messages = scopedWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeDefined();
    });

    it('does not send to closed sockets; swallows send errors', async () => {
      const closed = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;
      const bad = {
        send: jest.fn(() => {
          throw new Error('fail');
        }),
        readyState: WebSocket.OPEN,
      } as any;
      (manager as any).watchers.get('sub-evt').add(closed);
      (manager as any).watchers.get('sub-evt').add(bad);

      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await expect(
        handler({
          notificationId: 'n-2',
          userId: 'user-1',
          notificationType: 'access_granted',
          title: 'Hi',
          message: 'There',
          priority: 'normal',
          facilityId: TEST_FACILITY_ID,
          timestamp: new Date(),
        }),
      ).resolves.toBeUndefined();
      expect(closed.send).not.toHaveBeenCalled();
    });
  });

  describe('read event broadcasting', () => {
    let mockWs: any;

    beforeEach(async () => {
      mockWs = openWs();
      await manager.handleSubscription(
        mockWs,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-read' },
        tenantClient,
      );
      mockWs.send.mockClear();
    });

    it('broadcasts notification_read and count update', async () => {
      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];
      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'user-1',
        notificationType: 'access_granted',
        priority: 'normal',
        facilityId: TEST_FACILITY_ID,
        readAt: new Date('2025-01-15T10:00:00Z'),
        timestamp: new Date(),
      });

      const messages = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_read').data.readAt).toBe(
        '2025-01-15T10:00:00.000Z',
      );
      expect(messages.find((m: any) => m.type === 'notifications_count_update')).toBeDefined();
    });

    it('does not broadcast to a different user', async () => {
      const readHandler = mockEventService.onNotificationRead.mock.calls[0][0];
      await readHandler({
        eventType: 'read',
        notificationId: 'notification-1',
        userId: 'different-user',
        notificationType: 'access_granted',
        priority: 'normal',
        readAt: new Date(),
        timestamp: new Date(),
      });
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('facility-scoped subscription matching', () => {
    it('rejects created events with no facility when scoped to a facility', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-scoped-fac',
          data: { facilityId: TEST_FACILITY_ID },
        },
        tenantClient,
      );
      ws.send.mockClear();

      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-2',
        userId: 'user-1',
        notificationType: 'access_granted',
        title: 'Hi',
        message: 'There',
        priority: 'normal',
        facilityId: undefined,
        timestamp: new Date(),
      });

      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_created')).toBeUndefined();
    });

    it('denies canSubscribe override', async () => {
      const ws = openWs();
      jest.spyOn(manager, 'canSubscribe').mockReturnValue(false);
      const result = await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications' },
        tenantClient,
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Access denied');
    });

    it('matches batch read when event facilityId is set', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-batch-fac',
          data: { facilityId: TEST_FACILITY_ID },
        },
        tenantClient,
      );
      ws.send.mockClear();

      const handler = mockEventService.onBatchRead.mock.calls[0][0];
      await handler({
        userId: 'user-1',
        notificationIds: ['a'],
        facilityId: TEST_FACILITY_ID,
        facilityIds: undefined,
        timestamp: new Date(),
      });

      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeDefined();
    });

    it('matches batch facilityIds against single-facility subscription', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'notifications',
          subscriptionId: 'sub-batch-single',
          data: { facilityId: TEST_FACILITY_ID },
        },
        tenantClient,
      );
      ws.send.mockClear();

      const handler = mockEventService.onBatchRead.mock.calls[0][0];
      await handler({
        userId: 'user-1',
        notificationIds: [],
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID_2],
        timestamp: new Date(),
      });
      let messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeUndefined();

      ws.send.mockClear();
      await handler({
        userId: 'user-1',
        notificationIds: [],
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID],
        timestamp: new Date(),
      });
      messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeDefined();
    });

    it('matches unscoped tenant batch against client facilityIds', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-batch-client' },
        tenantClient,
      );
      (manager as any).subscriptionFilters.set('sub-batch-client', {});
      ws.send.mockClear();

      const handler = mockEventService.onBatchRead.mock.calls[0][0];
      await handler({
        userId: 'user-1',
        notificationIds: [],
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID_2],
        timestamp: new Date(),
      });
      let messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeUndefined();

      ws.send.mockClear();
      await handler({
        userId: 'user-1',
        notificationIds: [],
        facilityId: undefined,
        facilityIds: [TEST_FACILITY_ID],
        timestamp: new Date(),
      });
      messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notifications_batch_read')).toBeDefined();
    });

    it('allows unscoped admin to receive facility-less notifications', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-admin-open' },
        adminClient,
      );
      ws.send.mockClear();

      const handler = mockEventService.onNotificationCreated.mock.calls[0][0];
      await handler({
        notificationId: 'n-3',
        userId: 'user-1',
        notificationType: 'access_granted',
        title: 'Hi',
        message: 'There',
        priority: 'normal',
        facilityId: undefined,
        timestamp: new Date(),
      });

      const messages = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
      expect(messages.find((m: any) => m.type === 'notification_created')).toBeDefined();
    });

    it('swallows send errors on unread count broadcast', async () => {
      const ws = openWs();
      await manager.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'notifications', subscriptionId: 'sub-count-err' },
        tenantClient,
      );
      ws.send.mockClear();
      ws.send.mockImplementation(() => {
        throw new Error('count fail');
      });

      const handler = mockEventService.onNotificationRead.mock.calls[0][0];
      await expect(
        handler({
          eventType: 'read',
          notificationId: 'notification-1',
          userId: 'user-1',
          notificationType: 'access_granted',
          priority: 'normal',
          facilityId: TEST_FACILITY_ID,
          readAt: new Date(),
          timestamp: new Date(),
        }),
      ).resolves.toBeUndefined();
    });
  });
});
