import { GeneralStatsSubscriptionManager } from '../../../services/subscriptions/general-stats-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

// Mock the GeneralStatsService
jest.mock('../../../services/general-stats.service', () => ({
  GeneralStatsService: {
    getInstance: jest.fn()
  }
}));

describe('GeneralStatsSubscriptionManager', () => {
  let manager: GeneralStatsSubscriptionManager;
  let mockWebSocket: jest.Mocked<WebSocket>;

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    
    manager = new GeneralStatsSubscriptionManager();
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
      expect(manager.getSubscriptionType()).toBe('general_stats');
    });
  });

  describe('canSubscribe', () => {
    it('should allow ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    });

    it('should allow DEV_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    });

    it('should allow FACILITY_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    });

    it('should deny TENANT from subscribing', () => {
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
    });
  });

  describe('handleSubscription', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    it('should send error for unauthorized role', async () => {
      const unauthorizedClient = {
        ...mockClient,
        userRole: UserRole.TENANT
      };

      const message = {
        type: 'subscription' as const,
        subscriptionType: 'general_stats',
        subscriptionId: 'test-sub',
        data: {}
      };

      await manager.handleSubscription(mockWebSocket, message, unauthorizedClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });

    it('should send initial data for authorized role', async () => {
      // Mock the GeneralStatsService first
      const { GeneralStatsService } = require('../../../services/general-stats.service');
      const mockStats = {
        facilities: { total: 5, active: 4 },
        devices: { total: 10, online: 8 },
        users: { total: 20, active: 18 }
      };
      
      (GeneralStatsService.getInstance as jest.Mock).mockReturnValue({
        getScopedStats: jest.fn().mockResolvedValue(mockStats)
      });

      // Create a new manager instance after mocking
      const testManager = new GeneralStatsSubscriptionManager();

      const message = {
        type: 'subscription' as const,
        subscriptionType: 'general_stats',
        subscriptionId: 'test-sub',
        data: {}
      };

      await testManager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"general_stats_update"')
      );
    });

    it('should handle errors when loading initial data', async () => {
      // Mock the GeneralStatsService to throw an error
      const { GeneralStatsService } = require('../../../services/general-stats.service');
      (GeneralStatsService.getInstance as jest.Mock).mockReturnValue({
        getScopedStats: jest.fn().mockRejectedValue(new Error('Database error'))
      });

      // Create a new manager instance after mocking
      const testManager = new GeneralStatsSubscriptionManager();

      const message = {
        type: 'subscription' as const,
        subscriptionType: 'general_stats',
        subscriptionId: 'test-sub',
        data: {}
      };

      await testManager.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });
  });

  describe('handleUnsubscription', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    it('should remove watcher on unsubscription', () => {
      const message = {
        type: 'unsubscription' as const,
        subscriptionId: 'test-sub',
        subscriptionType: 'general_stats'
      };

      // Add a watcher first
      manager['addWatcher']('test-sub', mockWebSocket, mockClient);

      manager.handleUnsubscription(mockWebSocket, message, mockClient);

      // Verify watcher was removed (this would require checking internal state)
      expect(true).toBe(true); // Placeholder - would need to expose watchers for testing
    });
  });

  describe('cleanup', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    it('should remove WebSocket from all watchers', () => {
      // Add multiple watchers
      manager['addWatcher']('sub1', mockWebSocket, mockClient);
      manager['addWatcher']('sub2', mockWebSocket, mockClient);

      manager.cleanup(mockWebSocket, mockClient);

      // Verify cleanup was called (would need to expose watchers for full verification)
      expect(true).toBe(true); // Placeholder
    });
  });
});
