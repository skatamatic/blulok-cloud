import { BatterySubscriptionManager } from '@/services/subscriptions/battery-subscription-manager';
import { WebSocketService } from '@/services/websocket.service';
import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';

// Mock the UnitsService
jest.mock('@/services/units.service');

describe('Battery Widget Integration Tests', () => {
  let batteryManager: BatterySubscriptionManager;
  let webSocketService: WebSocketService;
  let mockUnitsService: jest.Mocked<UnitsService>;

  beforeAll(() => {
    // Set up mocks
    mockUnitsService = {
      getUnits: jest.fn(),
      lockUnit: jest.fn(),
      unlockUnit: jest.fn(),
      hasUserAccessToUnit: jest.fn(),
      createUnit: jest.fn(),
      updateUnit: jest.fn(),
      getInstance: jest.fn()
    } as any;

    (UnitsService.getInstance as jest.Mock).mockReturnValue(mockUnitsService);
    
    batteryManager = new BatterySubscriptionManager();
    webSocketService = WebSocketService.getInstance();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Battery Subscription Manager Integration', () => {
    it('should handle battery status subscription lifecycle', async () => {
      const mockClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map()
      };

      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      const mockUnits = [
        {
          id: 'unit-1',
          unit_number: 'A-101',
          battery_level: 15,
          is_online: true,
          facility_name: 'Test Facility',
          last_seen: '2024-01-01T10:00:00Z',
        }
      ];

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockUnits, total: 1 })
        .mockResolvedValueOnce({ units: mockUnits, total: 1 });

      // Test subscription
      await batteryManager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionType: 'battery_status',
        data: {}
      }, mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should broadcast battery updates to multiple subscribers', async () => {
      const mockClient1 = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map()
      };

      const mockClient2 = {
        userId: 'user-2',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map()
      };

      const mockWs1 = { send: jest.fn(), readyState: 1 } as any;
      const mockWs2 = { send: jest.fn(), readyState: 1 } as any;

      // Set up watchers and client contexts
      (batteryManager as any).watchers = new Map([
        ['sub-1', new Set([mockWs1])],
        ['sub-2', new Set([mockWs2])],
      ]);
      (batteryManager as any).clientContext = new Map([
        ['sub-1', mockClient1],
        ['sub-2', mockClient2],
      ]);

      const mockUnits = [
        {
          id: 'unit-1',
          unit_number: 'A-101',
          battery_level: 15,
          is_online: true,
          facility_name: 'Test Facility',
          last_seen: '2024-01-01T10:00:00Z',
        }
      ];

      mockUnitsService.getUnits
        .mockResolvedValue({ units: mockUnits, total: 1 });

      await batteryManager.broadcastUpdate();

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });

    it('should handle WebSocket service integration', async () => {
      const broadcastSpy = jest.spyOn(batteryManager, 'broadcastUpdate').mockResolvedValue();

      // Mock the subscription registry
      const mockRegistry = {
        getBatteryManager: jest.fn().mockReturnValue(batteryManager)
      };
      (webSocketService as any).subscriptionRegistry = mockRegistry;

      await webSocketService.broadcastBatteryStatusUpdate();

      expect(mockRegistry.getBatteryManager).toHaveBeenCalled();
      expect(broadcastSpy).toHaveBeenCalled();
    });
  });

  describe('Battery Data Processing Integration', () => {
    it('should process battery data correctly with real-world scenarios', async () => {
      const mockUnits = [
        { id: 'unit-1', battery_level: 3, is_online: true },   // Critical
        { id: 'unit-2', battery_level: 15, is_online: true },  // Low
        { id: 'unit-3', battery_level: 50, is_online: true },  // Good
        { id: 'unit-4', battery_level: null, is_online: false }, // Offline
      ];

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockUnits, total: 4 })
        .mockResolvedValueOnce({ units: [mockUnits[0], mockUnits[1]], total: 2 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
      
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.data).toBeDefined();
      expect(sentData.data.totalUnits).toBe(4);
    });

    it('should handle empty battery data gracefully', async () => {
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: [], total: 0 })
        .mockResolvedValueOnce({ units: [], total: 0 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
      
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.data.totalUnits).toBe(0);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle service errors gracefully', async () => {
      mockUnitsService.getUnits.mockRejectedValue(new Error('Service unavailable'));

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });

    it('should handle WebSocket connection issues', async () => {
      const mockClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map()
      };

      const closedWs = { send: jest.fn(), readyState: 3 } as any; // CLOSED

      (batteryManager as any).watchers = new Map([
        ['sub-1', new Set([closedWs])],
      ]);
      (batteryManager as any).clientContext = new Map([
        ['sub-1', mockClient],
      ]);

      mockUnitsService.getUnits.mockResolvedValue({ units: [], total: 0 });

      await batteryManager.broadcastUpdate();

      // Should not send to closed connection
      expect(closedWs.send).not.toHaveBeenCalled();
    });
  });

  describe('Performance Integration', () => {
    it('should handle large datasets efficiently', async () => {
      // Create a large dataset
      const largeUnits = Array.from({ length: 1000 }, (_, i) => ({
        id: `unit-${i}`,
        unit_number: `A-${i.toString().padStart(3, '0')}`,
        battery_level: Math.floor(Math.random() * 100),
        is_online: Math.random() > 0.1,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T10:00:00Z',
      }));

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: largeUnits, total: 1000 })
        .mockResolvedValueOnce({ units: largeUnits.filter(u => u.battery_level <= 20), total: 200 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      const startTime = Date.now();
      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(mockWs.send).toHaveBeenCalled();
    });
  });
});