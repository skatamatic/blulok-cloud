import { Knex } from 'knex';

// Mock Knex query builder methods
const createMockQueryBuilder = () => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    whereNot: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereNotNull: jest.fn().mockReturnThis(),
    whereBetween: jest.fn().mockReturnThis(),
    whereNotBetween: jest.fn().mockReturnThis(),
    whereExists: jest.fn().mockReturnThis(),
    whereNotExists: jest.fn().mockReturnThis(),
    whereRaw: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    orWhereIn: jest.fn().mockReturnThis(),
    orWhereNot: jest.fn().mockReturnThis(),
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
    having: jest.fn().mockReturnThis(),
    havingIn: jest.fn().mockReturnThis(),
    havingNotIn: jest.fn().mockReturnThis(),
    havingNull: jest.fn().mockReturnThis(),
    havingNotNull: jest.fn().mockReturnThis(),
    havingBetween: jest.fn().mockReturnThis(),
    havingNotBetween: jest.fn().mockReturnThis(),
    havingExists: jest.fn().mockReturnThis(),
    havingNotExists: jest.fn().mockReturnThis(),
    havingRaw: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    orderByRaw: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    count: jest.fn().mockReturnThis(),
    countDistinct: jest.fn().mockReturnThis(),
    min: jest.fn().mockReturnThis(),
    max: jest.fn().mockReturnThis(),
    sum: jest.fn().mockReturnThis(),
    sumDistinct: jest.fn().mockReturnThis(),
    avg: jest.fn().mockReturnThis(),
    avgDistinct: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(undefined),
    then: jest.fn().mockResolvedValue([]),
    catch: jest.fn().mockResolvedValue([]),
    finally: jest.fn().mockResolvedValue([]),
    clone: jest.fn(() => createMockQueryBuilder()),
    raw: jest.fn().mockResolvedValue([{ '1': 1 }]),
    fn: {
      now: jest.fn().mockReturnValue('NOW()'),
    },
  };
  return builder;
};

// Mock Knex instance
const createMockKnex = (): Knex => {
  const mockQueryBuilder = createMockQueryBuilder();
  
  const mockKnex = jest.fn((tableName: string) => {
    const builder = createMockQueryBuilder();
    
    // Special handling for blulok_devices table queries
    if (tableName === 'blulok_devices') {
      builder.where = jest.fn((_column: string, value: any) => {
        let deviceData;
        
        // device-1 is assigned to unit1 (accessible by tenant and maintenance)
        if (value === 'device-1') {
          deviceData = {
            id: value,
            unit_id: '550e8400-e29b-41d4-a716-446655440011', // unit1 ID
            facility_id: '550e8400-e29b-41d4-a716-446655440001',
            device_type: 'blulok',
            lock_status: 'locked'
          };
        }
        // device-2 is assigned to unit2 (not accessible by tenant from testData)
        else if (value === 'device-2') {
          deviceData = {
            id: value,
            unit_id: '550e8400-e29b-41d4-a716-446655440012', // unit2 ID
            facility_id: '550e8400-e29b-41d4-a716-446655440002',
            device_type: 'blulok',
            lock_status: 'locked'
          };
        }
        // Default to unit1
        else {
          deviceData = {
            id: value,
            unit_id: '550e8400-e29b-41d4-a716-446655440011', // unit1 ID
            facility_id: '550e8400-e29b-41d4-a716-446655440001',
            device_type: 'blulok',
            lock_status: 'locked'
          };
        }
        
        builder.first = jest.fn().mockResolvedValue(deviceData);
        return builder;
      });
    }
    
    return builder;
  }) as any;
  
  // Add properties to the mock function
  Object.assign(mockKnex, {
    // Transaction support
    transaction: jest.fn().mockImplementation((callback) => {
      const mockTrx = createMockKnex();
      return callback(mockTrx);
    }),
    
    // Migration support
    migrate: {
      latest: jest.fn().mockResolvedValue([]),
      rollback: jest.fn().mockResolvedValue([]),
      status: jest.fn().mockResolvedValue([]),
    },
    
    // Seed support
    seed: {
      run: jest.fn().mockResolvedValue([]),
    },
    
    // Connection management
    destroy: jest.fn().mockResolvedValue(undefined),
    
    // Raw query support
    raw: jest.fn().mockImplementation((sql: string) => {
      // Return a mock raw query that can be used in select/where clauses
      return {
        toString: () => sql,
        toQuery: () => sql,
        then: jest.fn().mockResolvedValue([{ '1': 1 }]),
      };
    }),
    
    // Knex function methods
    fn: {
      now: jest.fn().mockReturnValue('NOW()'),
    },
  });
  
  // Add query builder methods
  Object.keys(mockQueryBuilder).forEach((key) => {
    if (key !== 'raw' && key !== 'fn') { // Avoid overwriting raw and fn
      mockKnex[key] = mockQueryBuilder[key];
    }
  });
  
  return mockKnex as unknown as Knex;
};

// Mock DatabaseService
export const mockDatabaseService = {
  getInstance: jest.fn(() => ({
    connection: createMockKnex(),
    healthCheck: jest.fn().mockResolvedValue(true),
  })),
};

// Mock data for different scenarios
export const mockData = {
  users: [
    {
      id: 'user-1',
      email: 'admin@test.com',
      password_hash: 'hashed-password',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'user-2',
      email: 'tenant@test.com',
      password_hash: 'hashed-password',
      first_name: 'Tenant',
      last_name: 'User',
      role: 'tenant',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
  ],
  facilities: [
    {
      id: 'facility-1',
      name: 'Test Facility 1',
      address: '123 Test St',
      contact_email: 'facility1@test.com',
      contact_phone: '123-456-7890',
      status: 'active',
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
  ],
  units: [
    {
      id: 'unit-1',
      unit_number: 'A-101',
      unit_type: 'storage',
      facility_id: 'facility-1',
      status: 'occupied',
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
  ],
  accessLogs: [
    {
      id: 'log-1',
      device_id: 'device-1',
      device_type: 'blulok',
      facility_id: 'facility-1',
      unit_id: 'unit-1',
      user_id: 'user-2',
      action: 'unlock',
      method: 'mobile_app',
      success: true,
      occurred_at: new Date('2024-01-01'),
      created_at: new Date('2024-01-01'),
    },
  ],
};

// Helper function to setup mock responses
export const setupMockResponse = (tableName: string, data: any[] = []) => {
  const mockKnex = mockDatabaseService.getInstance().connection;
  const mockQueryBuilder = mockKnex(tableName);
  
  // Mock the query execution to return data
  mockQueryBuilder.then = jest.fn().mockResolvedValue(data);
  mockQueryBuilder.first = jest.fn().mockResolvedValue(data[0] || undefined);
  mockQueryBuilder.count = jest.fn().mockReturnValue({
    first: jest.fn().mockResolvedValue({ 'count(*)': data.length })
  });
  
  return mockQueryBuilder;
};

// Helper function to setup mock insert/update/delete responses
export const setupMockMutation = (tableName: string, returnData?: any) => {
  const mockKnex = mockDatabaseService.getInstance().connection;
  const mockQueryBuilder = mockKnex(tableName);
  
  // Mock insert/update/delete operations
  mockQueryBuilder.insert = jest.fn().mockReturnValue({
    then: jest.fn().mockResolvedValue([returnData || { id: 'new-id' }])
  });
  
  mockQueryBuilder.update = jest.fn().mockReturnValue({
    then: jest.fn().mockResolvedValue(1)
  });
  
  mockQueryBuilder.delete = jest.fn().mockReturnValue({
    then: jest.fn().mockResolvedValue(1)
  });
  
  return mockQueryBuilder;
};

// Reset all mocks
export const resetMocks = () => {
  jest.clearAllMocks();
  mockDatabaseService.getInstance.mockReturnValue({
    connection: createMockKnex(),
    healthCheck: jest.fn().mockResolvedValue(true),
  });
};

export { createMockKnex };
export default mockDatabaseService;
