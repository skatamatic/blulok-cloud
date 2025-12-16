import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { RoutePassIssuanceModel } from '@/models/route-pass-issuance.model';
import { UserFacilityScheduleModel } from '@/models/user-facility-schedule.model';

jest.mock('@/models/route-pass-issuance.model');
jest.mock('@/models/user-facility-schedule.model', () => ({
  UserFacilityScheduleModel: {
    getUserScheduleForFacilityWithDetails: jest.fn().mockResolvedValue(null),
  },
}));
jest.mock('@/models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
    getUserFacilityIds: jest.fn().mockResolvedValue([]),
  },
}));

// Mock DatabaseService before any imports that might use it
const createMockDbConnection = (userDevices: any, lockRows: any[]) => {
  return jest.fn((table: string) => {
    const mockQueryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      whereNull: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      first: jest.fn(),
      then: jest.fn((onFulfilled?: (rows: any[]) => any, _onRejected?: (e: any) => any) => {
        if (onFulfilled) onFulfilled([]);
        return Promise.resolve([]);
      }),
      catch: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue([1]),
      update: jest.fn().mockResolvedValue(1),
      fn: { now: () => new Date() },
      union: jest.fn().mockImplementation(function (otherQuery: any) {
        // For TENANT role, simulate UNION of primary assignments + shared keys
        return Promise.resolve(lockRows);
      }),
    };

    if (table === 'user_devices') {
      mockQueryBuilder.first.mockResolvedValue(userDevices);
      return mockQueryBuilder;
    }
    if (table === 'blulok_devices' || table.startsWith('blulok_devices')) {
      mockQueryBuilder.then = (onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled(lockRows);
        return Promise.resolve(lockRows);
      };
      mockQueryBuilder.first.mockResolvedValue(lockRows[0] || null);
      return mockQueryBuilder;
    }
    if (table === 'unit_assignments') {
      // Mock primary assignments for TENANT role
      mockQueryBuilder.then = (onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled(lockRows);
        return Promise.resolve(lockRows);
      };
      return mockQueryBuilder;
    }
    if (table === 'key_sharing') {
      // Mock shared keys for TENANT role (empty by default for failing tests)
      mockQueryBuilder.then = (onFulfilled?: (rows: any[]) => any) => {
        if (onFulfilled) onFulfilled([]);
        return Promise.resolve([]);
      };
      return mockQueryBuilder;
    }
    if (table === 'system_settings') {
      // Mock for TimeSyncService persistence
      mockQueryBuilder.first.mockResolvedValue(null);
      return mockQueryBuilder;
    }
    return mockQueryBuilder;
  });
};

jest.mock('@/services/database.service');

describe('Passes Routes', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    // Reset DB mock for each test
    (DatabaseService.getInstance as jest.Mock).mockClear();
  });

  describe('TENANT role', () => {
    it('returns route pass scoped to assigned units', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'cHVibGlj' },
          [{ id: 'lock-1' }, { id: 'lock-2' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.routePass).toBe('string');

      // Verify JWT payload contains correct audiences
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.sub).toBe(testData.users.tenant.id);
      expect(payload.device_pubkey).toBe('cHVibGlj');
      expect(Array.isArray(payload.aud)).toBe(true);
    });

    it('logs route pass issuance', async () => {
      const mockRoutePassModel = {
        create: jest.fn().mockResolvedValue({}),
      };
      (RoutePassIssuanceModel as jest.MockedClass<typeof RoutePassIssuanceModel>).mockImplementation(
        () => mockRoutePassModel as any
      );

      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { id: 'device-1', public_key: 'cHVibGlj' },
          [{ id: 'lock-1' }, { id: 'lock-2' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockRoutePassModel.create).toHaveBeenCalled();
      const callArgs = mockRoutePassModel.create.mock.calls[0][0];
      expect(callArgs.userId).toBe(testData.users.tenant.id);
      expect(callArgs.deviceId).toBe('device-1');
      expect(callArgs.audiences).toEqual(['lock:lock-1', 'lock:lock-2']);
      expect(callArgs.jti).toBeDefined();
      expect(callArgs.issuedAt).toBeInstanceOf(Date);
      expect(callArgs.expiresAt).toBeInstanceOf(Date);
    });

    it('includes shared_key:{grantingUserId}:{lockId} for shared access', async () => {
      // Mock DB: differentiate assigned vs shared joins
      const mockKnex = jest.fn((table: string) => {
        if (table === 'user_devices') {
          return {
            where: jest.fn().mockReturnThis(),
            whereIn: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            first: jest.fn().mockResolvedValue({ id: 'dev-1', public_key: 'cHVibGlj', status: 'active' }),
          };
        }
        if (table === 'blulok_devices as bd') {
          const builder: any = {};
          builder._joinTarget = '';
          builder._queries = [];
          builder._lockId = null;
          builder.join = jest.fn().mockImplementation((target: string) => {
            builder._joinTarget = target;
            return builder;
          });
          builder.where = jest.fn().mockImplementation((...args: any[]) => {
            builder._queries.push({ type: 'where', args });
            // Track lock ID for facility lookup
            if (args[0] === 'bd.id') {
              builder._lockId = args[1];
            }
            return builder;
          });
          builder.whereIn = jest.fn().mockReturnThis();
          builder.whereNull = jest.fn().mockReturnThis();
          builder.orWhere = jest.fn().mockReturnThis();
          builder.select = jest.fn().mockImplementation((...args: any[]) => {
            // Return chainable builder, not a promise
            // The actual query will use .first() or await the builder
            builder._selectArgs = args;
            return builder;
          });
          builder.first = jest.fn().mockImplementation(() => {
            // Handle query for facility_id from lock (used in shared key schedule lookup)
            // This happens when: db('blulok_devices as bd').join('units as u', ...).where('bd.id', lockId).select('u.facility_id').first()
            if (builder._joinTarget.includes('units as u') && builder._lockId) {
              return Promise.resolve({ facility_id: 'facility-123' });
            }
            // Handle regular lock queries
            if (builder._joinTarget.includes('unit_assignments')) {
              return Promise.resolve({ id: 'lock-assigned' });
            }
            if (builder._joinTarget.includes('key_sharing')) {
              return Promise.resolve({ device_id: 'lock-shared', owner_user_id: 'owner-123' });
            }
            return Promise.resolve(null);
          });
          
          // Make the builder thenable (so it can be awaited directly)
          builder.then = jest.fn().mockImplementation((resolve: any) => {
            // When awaited directly (without .first()), return array results
            if (builder._joinTarget.includes('unit_assignments')) {
              return Promise.resolve([{ id: 'lock-assigned' }]).then(resolve);
            }
            if (builder._joinTarget.includes('key_sharing')) {
              return Promise.resolve([{ device_id: 'lock-shared', owner_user_id: 'owner-123' }]).then(resolve);
            }
            return Promise.resolve([]).then(resolve);
          });
          builder.fn = { now: () => new Date() };
          return builder;
        }
        // default qb
        return {
          where: jest.fn().mockReturnThis(),
          whereIn: jest.fn().mockReturnThis(),
          whereNull: jest.fn().mockReturnThis(),
          orWhere: jest.fn().mockReturnThis(),
          select: jest.fn().mockResolvedValue([]),
          first: jest.fn().mockResolvedValue(null),
          orderBy: jest.fn().mockReturnThis(),
          fn: { now: () => new Date() },
        };
      });

      (DatabaseService.getInstance as jest.Mock).mockReturnValue({ connection: mockKnex });
      
      // Mock UserFacilityAssociationModel.getUserFacilityIds to return empty array (no facility access needed for TENANT)
      const { UserFacilityAssociationModel } = require('@/models/user-facility-association.model');
      (UserFacilityAssociationModel.getUserFacilityIds as jest.Mock).mockResolvedValue([]);
      
      // Mock UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails to return null (no schedule)
      const { UserFacilityScheduleModel } = require('@/models/user-facility-schedule.model');
      (UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      if (res.status !== 200) {
        console.error('Error response:', res.status, JSON.stringify(res.body, null, 2));
        console.error('Error stack:', res.body.error);
      }
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.aud).toEqual(expect.arrayContaining(['lock:lock-assigned', 'shared_key:owner-123:lock-shared']));
    });
  });

  describe('ADMIN/DEV_ADMIN role', () => {
    it('returns route pass scoped to all locks', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'YWRtaW4=' },
          [{ id: 'lock-all-1' }, { id: 'lock-all-2' }, { id: 'lock-all-3' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.sub).toBe(testData.users.admin.id);
      expect(payload.aud).toEqual(['lock:lock-all-1', 'lock:lock-all-2', 'lock:lock-all-3']);
    });
  });

  describe('FACILITY_ADMIN role', () => {
    it('returns route pass scoped to locks in assigned facilities', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(
          { public_key: 'ZmFjaWw=' },
          [{ id: 'lock-fac-1' }]
        ),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const payload = await Ed25519Service.verifyJwt(res.body.routePass);
      expect(payload.aud).toEqual(['lock:lock-fac-1']);
    });
  });

  describe('Error cases', () => {
    it('returns 409 when no device is registered', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(null, []),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(409);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 when X-App-Device-Id provided but device not found', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: createMockDbConnection(null, []),
      });

      const res = await request(app)
        .post('/api/v1/passes/request')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .set('X-App-Device-Id', 'unknown-device')
        .expect(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Unknown or unregistered device');
    });
  });
});


