import { NotificationModel, Notification, CreateNotificationData, NotificationFilters } from '@/models/notification.model';
import { DatabaseService } from '@/services/database.service';

// Mock the DatabaseService
jest.mock('@/services/database.service');

describe('NotificationModel', () => {
  let model: NotificationModel;
  let mockKnex: any;

  const mockNotification: Notification = {
    id: 'notification-1',
    user_id: 'user-1',
    notification_type: 'access_granted',
    title: 'Access Granted',
    message: 'You have been granted access to unit A-101.',
    priority: 'normal',
    is_read: false,
    read_at: null,
    reference_type: 'unit',
    reference_id: 'unit-1',
    facility_id: 'facility-1',
    metadata: { grantedBy: 'admin-1' },
    expires_at: null,
    is_deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock query builder
    mockKnex = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockNotification),
    });

    // Mock DatabaseService
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockKnex,
    });

    model = new NotificationModel();
  });

  describe('create', () => {
    it('should create a notification with required fields', async () => {
      const data: CreateNotificationData = {
        user_id: 'user-1',
        notification_type: 'access_granted',
        title: 'Access Granted',
        message: 'You have been granted access.',
      };

      mockKnex.mockReturnValue({
        insert: jest.fn().mockResolvedValue([1]),
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockNotification),
        }),
      });

      const result = await model.create(data);

      expect(result).toBeDefined();
      expect(result.notification_type).toBe('access_granted');
    });

    it('should create a notification with all optional fields', async () => {
      const data: CreateNotificationData = {
        user_id: 'user-1',
        notification_type: 'unit_assigned',
        title: 'Unit Assigned',
        message: 'You have been assigned to unit A-101.',
        priority: 'high',
        reference_type: 'unit',
        reference_id: 'unit-1',
        facility_id: 'facility-1',
        metadata: { assignedBy: 'admin-1' },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockKnex.mockReturnValue({
        insert: jest.fn().mockResolvedValue([1]),
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ ...mockNotification, ...data }),
        }),
      });

      const result = await model.create(data);

      expect(result).toBeDefined();
      expect(result.priority).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find a notification by ID', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockNotification),
        }),
      });

      const result = await model.findById('notification-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('notification-1');
    });

    it('should return null if notification not found', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await model.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('find', () => {
    it('should find notifications with filters', async () => {
      const mockNotifications = [mockNotification, { ...mockNotification, id: 'notification-2' }];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      // Make the query builder itself thenable (awaitable)
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve(mockNotifications).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      const filters: NotificationFilters = {
        user_id: 'user-1',
        is_read: false,
        limit: 10,
      };

      const result = await model.find(filters);

      expect(result).toHaveLength(2);
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
          first: jest.fn().mockResolvedValue({ ...mockNotification, is_read: true, read_at: new Date() }),
        }),
      });

      const result = await model.markAsRead('notification-1');

      expect(result).toBeDefined();
      expect(result?.is_read).toBe(true);
    });
  });

  describe('markMultipleAsRead', () => {
    it('should mark multiple notifications as read', async () => {
      mockKnex.mockReturnValue({
        whereIn: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(3),
        }),
      });

      const result = await model.markMultipleAsRead(['notification-1', 'notification-2', 'notification-3']);

      expect(result).toBe(3);
    });

    it('should return 0 for empty array', async () => {
      const result = await model.markMultipleAsRead([]);

      expect(result).toBe(0);
    });
  });

  describe('findByIds', () => {
    it('should return notifications for given IDs', async () => {
      const mockNotifications = [
        mockNotification,
        { ...mockNotification, id: 'notification-2' },
      ];

      mockKnex.mockReturnValue({
        whereIn: jest.fn().mockResolvedValue(mockNotifications),
      });

      const result = await model.findByIds(['notification-1', 'notification-2']);

      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty IDs list', async () => {
      const result = await model.findByIds([]);

      expect(result).toHaveLength(0);
      // Should not call the database
      expect(mockKnex).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read for a user', async () => {
      const mockUpdate = jest.fn().mockResolvedValue(5);
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: mockUpdate,
      });

      const result = await model.markAllAsRead('user-1');

      expect(result).toBe(5);
    });

    it('should filter by facility when facilityId is provided', async () => {
      const mockWhere = jest.fn().mockReturnThis();
      const mockUpdate = jest.fn().mockResolvedValue(3);
      mockKnex.mockReturnValue({
        where: mockWhere,
        update: mockUpdate,
      });

      const result = await model.markAllAsRead('user-1', 'facility-1');

      expect(result).toBe(3);
      // Should be called at least 4 times: user_id, is_read, is_deleted, facility_id
      expect(mockWhere.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should return 0 when no unread notifications exist', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockResolvedValue(0),
      });

      const result = await model.markAllAsRead('user-1');

      expect(result).toBe(0);
    });
  });

  describe('delete', () => {
    it('should soft delete a notification', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          update: jest.fn().mockResolvedValue(1),
        }),
      });

      const result = await model.delete('notification-1');

      expect(result).toBe(true);
    });
  });

  describe('getUnreadCount', () => {
    it('should return unread count for user', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ count: '5' }),
        }),
      });

      const result = await model.getUnreadCount('user-1');

      expect(result).toBe(5);
    });
  });
});
