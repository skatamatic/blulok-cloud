import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectForbidden, expectBadRequest, expectNotFound, expectConflict } from '@/__tests__/utils/mock-test-helpers';

// Mock the database service before importing routes
jest.mock('@/services/database.service', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => ({
      connection: createMockKnex(),
      healthCheck: jest.fn().mockResolvedValue(true),
    })),
  },
}));

// Mock the UnitModel
jest.mock('@/models/unit.model', () => ({
  UnitModel: jest.fn().mockImplementation(() => ({
    updateUnit: jest.fn().mockImplementation((unitId, updateData, userId, userRole) => {
      console.log('UnitModel.updateUnit called:', { unitId, userId, userRole });
      const unit = mockUnits.get(unitId);
      console.log('Unit found:', unit);
      
      // Check access control
      if (userRole === 'facility_admin' && userId === 'facility-admin-1') {
        if (unit && unit.facility_id === '550e8400-e29b-41d4-a716-446655440002') {
          console.log('Throwing access denied error');
          throw new Error('Access denied: You do not have permission to update this unit');
        }
      }
      
      // Get existing unit or create default
      const existingUnit = mockUnits.get(unitId) || {
        id: unitId,
        unit_number: 'A-101',
        unit_type: 'storage',
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'occupied',
        size_sqft: 100,
        monthly_rate: 100.00,
        description: '',
        features: [],
        metadata: {},
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };
      
      // Check for duplicate unit numbers in the same facility
      if (updateData.unit_number && updateData.unit_number !== existingUnit.unit_number) {
        const key = `${updateData.unit_number}-${existingUnit.facility_id}`;
        if (mockCreatedUnits.has(key)) {
          throw new Error('Unit number already exists in this facility');
        }
      }
      
      // Merge updates with existing data
      const updatedUnit = {
        ...existingUnit,
        ...updateData,
        id: unitId,
        updated_at: '2024-01-01T00:00:00Z'
      };
      
      mockUnits.set(unitId, updatedUnit);
      return Promise.resolve(updatedUnit);
    }),
    hasUserAccessToUnit: jest.fn().mockImplementation((unitId, userId, userRole) => {
      // For this test, we want to simulate that facility admin doesn't have access to units in facility2
      if (userRole === 'facility_admin' && userId === 'facility-admin-1') {
        const unit = mockUnits.get(unitId);
        if (unit && unit.facility_id === '550e8400-e29b-41d4-a716-446655440002') {
          return Promise.resolve(false);
        }
      }
      return Promise.resolve(true);
    })
  })),
}));

// Mock the UnitsService
const mockCreatedUnits = new Map();
const mockUnits = new Map();
jest.mock('@/services/units.service', () => ({
  UnitsService: {
    getInstance: jest.fn(() => ({
      createUnit: jest.fn().mockImplementation((data) => {
        const key = `${data.unit_number}-${data.facility_id}`;
        if (mockCreatedUnits.has(key)) {
          return Promise.reject(new Error('Unit number already exists in this facility'));
        }
        mockCreatedUnits.set(key, true);
        
        const unit = {
          id: `unit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          unit_number: data.unit_number,
          unit_type: data.unit_type,
          facility_id: data.facility_id,
          status: data.status || 'available',
          size_sqft: data.size_sqft,
          monthly_rate: data.monthly_rate,
          description: data.description,
          features: data.features || [],
          metadata: data.metadata || {},
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        };
        mockUnits.set(unit.id, unit);
        return Promise.resolve(unit);
      }),
      updateUnit: jest.fn().mockImplementation((id, data, userId, userRole) => {
        if (id === 'non-existent-id') {
          return Promise.resolve(null);
        }
        
        // Get existing unit or create default
        const existingUnit = mockUnits.get(id) || {
          id: id,
          unit_number: 'A-101',
          unit_type: 'storage',
          facility_id: '550e8400-e29b-41d4-a716-446655440001',
          status: 'occupied',
          size_sqft: 100,
          monthly_rate: 100.00,
          description: '',
          features: [],
          metadata: {},
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        };
        
        // Check access control for facility admins
        if (userRole === 'facility_admin' && userId === 'facility-admin-1') {
          if (existingUnit.facility_id === '550e8400-e29b-41d4-a716-446655440002') {
            return Promise.reject(new Error('Access denied: You do not have permission to update this unit'));
          }
        }
        
        // Check for duplicate unit numbers in the same facility
        if (data.unit_number && data.unit_number !== existingUnit.unit_number) {
          const key = `${data.unit_number}-${data.facility_id || existingUnit.facility_id}`;
          if (mockCreatedUnits.has(key)) {
            return Promise.reject(new Error('Unit number already exists in this facility'));
          }
        }
        
        // Merge updates with existing data
        const updatedUnit = {
          ...existingUnit,
          ...data,
          id: id,
          updated_at: '2024-01-01T00:00:00Z'
        };
        
        mockUnits.set(id, updatedUnit);
        return Promise.resolve(updatedUnit);
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

describe('Units Update Route', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    // Reset the mock state between tests
    mockCreatedUnits.clear();
    mockUnits.clear();
  });

  const validUpdateData = {
    unit_number: 'A102',
    unit_type: 'Medium Storage',
    size_sqft: 100,
    monthly_rate: 125.00,
    status: 'occupied',
    description: 'Updated unit description',
    features: ['climate_controlled', 'drive_up_access'],
    metadata: { floor: 2, special: true }
  };

  describe('PUT /api/v1/units/:unitId - Update Unit', () => {
    it('should update a unit for DEV_ADMIN', async () => {
      // First create a unit to update
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({
          unit_number: 'A101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Now update the unit
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validUpdateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message', 'Unit updated successfully');
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit.unit_number).toBe(validUpdateData.unit_number);
      expect(response.body.unit.unit_type).toBe(validUpdateData.unit_type);
      expect(response.body.unit.size_sqft).toBe(validUpdateData.size_sqft);
      expect(response.body.unit.monthly_rate).toBe(validUpdateData.monthly_rate);
      expect(response.body.unit.status).toBe(validUpdateData.status);
    });

    it('should update a unit for ADMIN', async () => {
      // First create a unit to update
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'B101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Now update the unit
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validUpdateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
    });

    it('should update a unit for FACILITY_ADMIN with access to the facility', async () => {
      // First create a unit to update
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({
          unit_number: 'C101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Now update the unit
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validUpdateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
    });

    it('should return 403 for FACILITY_ADMIN without access to the facility', async () => {
      // First create a unit in a different facility
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'D101',
          facility_id: testData.facilities.facility2.id, // Different facility
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Try to update the unit (should fail due to facility access)
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validUpdateData)
        .expect(403);

      expectForbidden(response);
      expect(response.body.message).toContain('Access denied');
    });

    it('should return 403 for TENANT', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'E101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Try to update the unit (should fail due to role)
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validUpdateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'F101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Try to update the unit (should fail due to role)
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validUpdateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for invalid unit data (invalid unit_number)', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'G101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Try to update with invalid data
      const invalidData = { ...validUpdateData, unit_number: '' };
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('"unit_number" is not allowed to be empty');
    });

    it('should return 400 for invalid unit data (invalid size_sqft)', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'H101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Try to update with invalid data
      const invalidData = { ...validUpdateData, size_sqft: -10 };
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(invalidData)
        .expect(400);

      expectBadRequest(response);
      expect(response.body.message).toBe('Validation error');
      expect(response.body.errors).toContain('Size must be a positive number');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .put('/api/v1/units/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validUpdateData)
        .expect(404);

      expectNotFound(response);
      expect(response.body.message).toContain('not found');
    });

    it('should return 409 if unit number already exists in the facility', async () => {
      // Create two units in the same facility
      await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'I101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const createResponse2 = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'J101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse2.body.unit.id;

      // Try to update the second unit to have the same number as the first
      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ ...validUpdateData, unit_number: 'I101' })
        .expect(409);

      expectConflict(response);
      expect(response.body.message).toBe('Unit number already exists in this facility');
    });

    it('should handle partial updates correctly', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'K101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Update only specific fields
      const partialUpdate = {
        unit_type: 'Large Storage',
        status: 'maintenance'
      };

      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(partialUpdate)
        .expect(200);

      expectSuccess(response);
      expect(response.body.unit.unit_type).toBe('Large Storage');
      expect(response.body.unit.status).toBe('maintenance');
      // Other fields should remain unchanged
      expect(response.body.unit.unit_number).toBe('K101');
      expect(response.body.unit.size_sqft).toBe(50);
    });

    it('should handle optional fields correctly', async () => {
      // First create a unit
      const createResponse = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_number: 'L101',
          facility_id: testData.facilities.facility1.id,
          unit_type: 'Small Storage',
          size_sqft: 50,
          monthly_rate: 75.00
        })
        .expect(201);

      const unitId = createResponse.body.unit.id;

      // Update with optional fields
      const updateWithOptionals = {
        description: 'Updated description',
        features: ['climate_controlled', 'security_cameras'],
        metadata: { floor: 3, special: true }
      };

      const response = await request(app)
        .put(`/api/v1/units/${unitId}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateWithOptionals)
        .expect(200);

      expectSuccess(response);
      expect(response.body.unit.description).toBe('Updated description');
      expect(response.body.unit.features).toEqual(['climate_controlled', 'security_cameras']);
      expect(response.body.unit.metadata).toEqual({ floor: 3, special: true });
    });
  });
});
