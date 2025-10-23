import { DashboardLayoutSubscriptionManager } from '../../../services/subscriptions/dashboard-layout-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

// Mock the UserWidgetLayoutModel
jest.mock('../../../models/user-widget-layout.model');

describe('DashboardLayoutSubscriptionManager', () => {
  let manager: DashboardLayoutSubscriptionManager;
  let mockWebSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    manager = new DashboardLayoutSubscriptionManager();
    mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSubscriptionType', () => {
    it('should return correct subscription type', () => {
      expect(manager.getSubscriptionType()).toBe('dashboard_layout');
    });
  });

  describe('canSubscribe', () => {
    it('should allow any authenticated user to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
    });
  });

  describe('handleSubscription', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.TENANT,
      subscriptions: new Map()
    };

    it('should load and send user layout data', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: {}
      };

      // Mock the UserWidgetLayoutModel
      const mockLayouts = [
        {
          widget_id: 'facilities_stats',
          widget_type: 'stats',
          layout_config: JSON.stringify({
            position: { x: 0, y: 0, w: 3, h: 2 },
            title: 'Facilities'
          })
        }
      ];

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findByUserId = jest.fn().mockResolvedValue(mockLayouts);

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"dashboard_layout_update"')
      );

      // Verify the data structure
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentCall = mockWebSocket.send.mock.calls[0];
      expect(sentCall).toBeDefined();
      expect(sentCall![0]).toBeDefined();
      
      const sentData = JSON.parse(sentCall![0] as string);
      expect(sentData.data.layouts).toHaveProperty('lg');
      expect(sentData.data.widgetInstances).toHaveLength(1);
      expect(sentData.data.widgetInstances[0]).toMatchObject({
        id: 'facilities_stats',
        type: 'stats-facilities',
        title: 'Facilities Count'
      });
    });

    it('should handle empty layout data gracefully', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: {}
      };

      // Mock empty layout data
      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findByUserId = jest.fn().mockResolvedValue([]);

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"dashboard_layout_update"')
      );

      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentCall = mockWebSocket.send.mock.calls[0];
      expect(sentCall).toBeDefined();
      expect(sentCall![0]).toBeDefined();
      
      const sentData = JSON.parse(sentCall![0] as string);
      expect(sentData.data.layouts.lg).toHaveLength(0);
      expect(sentData.data.widgetInstances).toHaveLength(0);
    });

    it('should handle database errors gracefully', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: {}
      };

      // Mock database error
      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.getUserWidgetLayouts = jest.fn().mockRejectedValue(new Error('Database error'));

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"dashboard_layout_update"')
      );

      // Should send empty data as fallback
      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentCall = mockWebSocket.send.mock.calls[0];
      expect(sentCall).toBeDefined();
      expect(sentCall![0]).toBeDefined();
      
      const sentData = JSON.parse(sentCall![0] as string);
      expect(sentData.data.layouts.lg).toHaveLength(0);
      expect(sentData.data.widgetInstances).toHaveLength(0);
    });
  });

  describe('broadcastLayoutUpdate', () => {
    it('should broadcast to all watchers for a specific user', () => {
      const mockWebSocket1 = { 
        ...mockWebSocket, 
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      const mockWebSocket2 = { 
        ...mockWebSocket, 
        readyState: WebSocket.OPEN,
        send: jest.fn()
      };
      
      const mockClient1 = { userId: 'user1', userRole: UserRole.TENANT, subscriptions: new Map() };
      const mockClient2 = { userId: 'user2', userRole: UserRole.TENANT, subscriptions: new Map() };

      // Add watchers for different users using the overridden addWatcher method
      manager['addWatcher']('sub1', mockWebSocket1, mockClient1);
      manager['addWatcher']('sub2', mockWebSocket2, mockClient2);

      const testLayouts = { lg: [{ i: 'widget1', x: 0, y: 0, w: 3, h: 2 }] };
      const testInstances = [{ id: 'widget1', type: 'facilities', title: 'Facilities' }];

      // Broadcast to user1 only
      manager.broadcastLayoutUpdate('user1', testLayouts, testInstances);

      // Only user1's WebSocket should receive the message
      expect(mockWebSocket1.send).toHaveBeenCalled();
      expect(mockWebSocket2.send).not.toHaveBeenCalled();
    });

    it('should not broadcast if no watchers exist for user', () => {
      const testLayouts = { lg: [] };
      const testInstances: any[] = [];

      manager.broadcastLayoutUpdate('nonexistent-user', testLayouts, testInstances);

      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should handle closed WebSocket connections', () => {
      const mockClosedWebSocket = { ...mockWebSocket, readyState: WebSocket.CLOSED };
      const mockClient = { userId: 'user1', userRole: UserRole.TENANT, subscriptions: new Map() };

      manager['addWatcher']('sub1', mockClosedWebSocket, mockClient);

      const testLayouts = { lg: [] };
      const testInstances: any[] = [];

      manager.broadcastLayoutUpdate('user1', testLayouts, testInstances);

      // Should not send to closed WebSocket
      expect(mockClosedWebSocket.send).not.toHaveBeenCalled();
    });
  });

  // Note: getWidgetSizeFromGrid method was removed from the class
});
