/**
 * Integration Test: Complete Denylist Flow
 *
 * Tests the end-to-end flow of denylist management:
 * 1. User unassigned from unit → denylist entry created → command sent
 * 2. User re-assigned to unit → denylist entry removed → remove command sent
 * 3. Expiration handling
 */
import { DenylistEntryModel } from '@/models/denylist-entry.model';
import { DenylistService } from '@/services/denylist.service';
import { AccessRevocationListenerService } from '@/services/access-revocation-listener.service';
import { DatabaseService } from '@/services/database.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

jest.mock('@/services/database.service');
jest.mock('@/services/gateway/gateway-events.service');
jest.mock('@/models/denylist-entry.model');
jest.mock('@/config/environment', () => ({
  config: {
    security: {
      routePassTtlHours: 24,
    },
  },
}));

const mockHandlers: any = {};
jest.mock('@/services/events/unit-assignment-events.service', () => ({
  UnitAssignmentEventsService: {
    getInstance: jest.fn().mockReturnValue({
      onTenantUnassigned: (h: any) => { mockHandlers.unassigned = h; },
      onTenantAssigned: (h: any) => { mockHandlers.assigned = h; },
    }),
  },
}));

describe('Denylist Flow Integration', () => {
  let mockKnex: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;
  let mockGatewayEvents: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    const mockQueryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      del: jest.fn().mockResolvedValue(1),
      first: jest.fn(),
      fn: { now: () => new Date() },
    };

    mockKnex = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([
            { id: 'device-1', unit_id: 'unit-1' },
          ]),
          join: jest.fn().mockReturnThis(),
        };
      } else if (table === 'units') {
        return {
          join: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: 'facility-1' }),
        };
      }
      return mockQueryBuilder;
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockKnex,
    });

    mockGatewayEvents = {
      unicastToFacility: jest.fn(),
      broadcast: jest.fn(),
    };

    (GatewayEventsService.getInstance as jest.Mock).mockReturnValue(mockGatewayEvents);

    mockDenylistModel = {
      create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findByUnitsAndUser: jest.fn().mockResolvedValue([]),
      findByDevice: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(true),
      pruneExpired: jest.fn().mockResolvedValue(0),
    } as any;

    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

    jest.spyOn(DenylistService, 'buildDenylistAdd').mockResolvedValue([
      { cmd_type: 'DENYLIST_ADD', denylist_add: [] },
      'signature',
    ]);

    jest.spyOn(DenylistService, 'buildDenylistRemove').mockResolvedValue([
      { cmd_type: 'DENYLIST_REMOVE', denylist_remove: [] },
      'signature',
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Full Flow: Unassign → Re-assign', () => {
    it('creates denylist entries on unassignment and removes on re-assignment', async () => {
      // Mock DenylistOptimizationService to not skip denylist commands
      const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
      jest.spyOn(DenylistOptimizationService, 'shouldSkipDenylistAdd').mockResolvedValue(false);
      jest.spyOn(DenylistOptimizationService, 'shouldSkipDenylistRemove').mockReturnValue(false);

      // Initialize service
      AccessRevocationListenerService.getInstance();

      // Simulate unassignment
      await mockHandlers.unassigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'facility-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      expect(mockDenylistModel.create).toHaveBeenCalled();
      expect(DenylistService.buildDenylistAdd).toHaveBeenCalled();
      expect(mockGatewayEvents.unicastToFacility).toHaveBeenCalled();

      // Set up for re-assignment - mock database queries properly
      // The service makes two types of queries:
      // 1. knex('blulok_devices').where({ unit_id }).select('id') - to get devices
      // 2. knex('blulok_devices').join('units').where('blulok_devices.id', entry.device_id).select('units.facility_id').first() - to get facility

      let blulokDevicesCallCount = 0;
      const mockDevicesForUnit = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([{ id: 'device-1' }]),
      };

      const mockDeviceFacilityQuery = {
        join: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ facility_id: 'facility-1' }),
      };

      mockKnex.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          blulokDevicesCallCount++;
          if (blulokDevicesCallCount === 1) {
            // First call: get devices for unit in onTenantAssigned handler
            return mockDevicesForUnit;
          } else {
            // Subsequent calls: get facility for each device in the loop
            return mockDeviceFacilityQuery;
          }
        }
        // Return default query builder for other tables
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          first: jest.fn(),
          fn: { now: () => new Date() },
        };
      });

      // Mock denylist entries to return
      mockDenylistModel.findByUnitsAndUser.mockResolvedValue([
        {
          id: 'entry-1',
          device_id: 'device-1',
          user_id: 'user-1',
          expires_at: new Date('2024-12-31'),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment' as const,
        },
      ]);

      // Clear call counts but keep implementations
      mockDenylistModel.findByUnitsAndUser.mockClear();
      mockDenylistModel.remove.mockClear();
      mockGatewayEvents.unicastToFacility.mockClear();

      // Simulate re-assignment
      await mockHandlers.assigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'facility-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      
      // Verify that the re-assignment triggered denylist removal
      expect(mockDenylistModel.findByUnitsAndUser).toHaveBeenCalledWith(['unit-1'], 'user-1');
      expect(DenylistService.buildDenylistRemove).toHaveBeenCalled();
      expect(mockDenylistModel.remove).toHaveBeenCalled();
      expect(mockGatewayEvents.unicastToFacility).toHaveBeenCalled();
    });
  });
});

