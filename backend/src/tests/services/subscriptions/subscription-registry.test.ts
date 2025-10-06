import { SubscriptionRegistry } from '../../../services/subscriptions/subscription-registry';
import { GeneralStatsSubscriptionManager } from '../../../services/subscriptions/general-stats-subscription-manager';
import { DashboardLayoutSubscriptionManager } from '../../../services/subscriptions/dashboard-layout-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

// Mock the subscription managers
jest.mock('../../../services/subscriptions/general-stats-subscription-manager');
jest.mock('../../../services/subscriptions/dashboard-layout-subscription-manager');

describe('SubscriptionRegistry', () => {
  let registry: SubscriptionRegistry;
  let mockWebSocket: jest.Mocked<WebSocket>;
  let mockGeneralStatsManager: jest.Mocked<GeneralStatsSubscriptionManager>;
  let mockDashboardLayoutManager: jest.Mocked<DashboardLayoutSubscriptionManager>;

  beforeEach(() => {
    // Mock the managers first
    mockGeneralStatsManager = {
      getSubscriptionType: jest.fn().mockReturnValue('general_stats'),
      canSubscribe: jest.fn(),
      handleSubscription: jest.fn(),
      handleUnsubscription: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    mockDashboardLayoutManager = {
      getSubscriptionType: jest.fn().mockReturnValue('dashboard_layout'),
      canSubscribe: jest.fn(),
      handleSubscription: jest.fn(),
      handleUnsubscription: jest.fn(),
      cleanup: jest.fn(),
    } as any;

    // Replace the managers with mocks
    (GeneralStatsSubscriptionManager as jest.Mock).mockImplementation(() => mockGeneralStatsManager);
    (DashboardLayoutSubscriptionManager as jest.Mock).mockImplementation(() => mockDashboardLayoutManager);
    
    // Create the registry after mocking
    registry = new SubscriptionRegistry();
    
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

  describe('constructor', () => {
    it('should register all subscription managers', () => {
      expect(GeneralStatsSubscriptionManager).toHaveBeenCalled();
      expect(DashboardLayoutSubscriptionManager).toHaveBeenCalled();
    });
  });

  describe('getManager', () => {
    it('should return correct manager for general_stats', () => {
      const manager = registry.getManager('general_stats');
      expect(manager).toBeDefined();
    });

    it('should return correct manager for dashboard_layout', () => {
      const manager = registry.getManager('dashboard_layout');
      expect(manager).toBeDefined();
    });

    it('should return undefined for unknown subscription type', () => {
      const manager = registry.getManager('unknown_type');
      expect(manager).toBeUndefined();
    });
  });

  describe('handleSubscription', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    it('should delegate to correct manager for general_stats', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'general_stats',
        subscriptionId: 'test-sub',
        data: {}
      };

      await registry.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockGeneralStatsManager.handleSubscription).toHaveBeenCalledWith(
        mockWebSocket,
        message,
        mockClient
      );
    });

    it('should delegate to correct manager for dashboard_layout', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub',
        data: {}
      };

      await registry.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockDashboardLayoutManager.handleSubscription).toHaveBeenCalledWith(
        mockWebSocket,
        message,
        mockClient
      );
    });

    it('should send error for unknown subscription type', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionType: 'unknown_type',
        subscriptionId: 'test-sub',
        data: {}
      };

      await registry.handleSubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });

    it('should send error for missing subscription type', async () => {
      const message = {
        type: 'subscription' as const,
        subscriptionId: 'test-sub',
        data: {}
      };

      await registry.handleSubscription(mockWebSocket, message, mockClient);

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

    it('should delegate to correct manager for general_stats', () => {
      const message = {
        type: 'unsubscription' as const,
        subscriptionType: 'general_stats',
        subscriptionId: 'test-sub'
      };

      registry.handleUnsubscription(mockWebSocket, message, mockClient);

      expect(mockGeneralStatsManager.handleUnsubscription).toHaveBeenCalledWith(
        mockWebSocket,
        message,
        mockClient
      );
    });

    it('should delegate to correct manager for dashboard_layout', () => {
      const message = {
        type: 'unsubscription' as const,
        subscriptionType: 'dashboard_layout',
        subscriptionId: 'test-sub'
      };

      registry.handleUnsubscription(mockWebSocket, message, mockClient);

      expect(mockDashboardLayoutManager.handleUnsubscription).toHaveBeenCalledWith(
        mockWebSocket,
        message,
        mockClient
      );
    });

    it('should send error for unknown subscription type', () => {
      const message = {
        type: 'unsubscription' as const,
        subscriptionType: 'unknown_type',
        subscriptionId: 'test-sub'
      };

      registry.handleUnsubscription(mockWebSocket, message, mockClient);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
    });
  });

  describe('cleanup', () => {
    const mockClient = {
      userId: 'test-user',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    it('should cleanup all managers', () => {
      registry.cleanup(mockWebSocket, mockClient);

      expect(mockGeneralStatsManager.cleanup).toHaveBeenCalledWith(mockWebSocket, mockClient);
      expect(mockDashboardLayoutManager.cleanup).toHaveBeenCalledWith(mockWebSocket, mockClient);
    });
  });

  describe('getDashboardLayoutManager', () => {
    it('should return dashboard layout manager', () => {
      const manager = registry.getDashboardLayoutManager();
      expect(manager).toBeDefined();
    });
  });

  describe('getGeneralStatsManager', () => {
    it('should return general stats manager', () => {
      const manager = registry.getGeneralStatsManager();
      expect(manager).toBeDefined();
    });
  });
});
