import { RoutePassIssuanceModel, RoutePassIssuanceLog } from '@/models/route-pass-issuance.model';
import { DatabaseService } from '@/services/database.service';

jest.mock('@/services/database.service');

describe('RoutePassIssuanceModel', () => {
  let model: RoutePassIssuanceModel;
  let mockKnex: any;

  beforeEach(() => {
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn().mockResolvedValue([1]),
      count: jest.fn().mockReturnThis(),
    };

    mockKnex = jest.fn((table: string) => {
      return mockQueryBuilder;
    });

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockKnex,
    });

    model = new RoutePassIssuanceModel();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a new route pass issuance log entry', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const mockEntry: RoutePassIssuanceLog = {
        id: 'log-1',
        user_id: 'user-1',
        device_id: 'device-1',
        audiences: ['lock:lock-1', 'lock:lock-2'],
        jti: 'jwt-id-123',
        issued_at: now,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      };

      const insertMock = jest.fn().mockReturnThis();
      const returningMock = jest.fn().mockResolvedValue([{
        ...mockEntry,
        audiences: JSON.stringify(mockEntry.audiences),
      }]);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            insert: insertMock,
          };
        }
        return {};
      });

      insertMock.mockReturnValue({
        returning: returningMock,
      });

      const result = await model.create({
        userId: 'user-1',
        deviceId: 'device-1',
        audiences: ['lock:lock-1', 'lock:lock-2'],
        jti: 'jwt-id-123',
        issuedAt: now,
        expiresAt,
      });

      expect(insertMock).toHaveBeenCalledWith({
        id: expect.any(String),
        user_id: 'user-1',
        device_id: 'device-1',
        audiences: JSON.stringify(['lock:lock-1', 'lock:lock-2']),
        jti: 'jwt-id-123',
        issued_at: now,
        expires_at: expiresAt,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      });
      expect(result.audiences).toEqual(['lock:lock-1', 'lock:lock-2']);
    });
  });

  describe('getLastIssuanceForUser', () => {
    it('returns the most recent route pass for a user', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const mockEntry = {
        id: 'log-1',
        user_id: 'user-1',
        device_id: 'device-1',
        audiences: JSON.stringify(['lock:lock-1']),
        jti: 'jwt-id-123',
        issued_at: now,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      };

      const firstMock = jest.fn().mockResolvedValue(mockEntry);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: firstMock,
          };
        }
        return {};
      });

      const result = await model.getLastIssuanceForUser('user-1');

      expect(firstMock).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.audiences).toEqual(['lock:lock-1']);
    });

    it('returns undefined if no route pass exists', async () => {
      const firstMock = jest.fn().mockResolvedValue(undefined);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: firstMock,
          };
        }
        return {};
      });

      const result = await model.getLastIssuanceForUser('user-1');

      expect(result).toBeUndefined();
    });
  });

  describe('isUserPassExpired', () => {
    it('returns true if user has no route passes', async () => {
      const firstMock = jest.fn().mockResolvedValue(undefined);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: firstMock,
          };
        }
        return {};
      });

      const result = await model.isUserPassExpired('user-1');
      expect(result).toBe(true);
    });

    it('returns true if last route pass is expired', async () => {
      const now = new Date();
      const expiredAt = new Date(now.getTime() - 1000); // Expired 1 second ago
      
      const mockEntry = {
        id: 'log-1',
        user_id: 'user-1',
        device_id: 'device-1',
        audiences: JSON.stringify(['lock:lock-1']),
        jti: 'jwt-id-123',
        issued_at: new Date(now.getTime() - 25 * 60 * 60 * 1000),
        expires_at: expiredAt,
        created_at: now,
        updated_at: now,
      };

      const firstMock = jest.fn().mockResolvedValue(mockEntry);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: firstMock,
          };
        }
        return {};
      });

      const result = await model.isUserPassExpired('user-1');
      expect(result).toBe(true);
    });

    it('returns false if last route pass is still valid', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const mockEntry = {
        id: 'log-1',
        user_id: 'user-1',
        device_id: 'device-1',
        audiences: JSON.stringify(['lock:lock-1']),
        jti: 'jwt-id-123',
        issued_at: now,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      };

      const firstMock = jest.fn().mockResolvedValue(mockEntry);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: firstMock,
          };
        }
        return {};
      });

      const result = await model.isUserPassExpired('user-1');
      expect(result).toBe(false);
    });
  });

  describe('getUserHistory', () => {
    it('returns paginated route pass history', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const mockEntries = [
        {
          id: 'log-1',
          user_id: 'user-1',
          device_id: 'device-1',
          audiences: JSON.stringify(['lock:lock-1']),
          jti: 'jwt-id-123',
          issued_at: now,
          expires_at: expiresAt,
          created_at: now,
          updated_at: now,
        },
        {
          id: 'log-2',
          user_id: 'user-1',
          device_id: 'device-2',
          audiences: JSON.stringify(['lock:lock-2']),
          jti: 'jwt-id-456',
          issued_at: new Date(now.getTime() - 1000),
          expires_at: new Date(now.getTime() + 23 * 60 * 60 * 1000),
          created_at: now,
          updated_at: now,
        },
      ];

      const builder: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue(mockEntries),
      };

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return builder;
        }
        return {};
      });

      const result = await model.getUserHistory('user-1', { limit: 50, offset: 0 });

      expect(result).toHaveLength(2);
      expect(result[0].audiences).toEqual(['lock:lock-1']);
      expect(result[1].audiences).toEqual(['lock:lock-2']);
    });

    it('applies date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const builder: any = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockResolvedValue([]),
      };

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          return builder;
        }
        return {};
      });

      await model.getUserHistory('user-1', {
        limit: 50,
        offset: 0,
        startDate,
        endDate,
      });

      expect(mockKnex).toHaveBeenCalledWith('route_pass_issuance_log');
      expect(builder.where).toHaveBeenCalledWith('issued_at', '>=', startDate);
      expect(builder.where).toHaveBeenCalledWith('issued_at', '<=', endDate);
    });
  });

  describe('getUserHistoryCount', () => {
    it('returns total count of route passes', async () => {
      const countMock = jest.fn().mockResolvedValue({ count: 5 });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: countMock,
          };
          builder.where.mockReturnValue(builder);
          builder.count.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.getUserHistoryCount('user-1');

      expect(result).toBe(5);
    });

    it('returns 0 if no result', async () => {
      const countMock = jest.fn().mockResolvedValue(undefined);

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: countMock,
          };
          builder.where.mockReturnValue(builder);
          builder.count.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.getUserHistoryCount('user-1');

      expect(result).toBe(0);
    });

    it('handles numeric count values', async () => {
      const countMock = jest.fn().mockResolvedValue({ count: 10 });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: countMock,
          };
          builder.where.mockReturnValue(builder);
          builder.count.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.getUserHistoryCount('user-1');

      expect(result).toBe(10);
    });

    it('handles string count values', async () => {
      const countMock = jest.fn().mockResolvedValue({ count: '15' });

      mockKnex.mockImplementation((table: string) => {
        if (table === 'route_pass_issuance_log') {
          const builder: any = {
            where: jest.fn().mockReturnThis(),
            count: jest.fn().mockReturnThis(),
            first: countMock,
          };
          builder.where.mockReturnValue(builder);
          builder.count.mockReturnValue(builder);
          return builder;
        }
        return {};
      });

      const result = await model.getUserHistoryCount('user-1');

      expect(result).toBe(15);
    });
  });
});

