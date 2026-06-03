import { ActivityLogModel, ActivityLog, CreateActivityLogData, ActivityLogFilters } from '@/models/activity-log.model';
import { DatabaseService } from '@/services/database.service';

// Mock the DatabaseService
jest.mock('@/services/database.service');

describe('ActivityLogModel', () => {
  let model: ActivityLogModel;
  let mockKnex: any;

  const mockActivityLog: ActivityLog = {
    id: 'activity-1',
    entity_type: 'device',
    entity_id: 'device-1',
    activity_type: 'lock',
    title: 'Device Locked',
    description: 'Device was locked by user',
    actor_type: 'user',
    actor_id: 'user-1',
    actor_name: 'John Doe',
    result: 'success',
    result_message: null,
    facility_id: 'facility-1',
    unit_id: 'unit-1',
    device_id: 'device-1',
    metadata: null,
    ip_address: '192.168.1.1',
    occurred_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock query builder
    mockKnex = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      del: jest.fn().mockResolvedValue(1),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue(mockActivityLog),
    });

    // Mock DatabaseService
    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockKnex,
    });

    model = new ActivityLogModel();
  });

  describe('create', () => {
    it('should create an activity log with required fields', async () => {
      const data: CreateActivityLogData = {
        entity_type: 'device',
        entity_id: 'device-1',
        activity_type: 'lock',
        title: 'Device Locked',
        actor_type: 'user',
      };

      mockKnex.mockReturnValue({
        insert: jest.fn().mockResolvedValue([1]),
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockActivityLog),
        }),
      });

      const result = await model.create(data);

      expect(result).toBeDefined();
      expect(result.activity_type).toBe('lock');
    });

    it('should create an activity log with all fields', async () => {
      const data: CreateActivityLogData = {
        entity_type: 'unit',
        entity_id: 'unit-1',
        activity_type: 'assignment_change',
        title: 'User Assigned',
        description: 'User was assigned to the unit',
        actor_type: 'user',
        actor_id: 'admin-1',
        actor_name: 'Admin User',
        result: 'success',
        facility_id: 'facility-1',
        unit_id: 'unit-1',
        metadata: { previousAssignment: null },
        ip_address: '192.168.1.1',
      };

      mockKnex.mockReturnValue({
        insert: jest.fn().mockResolvedValue([1]),
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ ...mockActivityLog, ...data }),
        }),
      });

      const result = await model.create(data);

      expect(result).toBeDefined();
    });
  });

  describe('findById', () => {
    it('should find an activity log by ID', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(mockActivityLog),
        }),
      });

      const result = await model.findById('activity-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('activity-1');
    });

    it('should return null if activity log not found', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await model.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('find', () => {
    it('should find activity logs with filters', async () => {
      const mockLogs = [mockActivityLog, { ...mockActivityLog, id: 'activity-2' }];

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve(mockLogs).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      const filters: ActivityLogFilters = {
        facility_id: 'facility-1',
        activity_type: 'lock',
        limit: 10,
      };

      const result = await model.find(filters);

      expect(result).toHaveLength(2);
    });

    it('should filter by date range', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve([mockActivityLog]).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      const filters: ActivityLogFilters = {
        from_date: new Date('2024-01-01'),
        to_date: new Date('2024-12-31'),
      };

      const result = await model.find(filters);

      expect(result).toHaveLength(1);
    });
  });

  describe('count', () => {
    it('should count activity logs with filters', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({ count: '15' }),
        }),
      });

      const result = await model.count({ facility_id: 'facility-1' });

      expect(result).toBe(15);
    });
  });

  describe('getActivityStats', () => {
    it('aggregates lock, unlock, and access_attempt activity types', async () => {
      const whereIn = jest.fn().mockReturnThis();
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        whereIn,
        whereBetween: jest.fn().mockReturnThis(),
        whereRaw: jest.fn().mockReturnThis(),
        groupByRaw: jest.fn().mockReturnThis(),
        orderByRaw: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve([]).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);
      mockKnex.raw = jest.fn((sql: string) => sql);

      await model.getActivityStats({
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        groupBy: 'day',
      });

      expect(whereIn).toHaveBeenCalledWith(
        'activity_logs.activity_type',
        ['access_attempt', 'lock', 'unlock', 'locking', 'unlocking'],
      );
      expect(mockQueryBuilder.groupByRaw).toHaveBeenCalledWith(
        expect.stringContaining('activity_logs.activity_type'),
      );
    });
  });

  describe('findWithContext', () => {
    it('selects device context from valid schema columns', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve([]).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      await model.findWithContext({ facility_id: 'facility-1', limit: 5 });

      const selectArgs = mockQueryBuilder.select.mock.calls[0] as string[];
      expect(selectArgs).toContain('blulok_devices.device_serial');
      expect(selectArgs).toContain('blulok_devices.device_serial as blulok_device_name');
      expect(selectArgs).toContain('access_control_devices.location_description as device_location');
      expect(selectArgs).not.toContain('blulok_devices.name as blulok_device_name');
      expect(selectArgs).not.toContain('blulok_devices.location_description as device_location');
    });
  });

  describe('getUnitActivity', () => {
    it('should get activity for a specific unit', async () => {
      const mockLogsWithContext = [
        { ...mockActivityLog, unit_number: 'A-101', facility_name: 'Test Facility' },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve(mockLogsWithContext).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      const result = await model.getUnitActivity('unit-1');

      expect(result).toHaveLength(1);
      expect(result[0].unit_number).toBe('A-101');
    });
  });

  describe('getDeviceActivity', () => {
    it('should get activity for a specific device', async () => {
      const mockLogsWithContext = [
        { ...mockActivityLog, device_serial: 'SN-12345', facility_name: 'Test Facility' },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
      };
      (mockQueryBuilder as any).then = (resolve: any) => Promise.resolve(mockLogsWithContext).then(resolve);

      mockKnex.mockReturnValue(mockQueryBuilder);

      const result = await model.getDeviceActivity('device-1');

      expect(result).toHaveLength(1);
      expect(result[0].device_serial).toBe('SN-12345');
    });
  });

  describe('cleanupOld', () => {
    it('should delete old activity logs', async () => {
      mockKnex.mockReturnValue({
        where: jest.fn().mockReturnValue({
          del: jest.fn().mockResolvedValue(100),
        }),
      });

      const result = await model.cleanupOld(90);

      expect(result).toBe(100);
    });
  });
});
