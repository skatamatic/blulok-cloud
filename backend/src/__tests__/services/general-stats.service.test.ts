import { GeneralStatsService } from '../../services/general-stats.service';
import { UserRole } from '@/types/auth.types';
import { DatabaseService } from '../../services/database.service';
import { AuthService } from '../../services/auth.service';
import { DeviceModel } from '../../models/device.model';

// Mock the database service
jest.mock('../../services/database.service');
jest.mock('../../models/user-facility-association.model');
jest.mock('../../models/device.model');
jest.mock('../../services/auth.service', () => ({
  AuthService: {
    canAccessFacility: jest.fn().mockResolvedValue(true),
  },
}));

function mockEffectiveDeviceInventory(
  blulokStatuses: string[],
  accessStatuses: string[] = [],
): void {
  (DeviceModel as jest.MockedClass<typeof DeviceModel>).mockImplementation(
    () =>
      ({
        findBluLokDevices: jest.fn().mockResolvedValue(
          blulokStatuses.map((device_status, index) => ({
            id: `blulok-${index}`,
            facility_id: 'facility-1',
            device_status,
          })),
        ),
        findAccessControlDevices: jest.fn().mockResolvedValue(
          accessStatuses.map((status, index) => ({
            id: `ac-${index}`,
            facility_id: 'facility-1',
            status,
          })),
        ),
      }) as unknown as DeviceModel,
  );
}

describe('GeneralStatsService', () => {
  let service: GeneralStatsService;
  let mockDb: any;

  beforeEach(() => {
    const rawMock = jest.fn();
    const createKnexChain = () => {
      const chain: any = {};
      chain.where = jest.fn(() => chain);
      chain.whereIn = jest.fn(() => chain);
      chain.andWhere = jest.fn(() => chain);
      chain.count = jest.fn().mockResolvedValue([{ c: '0' }]);
      return chain;
    };
    mockDb = {
      connection: Object.assign(jest.fn(() => createKnexChain()), {
        raw: rawMock,
      }),
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDb);
    // Reset the service instance to ensure it uses the mocked database
    (GeneralStatsService as any).instance = undefined;
    const { DeviceReachabilityEnrichmentService } = require('../../services/device-reachability-enrichment.service');
    DeviceReachabilityEnrichmentService.resetForTests();
    service = GeneralStatsService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canSubscribeToGeneralStats', () => {
    it('should allow ADMIN role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.ADMIN)).toBe(true);
    });

    it('should allow DEV_ADMIN role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.DEV_ADMIN)).toBe(true);
    });

    it('should allow FACILITY_ADMIN role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.FACILITY_ADMIN)).toBe(true);
    });

    it('should allow MAINTENANCE role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.MAINTENANCE)).toBe(true);
    });

    it('should deny TENANT role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.TENANT)).toBe(false);
    });

    it('should deny BLULOK_TECHNICIAN role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.BLULOK_TECHNICIAN)).toBe(false);
    });
  });

  describe('getScopedStats', () => {
    const mockUserId = 'user-123';
    const mockFacilityIds = ['facility-1', 'facility-2'];

    beforeEach(() => {
      // Mock UserFacilityAssociationModel
      const { UserFacilityAssociationModel } = require('../../models/user-facility-association.model');
      UserFacilityAssociationModel.getUserFacilityIds = jest.fn().mockResolvedValue(mockFacilityIds);
      (AuthService.canAccessFacility as jest.Mock).mockResolvedValue(true);
    });

    it('should return all data for ADMIN role', async () => {
      mockEffectiveDeviceInventory(
        ['online', 'online', 'online', 'online', 'online', 'online', 'online', 'online', 'offline', 'error'],
      );
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 5, active: 4, inactive: 1, maintenance: 0 }]]) // facilities
        .mockResolvedValueOnce([[{ total: 20, active: 18, inactive: 2 }]]) // users
        .mockResolvedValueOnce([[ // role stats (mysql2: [rows, fields])
          { role: UserRole.TENANT, count: 15 },
          { role: UserRole.FACILITY_ADMIN, count: 3 },
          { role: UserRole.ADMIN, count: 2 }
        ]]);

      const result = await service.getScopedStats(mockUserId, UserRole.ADMIN);

      expect(result.scope.type).toBe('all');
      expect(result.facilities.total).toBe(5);
      expect(result.devices.total).toBe(10);
      expect(result.users.total).toBe(20);
      expect(result.users.byRole[UserRole.TENANT]).toBe(15);
      expect(result.alerts.open).toBe(0);
    });

    it('should return scoped data for FACILITY_ADMIN role', async () => {
      mockEffectiveDeviceInventory(['online', 'online', 'online', 'online', 'offline']);
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 2, active: 2, inactive: 0, maintenance: 0 }]]) // facilities
        .mockResolvedValueOnce([[{ total: 8, active: 7, inactive: 1 }]]) // users
        .mockResolvedValueOnce([[
          { role: UserRole.TENANT, count: 6 },
          { role: UserRole.FACILITY_ADMIN, count: 2 }
        ]]);

      const result = await service.getScopedStats(mockUserId, UserRole.FACILITY_ADMIN);

      expect(result.scope.type).toBe('facility_limited');
      expect(result.scope.facilityIds).toEqual(mockFacilityIds);
      expect(result.facilities.total).toBe(2);
      expect(result.devices.total).toBe(5);
      expect(result.users.total).toBe(8);
      expect(result.alerts.open).toBe(0);
    });

    it('should return scoped data for MAINTENANCE role', async () => {
      mockEffectiveDeviceInventory(['online', 'online', 'offline']);
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 1, active: 1, inactive: 0, maintenance: 0 }]])
        .mockResolvedValueOnce([[{ total: 4, active: 4, inactive: 0 }]])
        .mockResolvedValueOnce([[{ role: UserRole.TENANT, count: 2 }]]);

      const result = await service.getScopedStats(mockUserId, UserRole.MAINTENANCE);

      expect(result.scope.type).toBe('facility_limited');
      expect(result.scope.facilityIds).toEqual(mockFacilityIds);
      expect(result.facilities.total).toBe(1);
    });

    it('should throw error for unauthorized role', async () => {
      await expect(service.getScopedStats(mockUserId, UserRole.TENANT))
        .rejects.toThrow('Access denied: General stats subscription requires ADMIN, DEV_ADMIN, FACILITY_ADMIN, or MAINTENANCE role');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.connection.raw.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.getScopedStats(mockUserId, UserRole.ADMIN))
        .rejects.toThrow('Database error');
    });

    it('should narrow stats to one facility when facilityId option is provided', async () => {
      const targetId = 'facility-1';
      mockEffectiveDeviceInventory(['online', 'online']);
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 1, active: 1, inactive: 0, maintenance: 0 }]])
        .mockResolvedValueOnce([[{ total: 3, active: 3, inactive: 0 }]])
        .mockResolvedValueOnce([[{ role: UserRole.TENANT, count: 2 }]]);

      const result = await service.getScopedStats(mockUserId, UserRole.FACILITY_ADMIN, {
        facilityId: targetId,
      });

      expect(AuthService.canAccessFacility).toHaveBeenCalledWith(
        mockUserId,
        UserRole.FACILITY_ADMIN,
        targetId
      );
      expect(result.scope.type).toBe('facility_limited');
      expect(result.scope.facilityIds).toEqual([targetId]);
      expect(result.facilities.total).toBe(1);
    });

    it('should throw when facilityId is not accessible', async () => {
      (AuthService.canAccessFacility as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        service.getScopedStats(mockUserId, UserRole.FACILITY_ADMIN, { facilityId: 'nope' })
      ).rejects.toThrow(/not accessible|Not allowed/i);
    });
  });
});
