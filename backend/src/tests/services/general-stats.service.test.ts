import { GeneralStatsService } from '../../services/general-stats.service';
import { UserRole } from '@/types/auth.types';
import { DatabaseService } from '../../services/database.service';

// Mock the database service
jest.mock('../../services/database.service');
jest.mock('../../models/user-facility-association.model');

describe('GeneralStatsService', () => {
  let service: GeneralStatsService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      connection: {
        raw: jest.fn()
      }
    };
    (DatabaseService.getInstance as jest.Mock).mockReturnValue(mockDb);
    // Reset the service instance to ensure it uses the mocked database
    (GeneralStatsService as any).instance = undefined;
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

    it('should deny TENANT role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.TENANT)).toBe(false);
    });

    it('should deny MAINTENANCE role to subscribe', () => {
      expect(service.canSubscribeToGeneralStats(UserRole.MAINTENANCE)).toBe(false);
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
    });

    it('should return all data for ADMIN role', async () => {
      // Mock database responses in the format expected by the service
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 5, active: 4, inactive: 1, maintenance: 0 }]]) // facilities
        .mockResolvedValueOnce([[{ total: 10, online: 8, offline: 1, error: 1, maintenance: 0 }]]) // devices
        .mockResolvedValueOnce([[{ total: 20, active: 18, inactive: 2 }]]) // users
        .mockResolvedValueOnce([ // role stats
          { role: UserRole.TENANT, count: 15 },
          { role: UserRole.FACILITY_ADMIN, count: 3 },
          { role: UserRole.ADMIN, count: 2 }
        ]);

      const result = await service.getScopedStats(mockUserId, UserRole.ADMIN);

      expect(result.scope.type).toBe('all');
      expect(result.facilities.total).toBe(5);
      expect(result.devices.total).toBe(10);
      expect(result.users.total).toBe(20);
      expect(result.users.byRole[UserRole.TENANT]).toBe(15);
    });

    it('should return scoped data for FACILITY_ADMIN role', async () => {
      // Mock database responses with facility filtering
      mockDb.connection.raw
        .mockResolvedValueOnce([[{ total: 2, active: 2, inactive: 0, maintenance: 0 }]]) // facilities
        .mockResolvedValueOnce([[{ total: 5, online: 4, offline: 1, error: 0, maintenance: 0 }]]) // devices
        .mockResolvedValueOnce([[{ total: 8, active: 7, inactive: 1 }]]) // users
        .mockResolvedValueOnce([ // role stats
          { role: UserRole.TENANT, count: 6 },
          { role: UserRole.FACILITY_ADMIN, count: 2 }
        ]);

      const result = await service.getScopedStats(mockUserId, UserRole.FACILITY_ADMIN);

      expect(result.scope.type).toBe('facility_limited');
      expect(result.scope.facilityIds).toEqual(mockFacilityIds);
      expect(result.facilities.total).toBe(2);
      expect(result.devices.total).toBe(5);
      expect(result.users.total).toBe(8);
    });

    it('should throw error for unauthorized role', async () => {
      await expect(service.getScopedStats(mockUserId, UserRole.TENANT))
        .rejects.toThrow('Access denied: General stats subscription requires ADMIN, DEV_ADMIN, or FACILITY_ADMIN role');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.connection.raw.mockRejectedValueOnce(new Error('Database error'));

      await expect(service.getScopedStats(mockUserId, UserRole.ADMIN))
        .rejects.toThrow('Database error');
    });
  });
});
