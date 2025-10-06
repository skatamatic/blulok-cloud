import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

// DatabaseService is already mocked in setup-mocks.ts

// Mock the UnitsService
const mockCreatedUnits = new Map();
jest.mock('@/services/units.service', () => ({
  UnitsService: {
    getInstance: jest.fn(() => ({
      createUnit: jest.fn().mockImplementation((data) => {
        const key = `${data.unit_number}-${data.facility_id}`;
        if (mockCreatedUnits.has(key)) {
          return Promise.reject(new Error('Unit number already exists in this facility'));
        }
        mockCreatedUnits.set(key, true);
        return Promise.resolve({
          id: '550e8400-e29b-41d4-a716-446655440011',
          unit_number: data.unit_number,
          unit_type: data.unit_type,
          facility_id: data.facility_id,
          status: data.status,
          size_sqft: data.size_sqft,
          monthly_rate: data.monthly_rate,
          description: data.description,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        });
      }),
      getUnits: jest.fn().mockResolvedValue({
        units: [],
        total: 0
      }),
      hasUserAccessToUnit: jest.fn().mockResolvedValue(true)
    })),
  },
}));

// Mock the WebSocketService
jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn(() => ({
      broadcastBatteryStatusUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastUnitsUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastDashboardLayoutUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastLogsUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastGeneralStatsUpdate: jest.fn().mockResolvedValue(undefined),
      sendDiagnostics: jest.fn().mockResolvedValue(undefined),
      sendError: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockResolvedValue(undefined),
      unsubscribe: jest.fn().mockResolvedValue(undefined),
      isWebSocketConnected: jest.fn().mockReturnValue(false)
    })),
  },
}));

// Mock Knex for database operations
const createMockKnex = () => {
  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    whereNotBetween: jest.fn().mockReturnThis(),
    whereExists: jest.fn().mockReturnThis(),
    whereNotExists: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereNotIn: jest.fn().mockReturnThis(),
    orWhereNull: jest.fn().mockReturnThis(),
    orWhereNotNull: jest.fn().mockReturnThis(),
    orWhereBetween: jest.fn().mockReturnThis(),
    orWhereNotBetween: jest.fn().mockReturnThis(),
    orWhereExists: jest.fn().mockReturnThis(),
    orWhereNotExists: jest.fn().mockReturnThis(),
    orWhereRaw: jest.fn().mockReturnThis(),
    join: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    rightJoin: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    outerJoin: jest.fn().mockReturnThis(),
    crossJoin: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    groupByRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    orderByRaw: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    havingRaw: jest.fn().mockReturnThis(),
    havingIn: jest.fn().mockReturnThis(),
    havingNotIn: jest.fn().mockReturnThis(),
    havingNull: jest.fn().mockReturnThis(),
    havingNotNull: jest.fn().mockReturnThis(),
    havingBetween: jest.fn().mockReturnThis(),
    havingNotBetween: jest.fn().mockReturnThis(),
    havingExists: jest.fn().mockReturnThis(),
    havingNotExists: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    countDistinct: jest.fn().mockReturnThis(),
    min: jest.fn().mockReturnThis(),
    max: jest.fn().mockReturnThis(),
    sum: jest.fn().mockReturnThis(),
    sumDistinct: jest.fn().mockReturnThis(),
    avg: jest.fn().mockReturnThis(),
    avgDistinct: jest.fn().mockReturnThis(),
    increment: jest.fn().mockReturnThis(),
    decrement: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue([1]),
    update: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    delete: jest.fn().mockResolvedValue(1),
    truncate: jest.fn().mockResolvedValue(undefined),
    clone: jest.fn().mockReturnThis(),
    modify: jest.fn().mockReturnThis(),
    columnInfo: jest.fn().mockResolvedValue({}),
    debug: jest.fn().mockReturnThis(),
    pluck: jest.fn().mockResolvedValue([]),
    first: jest.fn().mockResolvedValue(undefined),
    clearSelect: jest.fn().mockReturnThis(),
    clearWhere: jest.fn().mockReturnThis(),
    clearOrder: jest.fn().mockReturnThis(),
    clearHaving: jest.fn().mockReturnThis(),
    clearCounters: jest.fn().mockReturnThis(),
    clearGroup: jest.fn().mockReturnThis(),
    clearUnion: jest.fn().mockReturnThis(),
    union: jest.fn().mockReturnThis(),
    unionAll: jest.fn().mockReturnThis(),
    intersect: jest.fn().mockReturnThis(),
    except: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockReturnThis(),
    forShare: jest.fn().mockReturnThis(),
    forNoKeyUpdate: jest.fn().mockReturnThis(),
    forKeyShare: jest.fn().mockReturnThis(),
    skipLocked: jest.fn().mockReturnThis(),
    noWait: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    ignore: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
    returning: jest.fn().mockReturnThis(),
    transacting: jest.fn().mockReturnThis(),
    connection: jest.fn().mockReturnThis(),
    timeout: jest.fn().mockReturnThis(),
    queryContext: jest.fn().mockReturnThis(),
    then: jest.fn().mockResolvedValue([]),
    catch: jest.fn().mockResolvedValue([]),
    finally: jest.fn().mockResolvedValue([]),
    toQuery: jest.fn().mockReturnValue(''),
    toString: jest.fn().mockReturnValue(''),
    toSQL: jest.fn().mockReturnValue({ sql: '', bindings: [] }),
    on: jest.fn().mockReturnThis(),
    andOn: jest.fn().mockReturnThis(),
    orOn: jest.fn().mockReturnThis(),
    onIn: jest.fn().mockReturnThis(),
    andOnIn: jest.fn().mockReturnThis(),
    orOnIn: jest.fn().mockReturnThis(),
    onNotIn: jest.fn().mockReturnThis(),
    andOnNotIn: jest.fn().mockReturnThis(),
    orOnNotIn: jest.fn().mockReturnThis(),
    onNull: jest.fn().mockReturnThis(),
    andOnNull: jest.fn().mockReturnThis(),
    orOnNull: jest.fn().mockReturnThis(),
    onNotNull: jest.fn().mockReturnThis(),
    andOnNotNull: jest.fn().mockReturnThis(),
    orOnNotNull: jest.fn().mockReturnThis(),
    onExists: jest.fn().mockReturnThis(),
    andOnExists: jest.fn().mockReturnThis(),
    orOnExists: jest.fn().mockReturnThis(),
    onNotExists: jest.fn().mockReturnThis(),
    andOnNotExists: jest.fn().mockReturnThis(),
    orOnNotExists: jest.fn().mockReturnThis(),
    onBetween: jest.fn().mockReturnThis(),
    andOnBetween: jest.fn().mockReturnThis(),
    orOnBetween: jest.fn().mockReturnThis(),
    onNotBetween: jest.fn().mockReturnThis(),
    andOnNotBetween: jest.fn().mockReturnThis(),
    orOnNotBetween: jest.fn().mockReturnThis(),
    onRaw: jest.fn().mockReturnThis(),
    andOnRaw: jest.fn().mockReturnThis(),
    orOnRaw: jest.fn().mockReturnThis(),
  };

  return {
    ...mockQueryBuilder,
    raw: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation((callback) => {
      const mockTrx = createMockKnex();
      return callback(mockTrx);
    }),
    schema: {
      createTable: jest.fn().mockResolvedValue(undefined),
      dropTable: jest.fn().mockResolvedValue(undefined),
      hasTable: jest.fn().mockResolvedValue(true),
      hasColumn: jest.fn().mockResolvedValue(true),
      dropColumn: jest.fn().mockResolvedValue(undefined),
      renameColumn: jest.fn().mockResolvedValue(undefined),
      alterTable: jest.fn().mockResolvedValue(undefined),
    },
    migrate: {
      latest: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue(undefined),
    },
    seed: {
      run: jest.fn().mockResolvedValue(undefined),
    },
    destroy: jest.fn().mockResolvedValue(undefined),
  };
};

describe('Unit Creation Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    testData = createMockTestData();
    // Reset the mock state between tests
    mockCreatedUnits.clear();
  });

  describe('POST /api/v1/units - Create Unit', () => {
    const getValidUnitData = () => ({
      unit_number: 'A-101',
      facility_id: testData.facilities.facility1.id,
      unit_type: 'Small',
      status: 'available',
      size_sqft: 25.00,
      monthly_rate: 89.99,
      description: 'Small storage unit on ground floor',
      features: ['ground_floor', 'drive_up_access'],
      metadata: { notes: 'Test unit' }
    });

    it('should create unit for ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(getValidUnitData())
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit.unit_number).toBe(getValidUnitData().unit_number);
      expect(response.body.unit.facility_id).toBe(getValidUnitData().facility_id);
    });

    it('should create unit for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(getValidUnitData())
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
    });

    it('should create unit for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(getValidUnitData())
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(getValidUnitData())
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(getValidUnitData())
        .expect(403);

      expectForbidden(response);
    });

    it('should return 401 for unauthenticated request', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .send(getValidUnitData())
        .expect(401);

      expectUnauthorized(response);
    });

    it('should validate required fields', async () => {
      const invalidData = {
        // Missing required fields
        unit_type: 'Small'
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('"unit_number" is required');
      // Note: Joi validation stops at first error, so facility_id error may not appear
    });

    it('should validate unit number format', async () => {
      const invalidData = {
        ...getValidUnitData(),
        unit_number: '' // Empty unit number
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('Unit number is required');
    });

    it('should validate facility ID format', async () => {
      const invalidData = {
        ...getValidUnitData(),
        facility_id: 'invalid-uuid'
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('Facility ID must be a valid UUID');
    });

    it('should validate status enum', async () => {
      const invalidData = {
        ...getValidUnitData(),
        status: 'invalid_status'
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('Status must be one of: available, occupied, maintenance, reserved');
    });

    it('should validate numeric fields', async () => {
      const invalidData = {
        ...getValidUnitData(),
        size_sqft: -10, // Negative size
        monthly_rate: 'invalid' // Invalid rate
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('Size must be a positive number');
    });

    it('should handle duplicate unit numbers in same facility', async () => {
      // First create a unit
      await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(getValidUnitData())
        .expect(201);

      // Try to create another unit with same number in same facility
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(getValidUnitData())
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should allow same unit number in different facilities', async () => {
      // Create unit in first facility
      await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(getValidUnitData())
        .expect(201);

      // Create unit with same number in different facility
      const differentFacilityData = {
        ...getValidUnitData(),
        facility_id: testData.facilities.facility2.id
      };

      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(differentFacilityData)
        .expect(201);

      expectSuccess(response);
      expect(response.body.unit.facility_id).toBe(testData.facilities.facility2.id);
    });
  });
});
