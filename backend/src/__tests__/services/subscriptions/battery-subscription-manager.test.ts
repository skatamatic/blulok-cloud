import { BatterySubscriptionManager } from '@/services/subscriptions/battery-subscription-manager';
import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';

// Mock the UnitsService
jest.mock('@/services/units.service');

describe('BatterySubscriptionManager', () => {
  let manager: BatterySubscriptionManager;
  let mockUnitsService: jest.Mocked<UnitsService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockUnitsService = {
      getUnits: jest.fn(),
      lockUnit: jest.fn(),
      unlockUnit: jest.fn(),
      hasUserAccessToUnit: jest.fn(),
      createUnit: jest.fn(),
      updateUnit: jest.fn(),
      getInstance: jest.fn()
    } as any;
    
    // Mock the UnitsService.getInstance() to return our mock BEFORE creating the manager
    (UnitsService.getInstance as jest.Mock).mockReturnValue(mockUnitsService);
    
    manager = new BatterySubscriptionManager();
  });

  describe('getSubscriptionType', () => {
    it('should return battery_status', () => {
      expect(manager.getSubscriptionType()).toBe('battery_status');
    });
  });

  describe('canSubscribe', () => {
    it('should allow all user roles to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(true);
      expect(manager.canSubscribe(UserRole.BLULOK_TECHNICIAN)).toBe(true);
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    });
  });

  describe('sendInitialData', () => {
    const mockClient = {
      userId: 'user-1',
      userRole: UserRole.ADMIN,
      subscriptions: new Map()
    };

    const mockAllUnits = [
      {
        id: 'unit-1',
        unit_number: 'A-101',
        battery_level: 15,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
      {
        id: 'unit-2',
        unit_number: 'A-102',
        battery_level: 3,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
      {
        id: 'unit-3',
        unit_number: 'A-103',
        battery_level: 0,
        is_online: false,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
    ];

    const mockLowBatteryUnits = [
      {
        id: 'unit-1',
        unit_number: 'A-101',
        battery_level: 15,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
      {
        id: 'unit-2',
        unit_number: 'A-102',
        battery_level: 3,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      mockUnitsService.getUnits.mockResolvedValue({
        units: mockAllUnits,
        total: mockAllUnits.length,
      });
    });

    it('should send initial battery data', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      // Mock the getUnits call for low battery units
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockAllUnits, total: mockAllUnits.length })
        .mockResolvedValueOnce({ units: mockLowBatteryUnits, total: mockLowBatteryUnits.length });

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN, { 
        battery_threshold: 20 
      });

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"battery_status_update"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"subscriptionId":"test-subscription"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"lowBatteryUnits"')
      );
    });

    it('should handle errors gracefully', async () => {
      const mockWs = {
        send: jest.fn(),
        readyState: 1, // OPEN
      } as any;

      mockUnitsService.getUnits.mockRejectedValue(new Error('Database error'));

      await (manager as any).sendInitialData(mockWs, 'test-subscription', mockClient);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"error":"Failed to load initial battery data"')
      );
    });
  });

  describe('broadcastUpdate', () => {
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

    const mockAllUnits = [
      {
        id: 'unit-1',
        unit_number: 'A-101',
        battery_level: 15,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
    ];

    const mockLowBatteryUnits = [
      {
        id: 'unit-1',
        unit_number: 'A-101',
        battery_level: 15,
        is_online: true,
        facility_name: 'Test Facility',
        last_seen: '2024-01-01T00:00:00Z',
      },
    ];

    beforeEach(() => {
      // Mock the private properties using any casting
      (manager as any).watchers = new Map([
        ['sub-1', new Set([{ send: jest.fn(), readyState: 1 }])],
        ['sub-2', new Set([{ send: jest.fn(), readyState: 1 }])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient1],
        ['sub-2', mockClient2],
      ]);
    });

    it('should broadcast battery updates to all active subscriptions', async () => {
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockAllUnits, total: mockAllUnits.length })
        .mockResolvedValueOnce({ units: mockLowBatteryUnits, total: mockLowBatteryUnits.length })
        .mockResolvedValueOnce({ units: mockAllUnits, total: mockAllUnits.length })
        .mockResolvedValueOnce({ units: mockLowBatteryUnits, total: mockLowBatteryUnits.length });

      await manager.broadcastUpdate();

      expect(mockUnitsService.getUnits).toHaveBeenCalledTimes(4); // 2 calls per user
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN, { 
        battery_threshold: 20 
      });
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-2', UserRole.FACILITY_ADMIN);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-2', UserRole.FACILITY_ADMIN, { 
        battery_threshold: 20 
      });
    });

    it('should handle missing client context gracefully', async () => {
      (manager as any).clientContext = new Map(); // Empty context

      await expect(manager.broadcastUpdate()).resolves.not.toThrow();
    });

    it('should handle closed websocket connections', async () => {
      const closedWs = { send: jest.fn(), readyState: 3 }; // CLOSED
      (manager as any).watchers = new Map([
        ['sub-1', new Set([closedWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient1],
      ]);

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockAllUnits, total: mockAllUnits.length })
        .mockResolvedValueOnce({ units: mockLowBatteryUnits, total: mockLowBatteryUnits.length });

      await manager.broadcastUpdate();

      // Should not send to closed connection
      expect(closedWs.send).not.toHaveBeenCalled();
    });

    it('should handle websocket send errors', async () => {
      const errorWs = { 
        send: jest.fn().mockImplementation(() => { throw new Error('Send failed'); }), 
        readyState: 1 
      };
      (manager as any).watchers = new Map([
        ['sub-1', new Set([errorWs])],
      ]);
      (manager as any).clientContext = new Map([
        ['sub-1', mockClient1],
      ]);

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockAllUnits, total: mockAllUnits.length })
        .mockResolvedValueOnce({ units: mockLowBatteryUnits, total: mockLowBatteryUnits.length });

      await expect(manager.broadcastUpdate()).resolves.not.toThrow();
    });
  });
});
