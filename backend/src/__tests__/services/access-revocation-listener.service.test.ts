import { AccessRevocationListenerService } from '@/services/access-revocation-listener.service';
import { DenylistEntryModel } from '@/models/denylist-entry.model';

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn().mockReturnValue({
      unicastToFacility: jest.fn(),
      broadcast: jest.fn(),
    }),
  },
}));

jest.mock('@/services/denylist.service', () => ({
  DenylistService: {
    buildDenylistAdd: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_ADD', denylist_add: [] }, 'sig']),
    buildDenylistRemove: jest.fn().mockResolvedValue([{ cmd_type: 'DENYLIST_REMOVE', denylist_remove: [] }, 'sig']),
  },
}));

jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({}),
    findByUnitsAndUser: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(true),
      })),
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

jest.mock('@/config/environment', () => ({
  config: {
    security: {
      routePassTtlHours: 24,
    },
  },
}));

jest.mock('@/services/denylist-optimization.service', () => ({
  DenylistOptimizationService: {
    shouldSkipDenylistAdd: jest.fn().mockResolvedValue(false),
    shouldSkipDenylistRemove: jest.fn().mockReturnValue(false),
  },
}));

describe('AccessRevocationListenerService', () => {
  let mockDb: any;
  let mockDenylistModel: jest.Mocked<DenylistEntryModel>;

  beforeEach(() => {
    mockDb = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return {
          where: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([{ id: 'dev-123' }, { id: 'dev-999' }]),
          join: jest.fn().mockReturnThis(),
        };
      }
      return {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue([]),
        first: jest.fn().mockResolvedValue(null),
      };
    });

    jest.mock('@/services/database.service', () => ({
      DatabaseService: {
        getInstance: jest.fn().mockReturnValue({
          connection: mockDb,
        }),
      },
    }));

    mockDenylistModel = {
      create: jest.fn().mockResolvedValue({}),
      findByUnitsAndUser: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(true),
    } as any;

    (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);
    
    // Clear the service instance to force re-initialization with fresh mocks
    (AccessRevocationListenerService as any).instance = undefined;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tenant unassignment', () => {
    it('registers unassignment handler and creates denylist entries', async () => {
      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

    AccessRevocationListenerService.getInstance();

      await mockHandlers.unassigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      expect(mockDenylistModel.create).toHaveBeenCalled();
    const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
    const gw = GatewayEventsService.getInstance() as any;
    expect(gw.unicastToFacility).toHaveBeenCalled();
    });

    it('skips denylist if no devices found for unit', async () => {
      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([]),
          };
        }
        return {};
      });

      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

      AccessRevocationListenerService.getInstance();

      await mockHandlers.unassigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      expect(mockDenylistModel.create).not.toHaveBeenCalled();
    });

    it('skips sending DENYLIST_ADD command if user route pass is expired', async () => {
      // Clear instance first
      (AccessRevocationListenerService as any).instance = undefined;
      
      const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
      (DenylistOptimizationService.shouldSkipDenylistAdd as jest.Mock).mockResolvedValue(true);

      // Mock database to return devices
      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'dev-123' }]),
          };
        }
        return {};
      });

      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

      // Ensure denylistModel mock is fresh
      mockDenylistModel.create.mockClear();
      (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

      AccessRevocationListenerService.getInstance();

      await mockHandlers.unassigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still create DB entries for audit trail
      expect(mockDenylistModel.create).toHaveBeenCalled();
      
      // But should not send gateway command
      const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
      const gw = GatewayEventsService.getInstance() as any;
      expect(gw.unicastToFacility).not.toHaveBeenCalled();
    });
  });

  describe('tenant assignment', () => {
    it('removes denylist entries when user is re-assigned', async () => {
      // Clear instance first
      (AccessRevocationListenerService as any).instance = undefined;
      
      // Mock DenylistOptimizationService to not skip remove command
      const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
      jest.spyOn(DenylistOptimizationService, 'shouldSkipDenylistRemove').mockReturnValue(false);

      const mockEntries = [
        {
          id: 'entry-1',
          device_id: 'dev-123',
          user_id: 'user-1',
          expires_at: new Date('2024-12-31'),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment' as const,
        },
      ];

      mockDenylistModel.findByUnitsAndUser.mockResolvedValue(mockEntries);
      mockDenylistModel.remove.mockClear();

      // Create proper mock for blulok_devices join query to get facility_id
      const deviceFacilityQuery = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ facility_id: 'fac-1' }),
      };
      const deviceJoinMock = jest.fn().mockReturnValue(deviceFacilityQuery);

      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'dev-123' }]),
            join: deviceJoinMock,
          };
        }
        return {};
      });

      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

      // Ensure denylistModel mock is fresh
      (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

      AccessRevocationListenerService.getInstance();

      await mockHandlers.assigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      const { DenylistService } = await import('@/services/denylist.service');
      expect(DenylistService.buildDenylistRemove).toHaveBeenCalled();
      expect(mockDenylistModel.remove).toHaveBeenCalled();
    });

    it('does nothing if no denylist entries exist', async () => {
      mockDenylistModel.findByUnitsAndUser.mockResolvedValue([]);

      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'dev-123' }]),
          };
        }
        return {};
      });

      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

      AccessRevocationListenerService.getInstance();

      await mockHandlers.assigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
      });

      const { DenylistService } = await import('@/services/denylist.service');
      expect(DenylistService.buildDenylistRemove).not.toHaveBeenCalled();
    });

    it('skips sending DENYLIST_REMOVE command if entry is expired', async () => {
      // Clear instance first
      (AccessRevocationListenerService as any).instance = undefined;
      
      const { DenylistOptimizationService } = await import('@/services/denylist-optimization.service');
      (DenylistOptimizationService.shouldSkipDenylistRemove as jest.Mock).mockReturnValue(true);

      const pastDate = new Date(Date.now() - 1000);
      const mockEntries = [
        {
          id: 'entry-1',
          device_id: 'dev-123',
          user_id: 'user-1',
          expires_at: pastDate,
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment' as const,
        },
      ];

      mockDenylistModel.findByUnitsAndUser.mockResolvedValue(mockEntries);
      mockDenylistModel.remove.mockClear();

      // Mock for initial device query (for the onTenantAssigned handler)
      const deviceSelectMock = jest.fn().mockResolvedValue([{ id: 'dev-123' }]);
      const deviceWhereMock = jest.fn().mockReturnThis();
      
      // Mock for facility lookup per entry - needs to be chainable
      const facilityFirstMock = jest.fn().mockResolvedValue({ facility_id: 'fac-1' });
      const joinBuilder = {
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: facilityFirstMock,
      };
      const joinMock = jest.fn().mockReturnValue(joinBuilder);

      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          const builder: any = {
            where: deviceWhereMock,
            select: deviceSelectMock,
            join: joinMock,
          };
          deviceWhereMock.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const { DatabaseService } = await import('@/services/database.service');
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: mockDb,
      });

      // Ensure denylistModel mock is fresh
      (DenylistEntryModel as jest.MockedClass<typeof DenylistEntryModel>).mockImplementation(() => mockDenylistModel);

      AccessRevocationListenerService.getInstance();

      await mockHandlers.assigned({
        tenantId: 'user-1',
        unitId: 'unit-1',
        facilityId: 'fac-1',
        metadata: { source: 'api', performedBy: 'admin-1' },
      });

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still remove from DB for cleanup
      expect(mockDenylistModel.remove).toHaveBeenCalledWith('dev-123', 'user-1');
      
      // But should not send gateway command
      const { DenylistService } = await import('@/services/denylist.service');
      expect(DenylistService.buildDenylistRemove).not.toHaveBeenCalled();
    });
  });
});


