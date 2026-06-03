import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

// Mock the NotificationService - factory must use inline mocks (jest.mock is hoisted)
jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    getInstance: jest.fn().mockReturnValue({
      createNotification: jest.fn(),
      getUserNotifications: jest.fn(),
      getNotificationById: jest.fn(),
      markAsRead: jest.fn(),
      markMultipleAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      deleteNotification: jest.fn(),
      getUnreadCount: jest.fn(),
      notifyAccessGranted: jest.fn(),
      notifyAccessDenied: jest.fn(),
      notifyPasswordReset: jest.fn(),
      notifyUnitAssigned: jest.fn(),
      notifyUnitUnassigned: jest.fn(),
      notifyDeviceRegistered: jest.fn(),
      notifySystemAlert: jest.fn(),
    }),
  },
}));

import { NotificationService } from '@/services/notification.service';

describe('Notifications Routes', () => {
  let app: any;
  let testData: MockTestData;
  let mockService: any;

  beforeAll(async () => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockService = NotificationService.getInstance() as any;

    // Reset and set default mock returns
    mockService.getUserNotifications.mockReset().mockResolvedValue({
      notifications: [
        {
          id: 'notification-1',
          type: 'access_granted',
          title: 'Access Granted',
          message: 'You have been granted access.',
          priority: 'normal',
          isRead: false,
          readAt: null,
          reference: { type: 'unit', id: 'unit-1' },
          facilityId: '550e8400-e29b-41d4-a716-446655440001',
          metadata: null,
          createdAt: new Date(),
        },
      ],
      total: 1,
      unreadCount: 3,
    });
    mockService.getNotificationById.mockReset().mockResolvedValue({
      id: 'notification-1',
      type: 'access_granted',
      title: 'Access Granted',
      message: 'You have been granted access.',
      priority: 'normal',
      isRead: false,
      readAt: null,
      reference: { type: 'unit', id: 'unit-1' },
      facilityId: '550e8400-e29b-41d4-a716-446655440001',
      metadata: null,
      createdAt: new Date(),
    });
    mockService.markAsRead.mockReset().mockResolvedValue({
      id: 'notification-1',
      type: 'access_granted',
      title: 'Access Granted',
      message: 'You have been granted access.',
      priority: 'normal',
      isRead: true,
      readAt: new Date(),
      reference: null,
      facilityId: null,
      metadata: null,
      createdAt: new Date(),
    });
    mockService.markMultipleAsRead.mockReset().mockResolvedValue(3);
    mockService.markAllAsRead.mockReset().mockResolvedValue(10);
    mockService.deleteNotification.mockReset().mockResolvedValue(true);
    mockService.getUnreadCount.mockReset().mockResolvedValue(5);
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all notification endpoints', async () => {
      let response = await request(app).get('/api/v1/notifications');
      expectUnauthorized(response);

      response = await request(app).get('/api/v1/notifications/unread-count');
      expectUnauthorized(response);

      response = await request(app).get('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001');
      expectUnauthorized(response);

      response = await request(app).post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read');
      expectUnauthorized(response);

      response = await request(app).post('/api/v1/notifications/read');
      expectUnauthorized(response);

      response = await request(app).post('/api/v1/notifications/read-all');
      expectUnauthorized(response);

      response = await request(app).delete('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001');
      expectUnauthorized(response);
    }, 30000);
  });

  describe('GET /api/v1/notifications - List Notifications', () => {
    it('should return notifications for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('unreadCount');
      expect(response.body).toHaveProperty('limit');
      expect(response.body).toHaveProperty('offset');
    });

    it('should accept valid filter parameters', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({
          type: 'access_granted',
          priority: 'high',
          isRead: 'false',
          limit: 10,
          offset: 0,
        })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should pass isRead=false filter correctly to service (Joi coercion)', async () => {
      await request(app)
        .get('/api/v1/notifications')
        .query({ isRead: 'false' })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(mockService.getUserNotifications).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isRead: false })
      );
    });

    it('should pass isRead=true filter correctly to service (Joi coercion)', async () => {
      await request(app)
        .get('/api/v1/notifications')
        .query({ isRead: 'true' })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(mockService.getUserNotifications).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isRead: true })
      );
    });

    it('should not pass isRead filter when not provided', async () => {
      await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(mockService.getUserNotifications).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ isRead: undefined })
      );
    });

    it('should accept facilityId filter', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({ facilityId: testData.facilities.facility1.id })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should reject invalid type filter', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({ type: 'invalid_type' })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });

    it('should reject invalid priority filter', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({ priority: 'super_urgent' })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });

    it('should reject limit exceeding max', async () => {
      const response = await request(app)
        .get('/api/v1/notifications')
        .query({ limit: 200 })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });

    it('should work for all user roles', async () => {
      for (const userKey of ['admin', 'facilityAdmin', 'tenant', 'maintenance'] as const) {
        const response = await request(app)
          .get('/api/v1/notifications')
          .set('Authorization', `Bearer ${testData.users[userKey].token}`)
          .expect(200);

        expectSuccess(response);
      }
    });
  });

  describe('GET /api/v1/notifications/unread-count', () => {
    it('should return unread count', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unreadCount');
    });

    it('should return the correct unreadCount value from service', async () => {
      mockService.getUnreadCount.mockResolvedValue(42);

      const response = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(response.body.unreadCount).toBe(42);
    });

    it('should return 0 when no unread notifications', async () => {
      mockService.getUnreadCount.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(response.body.unreadCount).toBe(0);
    });

    it('should accept optional facilityId', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/unread-count')
        .query({ facilityId: testData.facilities.facility1.id })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should pass facilityId to service when provided', async () => {
      const facilityId = testData.facilities.facility1.id;
      await request(app)
        .get('/api/v1/notifications/unread-count')
        .query({ facilityId })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(mockService.getUnreadCount).toHaveBeenCalledWith(
        testData.users.tenant.id,
        testData.users.tenant.role,
        { facilityId }
      );
    });

    it('should reject invalid facilityId format', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/unread-count')
        .query({ facilityId: 'not-a-uuid' })
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });
  });

  describe('GET /api/v1/notifications/:id - Get Single Notification', () => {
    it('should return a notification by ID', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('notification');
    });

    it('should return 404 when notification not found', async () => {
      mockService.getNotificationById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectNotFound(response);
    });

    it('should reject invalid UUID format', async () => {
      const response = await request(app)
        .get('/api/v1/notifications/invalid-id')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });
  });

  describe('POST /api/v1/notifications/:id/read - Mark Single as Read', () => {
    it('should mark notification as read', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('notification');
    });

    it('should return notification with isRead true and readAt timestamp', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(response.body.notification.isRead).toBe(true);
      expect(response.body.notification.readAt).toBeDefined();
    });

    it('should pass correct userId and role to service', async () => {
      await request(app)
        .post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(mockService.markAsRead).toHaveBeenCalledWith(
        testData.users.tenant.id,
        testData.users.tenant.role,
        '550e8400-e29b-41d4-a716-446655440001'
      );
    });

    it('should return 404 when notification not found', async () => {
      mockService.markAsRead.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440099/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectNotFound(response);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/bad-id/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });

    it('should work for all user roles', async () => {
      for (const userKey of ['admin', 'facilityAdmin', 'tenant'] as const) {
        const response = await request(app)
          .post('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001/read')
          .set('Authorization', `Bearer ${testData.users[userKey].token}`)
          .expect(200);

        expectSuccess(response);
      }
    });
  });

  describe('POST /api/v1/notifications/read - Mark Multiple as Read', () => {
    it('should mark multiple notifications as read', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          notificationIds: [
            '550e8400-e29b-41d4-a716-446655440001',
            '550e8400-e29b-41d4-a716-446655440002',
          ],
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('markedCount');
    });

    it('should return the correct markedCount value from service', async () => {
      mockService.markMultipleAsRead.mockResolvedValue(2);

      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          notificationIds: [
            '550e8400-e29b-41d4-a716-446655440001',
            '550e8400-e29b-41d4-a716-446655440002',
          ],
        })
        .expect(200);

      expect(response.body.markedCount).toBe(2);
    });

    it('should pass correct IDs and user context to service', async () => {
      const ids = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ];

      await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ notificationIds: ids })
        .expect(200);

      expect(mockService.markMultipleAsRead).toHaveBeenCalledWith(
        testData.users.tenant.id,
        testData.users.tenant.role,
        ids
      );
    });

    it('should reject empty notificationIds array', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ notificationIds: [] });

      expectBadRequest(response);
    });

    it('should reject missing notificationIds', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({});

      expectBadRequest(response);
    });

    it('should reject non-UUID values in notificationIds', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ notificationIds: ['not-a-uuid'] });

      expectBadRequest(response);
    });

    it('should reject non-array notificationIds', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ notificationIds: 'not-an-array' });

      expectBadRequest(response);
    });
  });

  describe('POST /api/v1/notifications/read-all - Mark All as Read', () => {
    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('markedCount');
    });

    it('should return the correct markedCount from service', async () => {
      mockService.markAllAsRead.mockResolvedValue(7);

      const response = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(200);

      expect(response.body.markedCount).toBe(7);
    });

    it('should pass current userId as both requester and target', async () => {
      await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(200);

      expect(mockService.markAllAsRead).toHaveBeenCalledWith(
        testData.users.tenant.id,
        testData.users.tenant.role,
        testData.users.tenant.id,
        { facilityIds: testData.users.tenant.facilityIds },
        testData.users.tenant.facilityIds,
      );
    });

    it('should accept optional facilityId', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ facilityId: testData.facilities.facility1.id })
        .expect(200);

      expectSuccess(response);
    });

    it('should pass facilityId to service when provided', async () => {
      const facilityId = testData.facilities.facility1.id;
      await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ facilityId })
        .expect(200);

      expect(mockService.markAllAsRead).toHaveBeenCalledWith(
        testData.users.tenant.id,
        testData.users.tenant.role,
        testData.users.tenant.id,
        { facilityId },
        testData.users.tenant.facilityIds,
      );
    });

    it('should reject invalid facilityId', async () => {
      const response = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ facilityId: 'not-a-uuid' });

      expectBadRequest(response);
    });

    it('should return markedCount of 0 when nothing to mark', async () => {
      mockService.markAllAsRead.mockResolvedValue(0);

      const response = await request(app)
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(200);

      expect(response.body.markedCount).toBe(0);
    });
  });

  describe('DELETE /api/v1/notifications/:id - Delete Notification', () => {
    it('should delete a notification', async () => {
      const response = await request(app)
        .delete('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message', 'Notification deleted');
    });

    it('should return 404 when notification not found', async () => {
      mockService.deleteNotification.mockResolvedValue(false);

      const response = await request(app)
        .delete('/api/v1/notifications/550e8400-e29b-41d4-a716-446655440099')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectNotFound(response);
    });

    it('should reject invalid UUID', async () => {
      const response = await request(app)
        .delete('/api/v1/notifications/bad-id')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectBadRequest(response);
    });
  });
});
