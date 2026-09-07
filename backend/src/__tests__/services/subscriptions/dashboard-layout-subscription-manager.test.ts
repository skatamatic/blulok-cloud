import { DashboardLayoutSubscriptionManager } from '../../../services/subscriptions/dashboard-layout-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';
import { ALL_FACILITIES_ID } from '@/utils/dashboard-assignment.utils';

jest.mock('../../../models/user-widget-layout.model');
jest.mock('../../../models/saved-dashboard.model', () => ({
  SavedDashboardModel: { findById: jest.fn() },
  DashboardAssignmentModel: {
    resolveAssignment: jest.fn().mockResolvedValue(null),
  },
}));

describe('DashboardLayoutSubscriptionManager', () => {
  let manager: DashboardLayoutSubscriptionManager;
  let mockWebSocket: jest.Mocked<WebSocket>;

  const mockClient = {
    userId: 'test-user',
    userRole: UserRole.TENANT,
    subscriptions: new Map(),
    facilityIds: ['facility-1'],
  };

  beforeEach(() => {
    manager = new DashboardLayoutSubscriptionManager();
    mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    } as any;
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
    it('should send resolved API layout payload on subscribe', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: { activeFacilityId: ALL_FACILITIES_ID },
      };

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findPagesWithWidgets = jest.fn().mockResolvedValue({
        pages: [],
        widgetsByPageId: new Map(),
      });

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentData = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe('dashboard_layout_update');
      expect(sentData.data).toHaveProperty('layoutSource');
      expect(sentData.data).toHaveProperty('pages');
      expect(sentData.data).toHaveProperty('layouts');
      expect(Array.isArray(sentData.data.layouts)).toBe(true);
      expect(sentData.data.canEditLayout).toBe(false);
    });

    it('should use activeFacilityId filter when provided', async () => {
      const facilityId = '11111111-1111-1111-1111-111111111111';
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'facility-sub',
        data: { activeFacilityId: facilityId },
      };

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findPagesWithWidgets = jest.fn().mockResolvedValue({
        pages: [],
        widgetsByPageId: new Map(),
      });

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentData = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string);
      expect(sentData.data.layoutSource).toBeDefined();
    });

    it('should handle database errors gracefully', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: {},
      };

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findPagesWithWidgets = jest
        .fn()
        .mockRejectedValue(new Error('Database error'));

      await manager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledTimes(1);
      const sentData = JSON.parse(mockWebSocket.send.mock.calls[0][0] as string);
      expect(sentData.data.layoutSource).toBe('default');
      expect(sentData.data.pages).toEqual([]);
    });
  });

  describe('broadcastResolvedLayoutToUser', () => {
    it('should broadcast to subscribed watchers for a specific user', async () => {
      const mockWebSocket1 = {
        ...mockWebSocket,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      };
      const mockWebSocket2 = {
        ...mockWebSocket,
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      };

      const client1 = { userId: 'user1', userRole: UserRole.TENANT, subscriptions: new Map(), facilityIds: [] };
      const client2 = { userId: 'user2', userRole: UserRole.TENANT, subscriptions: new Map(), facilityIds: [] };

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findPagesWithWidgets = jest.fn().mockResolvedValue({
        pages: [],
        widgetsByPageId: new Map(),
      });

      await manager.handleSubscription(mockWebSocket1, {
        type: 'subscription',
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'sub-user1',
        data: {},
      }, client1);
      await manager.handleSubscription(mockWebSocket2, {
        type: 'subscription',
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'sub-user2',
        data: {},
      }, client2);

      await manager.broadcastResolvedLayoutToUser('user1');

      expect(mockWebSocket1.send).toHaveBeenCalled();
      expect(mockWebSocket2.send).toHaveBeenCalledTimes(1);
    });

    it('should not broadcast if no watchers exist for user', async () => {
      await manager.broadcastResolvedLayoutToUser('nonexistent-user');
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should skip closed WebSocket connections', async () => {
      const closedSocket = { ...mockWebSocket, readyState: WebSocket.CLOSED, send: jest.fn() };
      const client = { userId: 'user1', userRole: UserRole.TENANT, subscriptions: new Map(), facilityIds: [] };

      const { UserWidgetLayoutModel } = require('../../../models/user-widget-layout.model');
      UserWidgetLayoutModel.findPagesWithWidgets = jest.fn().mockResolvedValue({
        pages: [],
        widgetsByPageId: new Map(),
      });

      await manager.handleSubscription(closedSocket, {
        type: 'subscription',
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'sub-closed',
        data: {},
      }, client);

      await manager.broadcastResolvedLayoutToUser('user1');
      expect(closedSocket.send).not.toHaveBeenCalled();
    });
  });
});
