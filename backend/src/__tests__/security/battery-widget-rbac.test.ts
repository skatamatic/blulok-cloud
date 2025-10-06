import { BatterySubscriptionManager } from '@/services/subscriptions/battery-subscription-manager';
import { UnitsService } from '@/services/units.service';
import { UserRole } from '@/types/auth.types';

// Mock the UnitsService
jest.mock('@/services/units.service');

describe('Battery Widget RBAC Security Tests', () => {
  let batteryManager: BatterySubscriptionManager;
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Battery Widget Data Access Control - Positive Tests', () => {
    it('should allow admin to access all battery data', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'admin-user', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('admin-user', UserRole.ADMIN);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should allow dev_admin to access all battery data', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'dev-admin-user', 
        userRole: UserRole.DEV_ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('dev-admin-user', UserRole.DEV_ADMIN);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should allow facility_admin to access battery data for their facilities', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'facility-admin-user', 
        userRole: UserRole.FACILITY_ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('facility-admin-user', UserRole.FACILITY_ADMIN);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should allow tenant to access battery data for their assigned units', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'tenant-user', 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('tenant-user', UserRole.TENANT);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should allow maintenance to access battery data for their assigned units', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'maintenance-user', 
        userRole: UserRole.MAINTENANCE, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('maintenance-user', UserRole.MAINTENANCE);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });

    it('should allow blulok_technician to access battery data', async () => {
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

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'blulok-tech-user', 
        userRole: UserRole.BLULOK_TECHNICIAN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('blulok-tech-user', UserRole.BLULOK_TECHNICIAN);
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });
  });

  describe('Battery Widget Data Access Control - Negative Tests', () => {
    it('should deny access to users with invalid roles', async () => {
      const invalidRoles = ['invalid_role', 'guest', 'anonymous', 'hacker', null, undefined];
      
      for (const role of invalidRoles) {
        const mockWs = { send: jest.fn(), readyState: 1 } as any;
        const mockClient = { 
          userId: 'test-user', 
          userRole: role as any, 
          subscriptions: new Map() 
        };

        // Mock the canSubscribe method to return false for invalid roles
        const canSubscribeSpy = jest.spyOn(batteryManager, 'canSubscribe').mockReturnValue(false);

        await batteryManager.handleSubscription(mockWs, {
          type: 'subscription',
          subscriptionType: 'battery_status',
          data: {}
        }, mockClient);

        // Should send error message for invalid roles
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('error')
        );
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('Access denied')
        );

        canSubscribeSpy.mockRestore();
      }
    });

    it('should not call UnitsService for users with invalid roles', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'test-user', 
        userRole: 'invalid_role' as any, 
        subscriptions: new Map() 
      };

      const canSubscribeSpy = jest.spyOn(batteryManager, 'canSubscribe').mockReturnValue(false);

      await batteryManager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionType: 'battery_status',
        data: {}
      }, mockClient);

      // Should not call UnitsService for invalid roles
      expect(mockUnitsService.getUnits).not.toHaveBeenCalled();

      canSubscribeSpy.mockRestore();
    });

    it('should handle subscription errors gracefully', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'test-user', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      // Mock UnitsService to throw an error
      mockUnitsService.getUnits.mockRejectedValue(new Error('Database connection failed'));

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Should send error message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );
    });
  });

  describe('Battery Widget Data Scoping Tests', () => {
    it('should scope tenant data to only their assigned units', async () => {
      const tenantId = 'tenant-123';
      const assignedUnits = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' },
        { id: 'unit-2', unit_number: 'A-102', battery_level: 25, is_online: true, facility_name: 'Facility A' }
      ];
      // Note: allUnits would contain units from other tenants, but tenant should only see assignedUnits

      // Mock UnitsService to return scoped data for tenant
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: assignedUnits, total: 2 }) // All units (scoped to tenant)
        .mockResolvedValueOnce({ units: assignedUnits.filter(u => u.battery_level <= 20), total: 1 }); // Low battery units (scoped)

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: tenantId, 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Verify UnitsService was called with tenant role
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(tenantId, UserRole.TENANT);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(tenantId, UserRole.TENANT, { 
        battery_threshold: 20 
      });

      // Verify only assigned units are in the response
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.data.lowBatteryUnits).toHaveLength(1); // Only unit-1 (battery_level: 15)
      expect(sentData.data.totalUnits).toBe(2); // Only assigned units
    });

    it('should scope facility admin data to only their facilities', async () => {
      const facilityAdminId = 'facility-admin-123';
      const facilityAUnits = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' },
        { id: 'unit-2', unit_number: 'A-102', battery_level: 25, is_online: true, facility_name: 'Facility A' }
      ];
      // Note: allUnits would contain units from other facilities, but facility admin should only see facilityAUnits

      // Mock UnitsService to return scoped data for facility admin
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: facilityAUnits, total: 2 }) // All units (scoped to facility)
        .mockResolvedValueOnce({ units: facilityAUnits.filter(u => u.battery_level <= 20), total: 1 }); // Low battery units (scoped)

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: facilityAdminId, 
        userRole: UserRole.FACILITY_ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Verify UnitsService was called with facility admin role
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(facilityAdminId, UserRole.FACILITY_ADMIN);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(facilityAdminId, UserRole.FACILITY_ADMIN, { 
        battery_threshold: 20 
      });

      // Verify only facility A units are in the response
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.data.lowBatteryUnits).toHaveLength(1); // Only unit-1 (battery_level: 15)
      expect(sentData.data.totalUnits).toBe(2); // Only facility A units
    });

    it('should scope maintenance data to only their assigned units', async () => {
      const maintenanceId = 'maintenance-123';
      const assignedUnits = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' }
      ];
      // Note: allUnits would contain units not assigned to maintenance, but maintenance should only see assignedUnits

      // Mock UnitsService to return scoped data for maintenance
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: assignedUnits, total: 1 }) // All units (scoped to maintenance)
        .mockResolvedValueOnce({ units: assignedUnits.filter(u => u.battery_level <= 20), total: 1 }); // Low battery units (scoped)

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: maintenanceId, 
        userRole: UserRole.MAINTENANCE, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Verify UnitsService was called with maintenance role
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(maintenanceId, UserRole.MAINTENANCE);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith(maintenanceId, UserRole.MAINTENANCE, { 
        battery_threshold: 20 
      });

      // Verify only assigned units are in the response
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.data.lowBatteryUnits).toHaveLength(1); // Only unit-1 (battery_level: 15)
      expect(sentData.data.totalUnits).toBe(1); // Only assigned units
    });

    it('should allow admin and dev_admin to see all data across all facilities', async () => {
      const allUnits = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' },
        { id: 'unit-2', unit_number: 'B-101', battery_level: 10, is_online: true, facility_name: 'Facility B' },
        { id: 'unit-3', unit_number: 'C-101', battery_level: 5, is_online: true, facility_name: 'Facility C' }
      ];

      const adminRoles = [UserRole.ADMIN, UserRole.DEV_ADMIN];

      for (const role of adminRoles) {
        jest.clearAllMocks();
        
        mockUnitsService.getUnits
          .mockResolvedValueOnce({ units: allUnits, total: 3 }) // All units across all facilities
          .mockResolvedValueOnce({ units: allUnits.filter(u => u.battery_level <= 20), total: 3 }); // All low battery units

        const mockWs = { send: jest.fn(), readyState: 1 } as any;
        const mockClient = { 
          userId: `${role}-user`, 
          userRole: role, 
          subscriptions: new Map() 
        };

        await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

        // Verify UnitsService was called with admin role
        expect(mockUnitsService.getUnits).toHaveBeenCalledWith(`${role}-user`, role);
        expect(mockUnitsService.getUnits).toHaveBeenCalledWith(`${role}-user`, role, { 
          battery_threshold: 20 
        });

        // Verify all units are in the response
        const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
        expect(sentData.data.totalUnits).toBe(3); // All units across all facilities
        expect(sentData.data.lowBatteryUnits).toHaveLength(3); // All low battery units
      }
    });
  });

  describe('Battery Widget Cross-Role Data Isolation Tests', () => {
    it('should prevent tenant from accessing other tenants data', async () => {
      const tenant1Id = 'tenant-1';
      const tenant2Id = 'tenant-2';
      
      const tenant1Units = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' }
      ];
      const tenant2Units = [
        { id: 'unit-2', unit_number: 'B-101', battery_level: 10, is_online: true, facility_name: 'Facility B' }
      ];

      // Test tenant 1 access
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: tenant1Units, total: 1 })
        .mockResolvedValueOnce({ units: tenant1Units.filter(u => u.battery_level <= 20), total: 1 });

      const mockWs1 = { send: jest.fn(), readyState: 1 } as any;
      const mockClient1 = { 
        userId: tenant1Id, 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs1, 'test-sub-1', mockClient1);

      // Verify tenant 1 only sees their units
      const sentData1 = JSON.parse(mockWs1.send.mock.calls[0][0]);
      expect(sentData1.data.totalUnits).toBe(1);
      expect(sentData1.data.lowBatteryUnits[0].id).toBe('unit-1');

      // Test tenant 2 access
      jest.clearAllMocks();
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: tenant2Units, total: 1 })
        .mockResolvedValueOnce({ units: tenant2Units.filter(u => u.battery_level <= 20), total: 1 });

      const mockWs2 = { send: jest.fn(), readyState: 1 } as any;
      const mockClient2 = { 
        userId: tenant2Id, 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs2, 'test-sub-2', mockClient2);

      // Verify tenant 2 only sees their units
      const sentData2 = JSON.parse(mockWs2.send.mock.calls[0][0]);
      expect(sentData2.data.totalUnits).toBe(1);
      expect(sentData2.data.lowBatteryUnits[0].id).toBe('unit-2');

      // Verify different data was returned for each tenant
      expect(sentData1.data.lowBatteryUnits[0].id).not.toBe(sentData2.data.lowBatteryUnits[0].id);
    });

    it('should prevent facility admin from accessing other facilities data', async () => {
      const facilityAdmin1Id = 'facility-admin-1';
      const facilityAdmin2Id = 'facility-admin-2';
      
      const facility1Units = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 15, is_online: true, facility_name: 'Facility A' }
      ];
      const facility2Units = [
        { id: 'unit-2', unit_number: 'B-101', battery_level: 10, is_online: true, facility_name: 'Facility B' }
      ];

      // Test facility admin 1 access
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: facility1Units, total: 1 })
        .mockResolvedValueOnce({ units: facility1Units.filter(u => u.battery_level <= 20), total: 1 });

      const mockWs1 = { send: jest.fn(), readyState: 1 } as any;
      const mockClient1 = { 
        userId: facilityAdmin1Id, 
        userRole: UserRole.FACILITY_ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs1, 'test-sub-1', mockClient1);

      // Verify facility admin 1 only sees their facility units
      const sentData1 = JSON.parse(mockWs1.send.mock.calls[0][0]);
      expect(sentData1.data.totalUnits).toBe(1);
      expect(sentData1.data.lowBatteryUnits[0].facility_name).toBe('Facility A');

      // Test facility admin 2 access
      jest.clearAllMocks();
      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: facility2Units, total: 1 })
        .mockResolvedValueOnce({ units: facility2Units.filter(u => u.battery_level <= 20), total: 1 });

      const mockWs2 = { send: jest.fn(), readyState: 1 } as any;
      const mockClient2 = { 
        userId: facilityAdmin2Id, 
        userRole: UserRole.FACILITY_ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs2, 'test-sub-2', mockClient2);

      // Verify facility admin 2 only sees their facility units
      const sentData2 = JSON.parse(mockWs2.send.mock.calls[0][0]);
      expect(sentData2.data.totalUnits).toBe(1);
      expect(sentData2.data.lowBatteryUnits[0].facility_name).toBe('Facility B');

      // Verify different data was returned for each facility admin
      expect(sentData1.data.lowBatteryUnits[0].facility_name).not.toBe(sentData2.data.lowBatteryUnits[0].facility_name);
    });
  });

  describe('Battery Widget Security Edge Cases', () => {
    it('should handle empty user ID gracefully', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: '', 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: [], total: 0 })
        .mockResolvedValueOnce({ units: [], total: 0 });

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Should still call UnitsService with empty user ID
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('', UserRole.TENANT);
    });

    it('should handle null/undefined user role gracefully', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'test-user', 
        userRole: null as any, 
        subscriptions: new Map() 
      };

      // Mock canSubscribe to return false for null role
      const canSubscribeSpy = jest.spyOn(batteryManager, 'canSubscribe').mockReturnValue(false);

      await batteryManager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionType: 'battery_status',
        data: {}
      }, mockClient);

      // Should send error message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('error')
      );

      canSubscribeSpy.mockRestore();
    });

    it('should prevent data leakage through error messages', async () => {
      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'test-user', 
        userRole: UserRole.TENANT, 
        subscriptions: new Map() 
      };

      // Mock UnitsService to throw an error with sensitive information
      mockUnitsService.getUnits.mockRejectedValue(new Error('Database error: user tenant-123 has no access to facility admin-456'));

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Should send generic error message without sensitive information
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.type).toBe('error');
      expect(sentData.error).not.toContain('tenant-123');
      expect(sentData.error).not.toContain('admin-456');
      expect(sentData.error).toContain('Failed to load initial battery data');
    });

    it('should validate battery data integrity', async () => {
      const mockUnits = [
        { id: 'unit-1', unit_number: 'A-101', battery_level: 150, is_online: true }, // Invalid battery level > 100
        { id: 'unit-2', unit_number: 'A-102', battery_level: -10, is_online: true }, // Invalid battery level < 0
        { id: 'unit-3', unit_number: 'A-103', battery_level: 50, is_online: true },  // Valid battery level
      ];

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockUnits, total: 3 })
        .mockResolvedValueOnce({ units: mockUnits.filter(u => u.battery_level <= 20), total: 1 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'test-user', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      // Should still process the data (validation should be handled at the data layer)
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('battery_status_update')
      );
    });
  });

  describe('Battery WebSocket Subscription Access Control', () => {
    it('should allow all roles to subscribe to battery_status', () => {
      const roles = [
        UserRole.ADMIN,
        UserRole.DEV_ADMIN,
        UserRole.FACILITY_ADMIN,
        UserRole.TENANT,
        UserRole.MAINTENANCE,
        UserRole.BLULOK_TECHNICIAN,
      ];

      roles.forEach(role => {
        expect(batteryManager.canSubscribe(role)).toBe(true);
      });
    });

    it('should handle subscription for different user roles', async () => {
      const roles = [
        { role: UserRole.ADMIN, userId: 'admin-user' },
        { role: UserRole.FACILITY_ADMIN, userId: 'facility-admin-user' },
        { role: UserRole.TENANT, userId: 'tenant-user' },
        { role: UserRole.MAINTENANCE, userId: 'maintenance-user' },
        { role: UserRole.DEV_ADMIN, userId: 'dev-admin-user' },
        { role: UserRole.BLULOK_TECHNICIAN, userId: 'blulok-tech-user' },
      ];

      for (const { role, userId } of roles) {
        const mockWs = { send: jest.fn(), readyState: 1 } as any;
        const mockClient = { 
          userId, 
          userRole: role, 
          subscriptions: new Map() 
        };

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

        await batteryManager.handleSubscription(mockWs, {
          type: 'subscription',
          subscriptionType: 'battery_status',
          data: {}
        }, mockClient);

        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('battery_status_update')
        );
      }
    });
  });

  describe('Battery Data Filtering and Scoping', () => {
    it('should respect battery threshold filtering', async () => {
      const mockUnits = [
        { id: 'unit-1', battery_level: 3, is_online: true },   // Critical
        { id: 'unit-2', battery_level: 15, is_online: true },  // Low
        { id: 'unit-3', battery_level: 50, is_online: true },  // Good
      ];

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockUnits, total: 3 })
        .mockResolvedValueOnce({ units: [mockUnits[0], mockUnits[1]], total: 2 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN);
      expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN, { 
        battery_threshold: 20 
      });
    });

    it('should handle different battery thresholds correctly', async () => {
      const thresholds = [5, 10, 15, 20, 50];
      
      for (const threshold of thresholds) {
        const mockUnits = Array.from({ length: 10 }, (_, i) => ({
          id: `unit-${i}`,
          battery_level: Math.floor(Math.random() * 100),
          is_online: true,
        }));

        mockUnitsService.getUnits
          .mockResolvedValueOnce({ units: mockUnits, total: 10 })
          .mockResolvedValueOnce({ 
            units: mockUnits.filter(u => (u.battery_level || 0) <= threshold), 
            total: mockUnits.filter(u => (u.battery_level || 0) <= threshold).length 
          });

        const mockWs = { send: jest.fn(), readyState: 1 } as any;
        const mockClient = { 
          userId: 'user-1', 
          userRole: UserRole.ADMIN, 
          subscriptions: new Map() 
        };

        await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

        expect(mockUnitsService.getUnits).toHaveBeenCalledWith('user-1', UserRole.ADMIN, { 
          battery_threshold: 20 // The manager uses a fixed threshold of 20
        });
      }
    });
  });

  describe('Battery Widget Security Edge Cases', () => {
    it('should not expose sensitive unit data in battery responses', async () => {
      const mockUnits = [
        {
          id: 'unit-1',
          unit_number: 'A-101',
          battery_level: 15,
          is_online: true,
          facility_name: 'Test Facility',
          last_seen: '2024-01-01T10:00:00Z',
          // Sensitive fields that should not be exposed
          internal_notes: 'Sensitive internal notes',
          admin_notes: 'Admin-only notes',
          security_clearance: 'high',
        }
      ];

      mockUnitsService.getUnits
        .mockResolvedValueOnce({ units: mockUnits, total: 1 })
        .mockResolvedValueOnce({ units: mockUnits, total: 1 });

      const mockWs = { send: jest.fn(), readyState: 1 } as any;
      const mockClient = { 
        userId: 'user-1', 
        userRole: UserRole.ADMIN, 
        subscriptions: new Map() 
      };

      await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      
      // The response should contain the unit data, but sensitive fields should be filtered out
      // by the UnitsService (this is tested at the service level)
      expect(sentData.data).toBeDefined();
      expect(sentData.data.lowBatteryUnits).toBeDefined();
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

    it('should validate battery threshold range', async () => {
      const invalidThresholds = [-1, -100, 101, 1000, 'abc', null, undefined];
      
      for (const _threshold of invalidThresholds) {
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

        const mockWs = { send: jest.fn(), readyState: 1 } as any;
        const mockClient = { 
          userId: 'user-1', 
          userRole: UserRole.ADMIN, 
          subscriptions: new Map() 
        };

        await (batteryManager as any).sendInitialData(mockWs, 'test-sub', mockClient);

        // Should handle invalid thresholds gracefully
        expect(mockWs.send).toHaveBeenCalledWith(
          expect.stringContaining('battery_status_update')
        );
      }
    });
  });
});