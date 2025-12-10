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
    // Mock JWT strings for denylist commands (inline to avoid hoisting issues)
    buildDenylistAdd: jest.fn().mockResolvedValue('eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCbHVDbG91ZDpSb290IiwiY21kX3R5cGUiOiJERU5ZTElTVF9BREQiLCJkZW55bGlzdF9hZGQiOltdfQ.mock-sig'),
    buildDenylistRemove: jest.fn().mockResolvedValue('eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCbHVDbG91ZDpSb290IiwiY21kX3R5cGUiOiJERU5ZTElTVF9SRU1PVkUiLCJkZW55bGlzdF9yZW1vdmUiOltdfQ.mock-sig'),
  },
}));

jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({}),
    bulkCreate: jest.fn().mockResolvedValue(undefined),
    findByUnitsAndUser: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(true),
    bulkRemove: jest.fn().mockResolvedValue(1),
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
      bulkCreate: jest.fn().mockResolvedValue(undefined),
      findByUnitsAndUser: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(true),
      bulkRemove: jest.fn().mockResolvedValue(1),
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

      // Now uses bulkCreate for efficiency
      expect(mockDenylistModel.bulkCreate).toHaveBeenCalled();
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

      expect(mockDenylistModel.bulkCreate).not.toHaveBeenCalled();
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
      mockDenylistModel.bulkCreate.mockClear();
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

      // Should still create DB entries for audit trail (using bulkCreate now)
      expect(mockDenylistModel.bulkCreate).toHaveBeenCalled();
      
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
      mockDenylistModel.bulkRemove.mockClear();

      // Mock for both initial device query AND batch facility lookup
      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'dev-123' }]),
            join: jest.fn().mockReturnValue({
              whereIn: jest.fn().mockReturnThis(),
              select: jest.fn().mockResolvedValue([{ device_id: 'dev-123', facility_id: 'fac-1' }]),
            }),
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
      // Now uses bulkRemove for efficiency
      expect(mockDenylistModel.bulkRemove).toHaveBeenCalled();
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
      mockDenylistModel.bulkRemove.mockClear();

      // Mock for both initial device query AND batch facility lookup
      mockDb.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            select: jest.fn().mockResolvedValue([{ id: 'dev-123' }]),
            join: jest.fn().mockReturnValue({
              whereIn: jest.fn().mockReturnThis(),
              select: jest.fn().mockResolvedValue([{ device_id: 'dev-123', facility_id: 'fac-1' }]),
            }),
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
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still remove from DB for cleanup (using bulkRemove now)
      expect(mockDenylistModel.bulkRemove).toHaveBeenCalledWith(['dev-123'], 'user-1');
      
      // But should not send gateway command
      const { DenylistService } = await import('@/services/denylist.service');
      expect(DenylistService.buildDenylistRemove).not.toHaveBeenCalled();
    });
  });
});


