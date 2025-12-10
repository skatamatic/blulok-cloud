import { DenylistEntryModel, DeviceDenylistEntry } from '@/models/denylist-entry.model';
import { DatabaseService } from '@/services/database.service';

jest.mock('@/services/database.service');

describe('DenylistEntryModel', () => {
  let model: DenylistEntryModel;
  let mockKnex: any;

  beforeEach(() => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      whereNotNull: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue([1]),
      del: jest.fn().mockResolvedValue(1),
    };

    mockKnex = jest.fn((table: string) => {
      if (table === 'blulok_devices') {
        return {
          whereIn: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([{ id: 'device-1' }, { id: 'device-2' }]),
        };
      }
      return mockQueryBuilder;
    });

    // Add fn property for date functions
    mockKnex.fn = { now: () => new Date() };

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockKnex,
    });

    model = new DenylistEntryModel();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a new denylist entry', async () => {
      const mockEntry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: new Date('2024-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'unit_unassignment',
      };

      const delMock = jest.fn().mockResolvedValue(1);
      const insertMock = jest.fn().mockResolvedValue([1]);
      const firstMock = jest.fn().mockResolvedValue(mockEntry);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            del: delMock,
            insert: insertMock,
            first: firstMock,
            fn: { now: () => new Date() },
          };
          builder.where.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.create({
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: new Date('2024-12-31'),
        source: 'unit_unassignment',
        created_by: 'admin-1',
      });

      expect(delMock).toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('handles permanent entries (null expires_at)', async () => {
      const mockEntry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        source: 'user_deactivation',
      };

      const delMock = jest.fn().mockResolvedValue(1);
      const insertMock = jest.fn().mockResolvedValue([1]);
      const firstMock = jest.fn().mockResolvedValue(mockEntry);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            del: delMock,
            insert: insertMock,
            first: firstMock,
            fn: { now: () => new Date() },
          };
          builder.where.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      await model.create({
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: null,
        source: 'user_deactivation',
      });

      expect(insertMock).toHaveBeenCalled();
    });
  });

  describe('findByDevice', () => {
    it('returns active entries for a device', async () => {
      const mockEntries: DeviceDenylistEntry[] = [
        {
          id: 'entry-1',
          device_id: 'device-1',
          user_id: 'user-1',
          expires_at: new Date('2024-12-31'),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment',
        },
      ];

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = Promise.resolve(mockEntries);
          builder.where = jest.fn().mockReturnValue(builder);
          builder.whereNull = jest.fn().mockReturnValue(builder);
          builder.orWhere = jest.fn().mockReturnValue(builder);
          builder.orderBy = jest.fn().mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.findByDevice('device-1');
      expect(result).toEqual(mockEntries);
    });
  });

  describe('findByUser', () => {
    it('returns active entries for a user', async () => {
      const mockEntries: DeviceDenylistEntry[] = [
        {
          id: 'entry-1',
          device_id: 'device-1',
          user_id: 'user-1',
          expires_at: new Date('2024-12-31'),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment',
        },
      ];

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = Promise.resolve(mockEntries);
          builder.where = jest.fn().mockReturnValue(builder);
          builder.whereNull = jest.fn().mockReturnValue(builder);
          builder.orWhere = jest.fn().mockReturnValue(builder);
          builder.orderBy = jest.fn().mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.findByUser('user-1');
      expect(result).toEqual(mockEntries);
    });
  });

  describe('findByDeviceAndUser', () => {
    it('returns entry if user is denied on device', async () => {
      const mockEntry: DeviceDenylistEntry = {
        id: 'entry-1',
        device_id: 'device-1',
        user_id: 'user-1',
        expires_at: new Date('2024-12-31'),
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 'admin-1',
        source: 'unit_unassignment',
      };

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = Promise.resolve(mockEntry);
          builder.where = jest.fn().mockImplementation((cbOrVal: any) => {
            if (typeof cbOrVal === 'function') {
              cbOrVal(builder);
              return builder;
            }
            return builder;
          });
          builder.whereNull = jest.fn().mockReturnValue(builder);
          builder.orWhere = jest.fn().mockReturnValue(builder);
          builder.first = jest.fn().mockReturnValue(Promise.resolve(mockEntry));
          return builder;
        }
        return {};
      });

      const result = await model.findByDeviceAndUser('device-1', 'user-1');
      expect(result).toEqual(mockEntry);
    });

    it('returns null if no active entry exists', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = Promise.resolve(null);
          builder.where = jest.fn().mockImplementation((cbOrVal: any) => {
            if (typeof cbOrVal === 'function') {
              cbOrVal(builder);
              return builder;
            }
            return builder;
          });
          builder.whereNull = jest.fn().mockReturnValue(builder);
          builder.orWhere = jest.fn().mockReturnValue(builder);
          builder.first = jest.fn().mockReturnValue(Promise.resolve(null));
          return builder;
        }
        return {};
      });

      const result = await model.findByDeviceAndUser('device-1', 'user-1');
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes entry for device-user pair', async () => {
      const delMock = jest.fn().mockResolvedValue(1);
      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          return {
            where: jest.fn().mockReturnValue({
              del: delMock,
            }),
          };
        }
        return {};
      });

      const result = await model.remove('device-1', 'user-1');
      expect(result).toBe(true);
      expect(delMock).toHaveBeenCalled();
    });
  });

  describe('pruneExpired', () => {
    it('removes expired entries', async () => {
      const delMock = jest.fn().mockResolvedValue(5);
      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          return {
            whereNotNull: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                del: delMock,
              }),
            }),
          };
        }
        return {};
      });

      const result = await model.pruneExpired();
      expect(result).toBe(5);
    });
  });

  describe('removeForUnits', () => {
    it('removes entries for devices in specified units', async () => {
      const delMock = jest.fn().mockResolvedValue(2);
      mockKnex.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            whereIn: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([{ id: 'device-1' }, { id: 'device-2' }]),
            }),
          };
        }
        if (table === 'device_denylist_entries') {
          return {
            where: jest.fn().mockReturnValue({
              whereIn: jest.fn().mockReturnValue({
                del: delMock,
              }),
            }),
          };
        }
        return {};
      });

      const result = await model.removeForUnits(['unit-1', 'unit-2'], 'user-1');
      expect(result).toBe(2);
    });

    it('returns 0 if no devices found for units', async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            whereIn: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([]),
            }),
          };
        }
        return {};
      });

      const result = await model.removeForUnits(['unit-1'], 'user-1');
      expect(result).toBe(0);
    });
  });

  describe('findByUnitsAndUser', () => {
    it('finds entries for devices in specified units', async () => {
      const mockEntries: DeviceDenylistEntry[] = [
        {
          id: 'entry-1',
          device_id: 'device-1',
          user_id: 'user-1',
          expires_at: new Date('2024-12-31'),
          created_at: new Date(),
          updated_at: new Date(),
          created_by: 'admin-1',
          source: 'unit_unassignment',
        },
      ];

      mockKnex.mockImplementation((table: string) => {
        if (table === 'blulok_devices') {
          return {
            whereIn: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue([{ id: 'device-1' }]),
            }),
          };
        }
        if (table === 'device_denylist_entries') {
          const builder: any = Promise.resolve(mockEntries);
          builder.where = jest.fn().mockReturnValue(builder);
          builder.whereIn = jest.fn().mockReturnValue(builder);
          builder.whereNull = jest.fn().mockReturnValue(builder);
          builder.orWhere = jest.fn().mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.findByUnitsAndUser(['unit-1'], 'user-1');
      expect(result).toEqual(mockEntries);
    });
  });

  describe('bulkCreate', () => {
    it('bulk creates multiple denylist entries in a single insert', async () => {
      const delMock = jest.fn().mockResolvedValue(0);
      const insertMock = jest.fn().mockResolvedValue([1, 2, 3]);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          const builder: any = {
            where: jest.fn().mockImplementation((cbOrVal: any) => {
              if (typeof cbOrVal === 'function') {
                cbOrVal(builder);
              }
              return builder;
            }),
            orWhere: jest.fn().mockReturnThis(),
            del: delMock,
            insert: insertMock,
          };
          return builder;
        }
        return {};
      });

      await model.bulkCreate([
        { device_id: 'device-1', user_id: 'user-1', expires_at: new Date('2024-12-31'), source: 'unit_unassignment', created_by: 'admin-1' },
        { device_id: 'device-2', user_id: 'user-1', expires_at: new Date('2024-12-31'), source: 'unit_unassignment', created_by: 'admin-1' },
        { device_id: 'device-3', user_id: 'user-1', expires_at: new Date('2024-12-31'), source: 'unit_unassignment', created_by: 'admin-1' },
      ]);

      // Should delete existing entries in one query
      expect(delMock).toHaveBeenCalledTimes(1);
      // Should insert all entries in one query
      expect(insertMock).toHaveBeenCalledTimes(1);
      const insertCall = insertMock.mock.calls[0][0];
      expect(insertCall).toHaveLength(3);
      expect(insertCall[0].device_id).toBe('device-1');
      expect(insertCall[1].device_id).toBe('device-2');
      expect(insertCall[2].device_id).toBe('device-3');
    });

    it('does nothing when entries array is empty', async () => {
      const delMock = jest.fn();
      const insertMock = jest.fn();

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          return {
            where: jest.fn().mockReturnThis(),
            del: delMock,
            insert: insertMock,
          };
        }
        return {};
      });

      await model.bulkCreate([]);

      expect(delMock).not.toHaveBeenCalled();
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe('bulkRemove', () => {
    it('bulk removes multiple denylist entries in a single delete', async () => {
      const delMock = jest.fn().mockResolvedValue(3);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          return {
            whereIn: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                del: delMock,
              }),
            }),
          };
        }
        return {};
      });

      const result = await model.bulkRemove(['device-1', 'device-2', 'device-3'], 'user-1');

      expect(result).toBe(3);
      expect(delMock).toHaveBeenCalledTimes(1);
    });

    it('returns 0 when deviceIds array is empty', async () => {
      const delMock = jest.fn();

      mockKnex.mockImplementation((table: string) => {
        if (table === 'device_denylist_entries') {
          return {
            whereIn: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                del: delMock,
              }),
            }),
          };
        }
        return {};
      });

      const result = await model.bulkRemove([], 'user-1');

      expect(result).toBe(0);
      expect(delMock).not.toHaveBeenCalled();
    });
  });
});

