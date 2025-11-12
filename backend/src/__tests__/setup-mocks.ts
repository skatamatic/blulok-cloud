// Global test setup with database mocking
import { resetMocks, mockDatabaseService, createMockKnex } from './mocks/database.mock';

// Mock the database service before any tests run
jest.mock('../services/database.service', () => ({
  DatabaseService: mockDatabaseService,
}));

// Mock AuthService
jest.mock('../services/auth.service', () => ({
  AuthService: {
    login: jest.fn().mockImplementation((credentials: any) => {
      // Mock successful login for test users
      if (credentials.email === 'tenant@test.com' && credentials.password === 'password123') {
        return Promise.resolve({
          success: true,
          token: 'mock-jwt-token',
          user: {
            id: 'tenant-1',
            email: 'tenant@test.com',
            firstName: 'Test',
            lastName: 'Tenant',
            role: 'tenant'
          }
        });
      }
      if (credentials.email === 'admin@test.com' && credentials.password === 'password123') {
        return Promise.resolve({
          success: true,
          token: 'mock-jwt-token',
          user: {
            id: 'admin-1',
            email: 'admin@test.com',
            firstName: 'Test',
            lastName: 'Admin',
            role: 'admin'
          }
        });
      }
      if (credentials.email === 'valid@example.com' && credentials.password === 'plaintextpassword') {
        return Promise.resolve({
          success: true,
          token: 'mock-jwt-token',
          user: {
            id: 'user-1',
            email: 'valid@example.com',
            firstName: 'Valid',
            lastName: 'User',
            role: 'tenant'
          }
        });
      }
      if (credentials.email === 'inactive@example.com') {
        return Promise.resolve({
          success: false,
          message: 'Account is deactivated. Please contact administrator.'
        });
      }
      // Mock failed login for other cases
      return Promise.resolve({
        success: false,
        message: 'Invalid email or password'
      });
    }),
    createUser: jest.fn().mockImplementation((userData: any) => {
      // Check for duplicate email
      if (userData.email === 'tenant@test.com' || userData.email === 'existing@example.com') {
        return Promise.resolve({
          success: false,
          message: 'User with this email already exists'
        });
      }
      return Promise.resolve({
        success: true,
        message: 'User created successfully',
        userId: 'new-user-id'
      });
    }),
    changePassword: jest.fn().mockImplementation((userId: string, currentPassword: string, _newPassword: string) => {
      // Mock user not found
      if (userId === 'non-existent-user' || userId === 'nonexistent-id') {
        return Promise.resolve({
          success: false,
          message: 'User not found'
        });
      }
      // Mock successful password change for valid current password
      if (currentPassword === 'oldpassword' || currentPassword === 'password123') {
        return Promise.resolve({
          success: true,
          message: 'Password changed successfully'
        });
      }
      // Mock failed password change for invalid current password
      return Promise.resolve({
        success: false,
        message: 'Current password is incorrect'
      });
    }),
    generateToken: jest.fn().mockImplementation((user: any, facilityIds?: string[]) => {
      // Return a mock JWT token with 3 parts (header.payload.signature)
      const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const payload = Buffer.from(JSON.stringify({
        userId: user.id,
        email: user.email,
        firstName: user.firstName || 'Test',
        lastName: user.lastName || 'User',
        role: user.role,
        facilityIds: facilityIds || []
      })).toString('base64');
      const signature = 'mock-signature';
      return `${header}.${payload}.${signature}`;
    }),
    verifyToken: jest.fn().mockImplementation((token: string) => {
      // Parse the mock JWT token
      if (token && token.includes('.')) {
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64').toString());
            return {
              userId: payload.userId,
              email: payload.email,
              firstName: payload.firstName || 'Test',
              lastName: payload.lastName || 'User',
              role: payload.role,
              facilityIds: payload.facilityIds || []
            };
          } catch (error) {
            return null;
          }
        }
      }
      return null;
    }),
    hasPermission: jest.fn().mockImplementation((userRole: string, allowedRoles: string[]) => {
      return allowedRoles.includes(userRole);
    }),
    isAdmin: jest.fn().mockImplementation((role: string) => {
      return ['admin', 'dev_admin'].includes(role);
    }),
    isFacilityAdmin: jest.fn().mockImplementation((role: string) => {
      return role === 'facility_admin';
    }),
    isGlobalAdmin: jest.fn().mockImplementation((role: string) => {
      return ['admin', 'dev_admin'].includes(role);
    }),
    canManageUsers: jest.fn().mockImplementation((role: string) => {
      return ['dev_admin', 'admin', 'facility_admin'].includes(role);
    }),
    isFacilityScoped: jest.fn().mockImplementation((role: string) => {
      return ['facility_admin', 'tenant', 'maintenance'].includes(role);
    }),
    canAccessAllFacilities: jest.fn().mockImplementation((role: string) => {
      return ['admin', 'dev_admin'].includes(role);
    }),
    canAccessFacility: jest.fn().mockResolvedValue(true)
  }
}));

// Mock all models as proper classes
const createModelMock = (methods: Record<string, any> = {}) => {
  return jest.fn().mockImplementation(() => ({
    findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'new-item' }),
    updateById: jest.fn().mockResolvedValue({ id: 'updated-item' }),
    deleteById: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(false),
    count: jest.fn().mockResolvedValue(0),
    db: {
      connection: createMockKnex()
    },
    ...methods,
  }));
};

// Mock BaseModel
jest.mock('../models/base.model', () => ({
  BaseModel: class {
    static get tableName() {
      return 'test_table';
    }
    
    static get db() {
      return jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        then: jest.fn().mockResolvedValue([]),
      });
    }
    
    static query() {
      return this.db(this.tableName);
    }
    
    static async findById(_id: string) {
      return null;
    }
    
    static async create(data: any) {
      return { id: 'new-item', ...data };
    }
    
    static async updateById(id: string, data: any) {
      return { id, ...data };
    }
    
    static async deleteById(_id: string) {
      return 1;
    }
    
    static async exists(_id: string) {
      return false;
    }
    
    static async count() {
      return 0;
    }
  },
}));

jest.mock('../models/facility.model', () => ({
  FacilityModel: createModelMock({
    findAll: jest.fn().mockImplementation((filters: any) => {
      // Return mock facilities based on filters
      const mockFacilities = [
        { 
          id: '550e8400-e29b-41d4-a716-446655440001', 
          name: 'Test Facility 1',
          address: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zip_code: '12345',
          status: 'active',
          description: 'Test facility 1'
        },
        { 
          id: '550e8400-e29b-41d4-a716-446655440002', 
          name: 'Test Facility 2',
          address: '456 Test Avenue',
          city: 'Test City',
          state: 'TS',
          zip_code: '12346',
          status: 'active',
          description: 'Test facility 2'
        },
        { 
          id: '550e8400-e29b-41d4-a716-446655440003', 
          name: 'Test Facility 3',
          address: '789 Test Boulevard',
          city: 'Test City',
          state: 'TS',
          zip_code: '12347',
          status: 'inactive',
          description: 'Test facility 3'
        }
      ];

      let filteredFacilities = mockFacilities;

      // Apply filters
      if (filters.search) {
        filteredFacilities = filteredFacilities.filter(facility => 
          facility.name.toLowerCase().includes(filters.search.toLowerCase()) ||
          facility.address?.toLowerCase().includes(filters.search.toLowerCase())
        );
      }
      if (filters.status) {
        filteredFacilities = filteredFacilities.filter(facility => facility.status === filters.status);
      }

      return Promise.resolve({ facilities: filteredFacilities, total: filteredFacilities.length });
    }),
    findById: jest.fn().mockImplementation((facilityId: string) => {
      if (facilityId === '550e8400-e29b-41d4-a716-446655440001' || facilityId === 'facility-1') {
        return Promise.resolve({ 
          id: '550e8400-e29b-41d4-a716-446655440001', 
          name: 'Test Facility 1',
          address: '123 Test Street',
          city: 'Test City',
          state: 'TS',
          zip_code: '12345',
          status: 'active',
          description: 'Test facility 1'
        });
      }
      if (facilityId === '550e8400-e29b-41d4-a716-446655440002' || facilityId === 'facility-2') {
        return Promise.resolve({ 
          id: '550e8400-e29b-41d4-a716-446655440002', 
          name: 'Test Facility 2',
          address: '456 Test Avenue',
          city: 'Test City',
          state: 'TS',
          zip_code: '12346',
          status: 'active',
          description: 'Test facility 2'
        });
      }
      if (facilityId === '550e8400-e29b-41d4-a716-446655440003' || facilityId === 'facility-3') {
        return Promise.resolve({ 
          id: '550e8400-e29b-41d4-a716-446655440003', 
          name: 'Test Facility 3',
          address: '789 Test Boulevard',
          city: 'Test City',
          state: 'TS',
          zip_code: '12347',
          status: 'inactive',
          description: 'Test facility 3'
        });
      }
      // Return null for non-existent facilities
      return Promise.resolve(null);
    }),
    findByIds: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation((data: any) => {
      return Promise.resolve({
        id: 'new-facility-id',
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      });
    }),
    update: jest.fn().mockImplementation((id: string, data: any) => {
      // Return null for non-existent facilities
      if (id === 'non-existent-id') {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        id,
        ...data,
        updated_at: new Date()
      });
    }),
    delete: jest.fn().mockImplementation((id: string) => {
      // Return false for non-existent facilities
      if (id === 'non-existent-id') {
        return Promise.resolve(false);
      }
      return Promise.resolve(true);
    }),
    getFacilityStats: jest.fn().mockImplementation((_facilityId: string) => {
      return Promise.resolve({
        total_units: 10,
        occupied_units: 8,
        available_units: 2,
        total_devices: 15,
        active_devices: 14,
        inactive_devices: 1
      });
    }),
  }),
}));


jest.mock('../models/access-log.model', () => ({
  AccessLogModel: createModelMock({
    findAll: jest.fn().mockImplementation((filters: any) => {
      // Return mock data based on filters
      const mockLogs = [
        {
          id: 'log-1',
          device_id: 'device-1',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440001',
          unit_id: '550e8400-e29b-41d4-a716-446655440011',
          user_id: 'tenant-1',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        },
        {
          id: 'log-2',
          device_id: 'device-2',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440002',
          unit_id: '550e8400-e29b-41d4-a716-446655440012',
          user_id: 'tenant-2',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        },
        {
          id: 'log-3',
          device_id: 'device-3',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440002',
          unit_id: '550e8400-e29b-41d4-a716-446655440013',
          user_id: 'tenant-3',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        },
        {
          id: 'log-4',
          device_id: 'device-4',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440001',
          unit_id: '550e8400-e29b-41d4-a716-446655440011',
          user_id: 'maintenance-1',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        }
      ];

      // Filter based on role-based access
      let filteredLogs = mockLogs;
      
      if (filters.user_id) {
        filteredLogs = filteredLogs.filter(log => log.user_id === filters.user_id);
      }
      
      if (filters.facility_ids) {
        filteredLogs = filteredLogs.filter(log => filters.facility_ids.includes(log.facility_id));
      }
      
      if (filters.user_accessible_units) {
        filteredLogs = filteredLogs.filter(log => filters.user_accessible_units.includes(log.unit_id));
      }

      return Promise.resolve({ logs: filteredLogs, total: filteredLogs.length });
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      // Return mock data for test log IDs
      if (id === 'log-1') {
        return Promise.resolve({
          id: 'log-1',
          device_id: 'device-1',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440001',
          unit_id: '550e8400-e29b-41d4-a716-446655440011',
          user_id: 'tenant-1',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        });
      }
      if (id === 'log-2') {
        return Promise.resolve({
          id: 'log-2',
          device_id: 'device-2',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440002',
          unit_id: '550e8400-e29b-41d4-a716-446655440012',
          user_id: 'tenant-2',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        });
      }
      if (id === 'log-3') {
        return Promise.resolve({
          id: 'log-3',
          device_id: 'device-3',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440002',
          unit_id: '550e8400-e29b-41d4-a716-446655440013',
          user_id: 'tenant-3',
          action: 'unlock',
          method: 'mobile_app',
          success: true,
          occurred_at: new Date(),
          created_at: new Date(),
        });
      }
      return Promise.resolve(null);
    }),
    getUserAccessHistory: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
    getFacilityAccessHistory: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
    getUnitAccessHistory: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
  }),
}));

jest.mock('../models/device.model', () => ({
  DeviceModel: createModelMock({
    findAccessControlDevices: jest.fn().mockResolvedValue([
      {
        id: 'device-1',
        name: 'Test Access Control Device',
        device_type: 'access_control',
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'online'
      }
    ]),
    findBluLokDevices: jest.fn().mockResolvedValue([
      {
        id: 'device-2',
        name: 'Test BluLok Device',
        device_type: 'blulok',
        facility_id: '550e8400-e29b-41d4-a716-446655440001',
        unit_id: '550e8400-e29b-41d4-a716-446655440011',
        status: 'online',
        lock_status: 'locked'
      }
    ]),
    updateLockStatus: jest.fn().mockResolvedValue({ success: true }),
    updateStatus: jest.fn().mockResolvedValue({ success: true }),
    updateDeviceStatus: jest.fn().mockResolvedValue({ success: true }),
    createAccessControlDevice: jest.fn().mockImplementation((data: any) => 
      Promise.resolve({ 
        id: 'new-device', 
        name: data.name,
        device_type: data.device_type,
        location_description: data.location_description,
        relay_channel: data.relay_channel,
        gateway_id: data.gateway_id
      })
    ),
    createBluLokDevice: jest.fn().mockImplementation((data: any) => 
      Promise.resolve({ 
        id: 'new-device', 
        name: data.name,
        device_type: data.device_type,
        location_description: data.location_description,
        unit_id: data.unit_id,
        gateway_id: data.gateway_id
      })
    ),
    getFacilityHierarchy: jest.fn().mockResolvedValue({ hierarchy: [] }),
    getFacilityDeviceHierarchy: jest.fn().mockResolvedValue({ hierarchy: [] }),
    findByFacilityId: jest.fn().mockResolvedValue([]),
    countAccessControlDevices: jest.fn().mockResolvedValue(1),
    countBluLokDevices: jest.fn().mockResolvedValue(1),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === 'device-1') {
        return Promise.resolve({
          id: 'device-1',
          name: 'Test Device',
          device_type: 'blulok',
          facility_id: '550e8400-e29b-41d4-a716-446655440001',
          unit_id: '550e8400-e29b-41d4-a716-446655440011',
          status: 'online',
          lock_status: 'locked'
        });
      }
      return Promise.resolve(null);
    }),
  }),
}));

jest.mock('../models/gateway.model', () => ({
  GatewayModel: createModelMock({
    findAll: jest.fn().mockResolvedValue([
      { id: 'gateway-1', facility_id: 'facility-1', name: 'Gateway 1', status: 'online', gateway_type: 'simulated' },
      { id: 'gateway-2', facility_id: 'facility-2', name: 'Gateway 2', status: 'offline', gateway_type: 'simulated' }
    ]),
    findById: jest.fn().mockImplementation((id: string) => {
      const gateways = [
        { id: 'gateway-1', facility_id: 'facility-1', name: 'Gateway 1', status: 'online', gateway_type: 'simulated' },
        { id: 'gateway-2', facility_id: 'facility-2', name: 'Gateway 2', status: 'offline', gateway_type: 'simulated' }
      ];

      // Handle dynamically created gateways
      if (id === 'gateway-new') {
        return Promise.resolve({
          id: 'gateway-new',
          facility_id: 'facility-1',
          name: 'Incomplete HTTP Gateway',
          status: 'offline',
          gateway_type: 'http'
          // Note: no base_url, so this should fail validation
        });
      }

      return Promise.resolve(gateways.find(g => g.id === id) || null);
    }),
    create: jest.fn().mockImplementation((data: any) => {
      return Promise.resolve({
        id: 'gateway-new',
        facility_id: data.facility_id || 'facility-1',
        name: data.name || 'New Gateway',
        status: data.status || 'online',
        gateway_type: data.gateway_type || 'simulated'
      });
    }),
    update: jest.fn().mockImplementation((id: string, data: any) => {
      const gateways = [
        { id: 'gateway-1', facility_id: 'facility-1', name: 'Gateway 1', status: 'online', gateway_type: 'simulated' },
        { id: 'gateway-2', facility_id: 'facility-2', name: 'Gateway 2', status: 'offline', gateway_type: 'simulated' }
      ];
      const gateway = gateways.find(g => g.id === id);
      return Promise.resolve(gateway ? { ...gateway, ...data } : null);
    }),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(true)
  }),
}));

// Mock FMS Entity Mapping Model
jest.mock('../models/fms-entity-mapping.model', () => ({
  FMSEntityMappingModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      id: 'mapping-1',
      facility_id: '550e8400-e29b-41d4-a716-446655440001',
      entity_type: 'user',
      external_id: 'fms-ext-123',
      internal_id: 'tenant-1',
      provider_type: 'generic_rest',
      created_at: new Date(),
      updated_at: new Date(),
    }),
    findByExternalId: jest.fn().mockResolvedValue(null),
    findByInternalId: jest.fn().mockResolvedValue(null),
    findByFacility: jest.fn().mockResolvedValue([]),
    updateMetadata: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(true),
    deleteByFacility: jest.fn().mockResolvedValue(0),
  })),
}));

// Mock Unit Assignment Model
jest.mock('../models/unit-assignment.model', () => ({
  UnitAssignmentModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      id: 'assignment-new',
      unit_id: '550e8400-e29b-41d4-a716-446655440011',
      tenant_id: 'tenant-1',
      access_type: 'full',
      is_primary: true,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    findById: jest.fn().mockResolvedValue(null),
    findByUnitId: jest.fn().mockResolvedValue([]),
    findByTenantId: jest.fn().mockResolvedValue([]),
    findByUnitAndTenant: jest.fn().mockImplementation((unitId: string, tenantId: string) => 
      Promise.resolve({
        id: 'assignment-existing',
        unit_id: unitId,
        tenant_id: tenantId,
        access_type: 'full',
        is_primary: false,
        created_at: new Date(),
        updated_at: new Date(),
      })
    ),
    update: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    deleteByUnitAndTenant: jest.fn().mockResolvedValue(true),
    deleteByTenantId: jest.fn().mockResolvedValue(0),
    exists: jest.fn().mockResolvedValue(false),
  })),
}));

// Mock Unit Assignment Events Service
jest.mock('../services/events/unit-assignment-events.service', () => ({
  UnitAssignmentEventsService: {
    getInstance: jest.fn().mockReturnValue({
      emitTenantAssigned: jest.fn(),
      emitTenantUnassigned: jest.fn(),
      emitAssignmentUpdated: jest.fn(),
      onTenantAssigned: jest.fn(),
      onTenantUnassigned: jest.fn(),
      onAssignmentChanged: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
    }),
  },
}));

// Mock FMS Service
jest.mock('../services/fms/fms.service', () => ({
  FMSService: {
    getInstance: jest.fn().mockReturnValue({
      registerProvider: jest.fn(),
      testConnection: jest.fn().mockResolvedValue(true),
      performSync: jest.fn().mockResolvedValue({
        success: true,
        syncLogId: 'sync-log-1',
        changesDetected: [],
        summary: {
          tenantsAdded: 0,
          tenantsRemoved: 0,
          tenantsUpdated: 0,
          unitsAdded: 0,
          unitsRemoved: 0,
          unitsUpdated: 0,
          errors: [],
          warnings: [],
        },
        requiresReview: false,
      }),
      getSyncHistory: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
      getPendingChanges: jest.fn().mockResolvedValue([]),
      reviewChanges: jest.fn().mockResolvedValue(undefined),
      applyChanges: jest.fn().mockResolvedValue({
        success: true,
        changesApplied: 0,
        changesFailed: 0,
        errors: [],
        accessChanges: {
          usersCreated: [],
          usersDeactivated: [],
          accessGranted: [],
          accessRevoked: [],
        },
      }),
      applyTenantRemoved: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock FMS Models
jest.mock('../models/fms-configuration.model', () => ({
  FMSConfigurationModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      id: 'fms-config-1',
      facility_id: '550e8400-e29b-41d4-a716-446655440001',
      provider_type: 'generic_rest',
      is_enabled: true,
      config: {},
      created_at: new Date(),
      updated_at: new Date(),
    }),
    findById: jest.fn().mockResolvedValue(null),
    findByFacilityId: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(null),
    delete: jest.fn().mockResolvedValue(true),
    existsForFacility: jest.fn().mockResolvedValue(false),
  })),
}));

jest.mock('../models/fms-sync-log.model', () => ({
  FMSSyncLogModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      id: 'sync-log-1',
      facility_id: '550e8400-e29b-41d4-a716-446655440001',
      fms_config_id: 'fms-config-1',
      sync_status: 'completed',
      started_at: new Date(),
      completed_at: new Date(),
      triggered_by: 'manual',
      changes_detected: 0,
      changes_applied: 0,
      changes_pending: 0,
      changes_rejected: 0,
      created_at: new Date(),
      updated_at: new Date(),
    }),
    findById: jest.fn().mockResolvedValue(null),
    findByFacilityId: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
    findLatestByFacilityId: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(null),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../models/fms-change.model', () => ({
  FMSChangeModel: jest.fn().mockImplementation(() => ({
    create: jest.fn().mockResolvedValue({
      id: 'change-1',
      sync_log_id: 'sync-log-1',
      change_type: 'tenant_added',
      entity_type: 'tenant',
      external_id: 'ext-123',
      after_data: {},
      required_actions: [],
      impact_summary: 'Test change',
      is_reviewed: false,
      created_at: new Date(),
    }),
    findById: jest.fn().mockResolvedValue(null),
    findBySyncLogId: jest.fn().mockResolvedValue([]),
    findPendingBySyncLogId: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(null),
    reviewChange: jest.fn().mockResolvedValue(null),
    markApplied: jest.fn().mockResolvedValue(null),
    bulkReview: jest.fn().mockResolvedValue(0),
    deleteBySyncLogId: jest.fn().mockResolvedValue(0),
    getStatsBySyncLogId: jest.fn().mockResolvedValue({
      total: 0,
      reviewed: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
      byType: {},
    }),
  })),
}));

jest.mock('../models/key-sharing.model', () => ({
  KeySharingModel: createModelMock({
    findAll: jest.fn().mockImplementation((filters: any) => {
      // Return mock key sharing records based on filters
      const mockRecords = [
        {
          id: 'sharing-1',
          primary_tenant_id: 'tenant-1',
          shared_with_user_id: 'other-tenant-1',
          unit_id: 'unit-1',
          access_level: 'temporary',
          is_active: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          created_at: new Date(),
          updated_at: new Date(),
          unit: {
            id: '550e8400-e29b-41d4-a716-446655440011',
            facility_id: '550e8400-e29b-41d4-a716-446655440001',
            unit_number: 'A-101'
          }
        },
        {
          id: 'sharing-2',
          primary_tenant_id: 'tenant-2',
          shared_with_user_id: 'tenant-3',
          unit_id: '550e8400-e29b-41d4-a716-446655440012',
          access_level: 'permanent',
          is_active: true,
          expires_at: null,
          created_at: new Date(),
          updated_at: new Date(),
          unit: {
            id: '550e8400-e29b-41d4-a716-446655440012',
            facility_id: '550e8400-e29b-41d4-a716-446655440002',
            unit_number: 'A-102'
          }
        }
      ];

      let filteredRecords = mockRecords;

      // Apply filters
      if (filters.unit_id) {
        filteredRecords = filteredRecords.filter(record => record.unit_id === filters.unit_id);
      }
      if (filters.access_level) {
        filteredRecords = filteredRecords.filter(record => record.access_level === filters.access_level);
      }
      if (filters.is_active !== undefined) {
        filteredRecords = filteredRecords.filter(record => record.is_active === filters.is_active);
      }
      if (filters.user_id) {
        filteredRecords = filteredRecords.filter(record => 
          record.primary_tenant_id === filters.user_id || 
          record.shared_with_user_id === filters.user_id
        );
      }
      
      // Apply primary_tenant_id filter for tenant role
      if (filters.primary_tenant_id) {
        filteredRecords = filteredRecords.filter(record => 
          record.primary_tenant_id === filters.primary_tenant_id
        );
      }

      // Apply shared_with_user_id filter
      if (filters.shared_with_user_id) {
        filteredRecords = filteredRecords.filter(record =>
          record.shared_with_user_id === filters.shared_with_user_id
        );
      }
      
      // Apply facility-based filtering for facility admins
      if (filters.facility_ids && filters.facility_ids.length > 0) {
        filteredRecords = filteredRecords.filter(record => 
          filters.facility_ids.includes(record.unit.facility_id)
        );
      }

      return Promise.resolve({ sharings: filteredRecords, total: filteredRecords.length });
    }),
    findById: jest.fn().mockImplementation((id: string) => {
      if (id === 'sharing-1') {
        return Promise.resolve({
          id: 'sharing-1',
          primary_tenant_id: 'tenant-1',
          shared_with_user_id: 'other-tenant-1',
          unit_id: 'unit-1',
          access_level: 'temporary',
          is_active: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      if (id === 'sharing-2') {
        return Promise.resolve({
          id: 'sharing-2',
          primary_tenant_id: 'tenant-2',
          shared_with_user_id: 'tenant-3',
          unit_id: 'unit-2',
          access_level: 'permanent',
          is_active: true,
          expires_at: null,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      return Promise.resolve(null);
    }),
    create: jest.fn().mockImplementation((data: any) => {
      // Check for duplicate sharing (same unit and shared_with_user_id)
      if (data.unit_id === 'unit-1' && data.shared_with_user_id === 'other-tenant-1') {
        return Promise.reject(new Error('Key sharing already exists'));
      }
      return Promise.resolve({
        id: 'new-sharing-record',
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      });
    }),
    updateById: jest.fn().mockImplementation((id: string, data: any) => {
      return Promise.resolve({
        id,
        ...data,
        updated_at: new Date()
      });
    }),
    deleteById: jest.fn().mockResolvedValue(1),
    getUserSharedUnits: jest.fn().mockImplementation((userId: string) => {
      // Return mock shared units based on user
      if (userId === 'tenant-1') {
        return Promise.resolve([{ unit_id: 'unit-1' }]);
      }
      if (userId === 'other-tenant-1') {
        return Promise.resolve([{ unit_id: 'unit-1' }]); // Shared access to unit-1
      }
      return Promise.resolve([]);
    }),
    checkUserHasAccess: jest.fn().mockImplementation((userId: string, unitId: string) => {
      // Mock access logic - support both UUID and legacy IDs
      const unit1Ids = ['550e8400-e29b-41d4-a716-446655440011', 'unit-1'];
      const unit2Ids = ['550e8400-e29b-41d4-a716-446655440012', 'unit-2'];
      
      if (userId === 'tenant-1' && unit1Ids.includes(unitId)) {
        return Promise.resolve(true); // Primary tenant
      }
      if (userId === 'other-tenant-1' && unit1Ids.includes(unitId)) {
        return Promise.resolve(true); // Shared access
      }
      if (userId === 'tenant-1' && unit2Ids.includes(unitId)) {
        return Promise.resolve(false); // No access
      }
      if (userId === 'other-tenant-1' && unit2Ids.includes(unitId)) {
        return Promise.resolve(true); // Primary tenant
      }
      return Promise.resolve(false);
    }),
    getUnitSharedKeys: jest.fn().mockImplementation((unitId: string, _filters: any = {}) => {
      // Return mock shared keys for unit
      if (unitId === 'unit-1') {
        const sharedKeys = [
          {
            id: 'sharing-1',
            primary_tenant_id: 'tenant-1',
            shared_with_user_id: 'other-tenant-1',
            access_level: 'temporary',
            is_active: true,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        ];
        return Promise.resolve({ sharings: sharedKeys, total: sharedKeys.length });
      }
      if (unitId === 'non-existent-unit') {
        return Promise.resolve({ sharings: [], total: 0 });
      }
      return Promise.resolve({ sharings: [], total: 0 });
    }),
    getExpiredSharings: jest.fn().mockImplementation(() => {
      // Return mock expired sharing records
      return Promise.resolve([
        {
          id: 'expired-sharing-1',
          primary_tenant_id: 'tenant-1',
          shared_with_user_id: 'other-tenant-1',
          unit_id: 'unit-1',
          access_level: 'temporary',
          is_active: false,
          expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    }),
    getUserOwnedKeys: jest.fn().mockImplementation((userId: string, _filters: any = {}) => {
      // Return mock owned keys for user
      if (userId === 'tenant-1') {
        const ownedKeys = [
          {
            id: 'sharing-1',
            primary_tenant_id: 'tenant-1',
            shared_with_user_id: 'other-tenant-1',
            unit_id: 'unit-1',
            access_level: 'temporary',
            is_active: true,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        ];
        return Promise.resolve({ sharings: ownedKeys, total: ownedKeys.length });
      }
      return Promise.resolve({ sharings: [], total: 0 });
    }),
    getUserSharedKeys: jest.fn().mockImplementation((userId: string, _filters: any = {}) => {
      // Return mock shared keys for user
      if (userId === 'tenant-1') {
        const sharedKeys = [
          {
            id: 'sharing-2',
            primary_tenant_id: 'tenant-2',
            shared_with_user_id: 'tenant-1',
            unit_id: 'unit-2',
            access_level: 'permanent',
            is_active: true,
            expires_at: null
          }
        ];
        return Promise.resolve({ sharings: sharedKeys, total: sharedKeys.length });
      }
      return Promise.resolve({ sharings: [], total: 0 });
    }),
    update: jest.fn().mockImplementation((id: string, data: any) => {
      return Promise.resolve({
        id,
        ...data,
        updated_at: new Date()
      });
    }),
    revokeSharing: jest.fn().mockImplementation((id: string) => {
      return Promise.resolve({
        id,
        is_active: false,
        updated_at: new Date()
      });
    }),
  }),
}));

jest.mock('../models/user.model', () => {
  // In-memory user storage
  const mockUsers = new Map<string, any>();
  
  // Initialize with default test users
  const defaultUsers = [
    {
      id: 'tenant-1',
      email: 'tenant@test.com',
      password_hash: 'hashed-password',
      first_name: 'Tenant',
      last_name: 'User',
      role: 'tenant',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'tenant-2',
      email: 'tenant2@test.com',
      password_hash: 'hashed-password',
      first_name: 'Tenant',
      last_name: 'Two',
      role: 'tenant',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'other-tenant-1',
      email: 'othertenant@test.com',
      password_hash: 'hashed-password',
      first_name: 'Other',
      last_name: 'Tenant',
      role: 'tenant',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'facility2-tenant-1',
      email: 'facility2tenant@test.com',
      password_hash: 'hashed-password',
      first_name: 'Facility2',
      last_name: 'Tenant',
      role: 'tenant',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'facility-admin-1',
      email: 'facilityadmin@test.com',
      password_hash: 'hashed-password',
      first_name: 'Facility',
      last_name: 'Admin',
      role: 'facility_admin',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'admin-1',
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
      id: 'dev-admin-1',
      email: 'devadmin@test.com',
      password_hash: 'hashed-password',
      first_name: 'Dev',
      last_name: 'Admin',
      role: 'dev_admin',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    {
      id: 'maintenance-1',
      email: 'maintenance@test.com',
      password_hash: 'hashed-password',
      first_name: 'Maintenance',
      last_name: 'User',
      role: 'maintenance',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
  ];
  
  defaultUsers.forEach(user => mockUsers.set(user.id, { ...user }));
  
  return {
    UserModel: {
      findById: jest.fn().mockImplementation((id: string) => {
        const user = mockUsers.get(id);
        return Promise.resolve(user || undefined);
      }),
      create: jest.fn().mockImplementation((data: any) => {
        // Check for duplicate email
        const existingUser = Array.from(mockUsers.values()).find(u => u.email === data.email);
        if (existingUser) {
          return Promise.reject(new Error('Email already exists'));
        }
        
        const newUser = {
          id: 'new-user-' + Date.now(),
          ...data,
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockUsers.set(newUser.id, newUser);
        return Promise.resolve(newUser);
      }),
      updateById: jest.fn().mockImplementation((id: string, data: any) => {
        const user = mockUsers.get(id);
        if (!user) {
          return Promise.resolve(undefined);
        }
        const updatedUser = {
          ...user,
          ...data,
          id: user.id, // Preserve original ID
          email: user.email, // Preserve original email
          updated_at: new Date(),
        };
        mockUsers.set(id, updatedUser);
        return Promise.resolve(updatedUser);
      }),
      deleteById: jest.fn().mockImplementation((id: string) => {
        const deleted = mockUsers.delete(id);
        return Promise.resolve(deleted ? 1 : 0);
      }),
      findAll: jest.fn().mockImplementation((filters: any = {}) => {
        let users = Array.from(mockUsers.values());
        
        // Apply filters
        if (filters.role) {
          users = users.filter(user => user.role === filters.role);
        }
        if (filters.is_active !== undefined) {
          users = users.filter(user => user.is_active === filters.is_active);
        }
        
        return Promise.resolve(users);
      }),
      findByEmail: jest.fn().mockImplementation((email: string) => {
        const user = Array.from(mockUsers.values()).find(u => u.email === email);
        return Promise.resolve(user || undefined);
      }),
      findActiveUsers: jest.fn().mockImplementation(() => {
        const activeUsers = Array.from(mockUsers.values()).filter(u => u.is_active);
        return Promise.resolve(activeUsers);
      }),
      findByRole: jest.fn().mockImplementation((role: string) => {
        const users = Array.from(mockUsers.values()).filter(u => u.role === role);
        return Promise.resolve(users);
      }),
      updateLastLogin: jest.fn().mockImplementation((id: string) => {
        const user = mockUsers.get(id);
        if (!user) {
          return Promise.resolve(undefined);
        }
        const updatedUser = {
          ...user,
          last_login: new Date(),
          updated_at: new Date(),
        };
        mockUsers.set(id, updatedUser);
        return Promise.resolve(updatedUser);
      }),
      deactivateUser: jest.fn().mockImplementation((id: string) => {
        const user = mockUsers.get(id);
        if (!user) {
          return Promise.resolve(undefined);
        }
        const updatedUser = {
          ...user,
          is_active: false,
          updated_at: new Date(),
        };
        mockUsers.set(id, updatedUser);
        return Promise.resolve(updatedUser);
      }),
      activateUser: jest.fn().mockImplementation((id: string) => {
        const user = mockUsers.get(id);
        if (!user) {
          return Promise.resolve(undefined);
        }
        const updatedUser = {
          ...user,
          is_active: true,
          updated_at: new Date(),
        };
        mockUsers.set(id, updatedUser);
        return Promise.resolve(updatedUser);
      }),
      exists: jest.fn().mockImplementation((id: string) => {
        return Promise.resolve(mockUsers.has(id));
      }),
      count: jest.fn().mockImplementation((filters: any = {}) => {
        let users = Array.from(mockUsers.values());
        
        if (filters.role) {
          users = users.filter(user => user.role === filters.role);
        }
        if (filters.is_active !== undefined) {
          users = users.filter(user => user.is_active === filters.is_active);
        }
        
        return Promise.resolve(users.length);
      }),
      findByPhone: jest.fn().mockImplementation((phone: string) => {
        const user = Array.from(mockUsers.values()).find(u => u.phone_number === phone);
        return Promise.resolve(user || undefined);
      }),
    },
  };
});

jest.mock('../models/user-facility-association.model', () => ({
  UserFacilityAssociationModel: {
        getUserFacilityIds: jest.fn().mockImplementation((userId: string) => {
          // Return mock facility IDs based on user
          if (userId === 'facility-admin-1') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440001']);
          }
          if (userId === 'tenant-1') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440001']);
          }
          if (userId === 'tenant-2') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440001']);
          }
          if (userId === 'tenant-3') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440002']);
          }
          if (userId === 'facility2-tenant-1') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440002']);
          }
          if (userId === 'maintenance-1') {
            return Promise.resolve(['550e8400-e29b-41d4-a716-446655440001']);
          }
          return Promise.resolve([]);
        }),
    findByUserId: jest.fn().mockResolvedValue([]),
    findByFacilityId: jest.fn().mockResolvedValue([]),
    getFacilityUserIds: jest.fn().mockResolvedValue([]),
    addUserToFacility: jest.fn().mockResolvedValue({ id: 'new-association' }),
        removeUserFromFacility: jest.fn().mockImplementation((userId: string, facilityId: string) => {
          // Mock non-existent associations
          if (userId === 'tenant-1' && facilityId === 'non-existent') {
            return Promise.resolve(0);
          }
          return Promise.resolve(1);
        }),
    setUserFacilities: jest.fn().mockResolvedValue(undefined),
    getUsersWithFacilities: jest.fn().mockResolvedValue([]),
        hasAccessToFacility: jest.fn().mockImplementation((userId: string, facilityId: string) => {
          // Mock existing associations
          if (userId === 'tenant-1' && facilityId === '550e8400-e29b-41d4-a716-446655440001') {
            return Promise.resolve(true);
          }
          if (userId === 'tenant-1' && facilityId === '550e8400-e29b-41d4-a716-446655440002') {
            return Promise.resolve(false);
          }
          return Promise.resolve(false);
        }),
  },
}));

jest.mock('../models/unit.model', () => {
  const mockUnits = [
    {
      id: '550e8400-e29b-41d4-a716-446655440011',
      unit_number: 'A-101',
      facility_id: '550e8400-e29b-41d4-a716-446655440001',
      unit_type: 'storage',
      size: '10x10',
      status: 'occupied',
      lock_status: 'locked',
      access_code: '1234',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440012',
      unit_number: 'A-102',
      facility_id: '550e8400-e29b-41d4-a716-446655440002',
      unit_type: 'storage',
      size: '10x15',
      status: 'available',
      lock_status: 'unlocked',
      access_code: '5678',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440013',
      unit_number: 'B-201',
      facility_id: '550e8400-e29b-41d4-a716-446655440002',
      unit_type: 'storage',
      size: '5x10',
      status: 'occupied',
      lock_status: 'locked',
      access_code: '9012',
      created_at: new Date(),
      updated_at: new Date(),
    }
  ];

  const mockUnitAssignments = [
    {
      id: 'assignment-1',
      unit_id: '550e8400-e29b-41d4-a716-446655440011',
      tenant_id: 'tenant-1',
      access_type: 'full',
      expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'assignment-2',
      unit_id: '550e8400-e29b-41d4-a716-446655440013',
      tenant_id: 'tenant-3',
      access_type: 'full',
      expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'assignment-3',
      unit_id: '550e8400-e29b-41d4-a716-446655440011',
      tenant_id: 'maintenance-1',
      access_type: 'maintenance',
      expires_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    }
  ];

  return {
    UnitModel: jest.fn().mockImplementation(() => ({
      getUnitsListForUser: jest.fn().mockImplementation(async (userId: string, userRole: string, filters: any) => {
        // Security check: throw on null/undefined userId
        if (!userId) {
          throw new Error('User ID is required');
        }
        
        let filteredUnits = [...mockUnits];
        
        // Apply role-based filtering
        if (userRole === 'admin' || userRole === 'dev_admin') {
          // Admin sees all units
        } else if (userRole === 'facility_admin') {
          // Facility admin sees only units in their facilities
          // Check if this facility admin has any facilities
          const { UserFacilityAssociationModel } = require('../models/user-facility-association.model');
          const facilityIds = await UserFacilityAssociationModel.getUserFacilityIds(userId);
          if (facilityIds.length === 0) {
            return { units: [], total: 0 };
          }
          filteredUnits = filteredUnits.filter(u => facilityIds.includes(u.facility_id));
        } else if (userRole === 'tenant') {
          // Tenant sees only their units
          const assignments = mockUnitAssignments.filter(a => a.tenant_id === userId);
          const unitIds = assignments.map(a => a.unit_id);
          filteredUnits = filteredUnits.filter(u => unitIds.includes(u.id));
        } else {
          // Unknown role - return empty
          return { units: [], total: 0 };
        }
        
        // Apply filters
        if (filters.facility_id) {
          filteredUnits = filteredUnits.filter(u => u.facility_id === filters.facility_id);
        }
        if (filters.status) {
          filteredUnits = filteredUnits.filter(u => u.status === filters.status);
        }
        if (filters.lock_status) {
          filteredUnits = filteredUnits.filter(u => u.lock_status === filters.lock_status);
        }
        
        // Apply pagination
        const limit = filters.limit || 10;
        const offset = filters.offset || 0;
        const paginatedUnits = filteredUnits.slice(offset, offset + limit);
        
        return {
          units: paginatedUnits,
          total: filteredUnits.length
        };
      }),
      
      getUnitDetailsForUser: jest.fn().mockImplementation(async (unitId: string, userId: string, userRole: string) => {
        const unit = mockUnits.find(u => u.id === unitId);
        
        // Unit doesn't exist - return null
        if (!unit) {
          return null;
        }
        
        // Unit exists - check access (model always returns null for denied access, never throws)
        if (userRole === 'admin' || userRole === 'dev_admin') {
          return unit;
        }
        
        if (userRole === 'facility_admin') {
          // Check if facility admin has access to this unit's facility
          if (unit.facility_id !== '550e8400-e29b-41d4-a716-446655440001') {
            return null; // Access denied - return null like the real model
          }
          return unit;
        }
        
        if (userRole === 'tenant') {
          const hasAccess = mockUnitAssignments.some(a => a.unit_id === unitId && a.tenant_id === userId);
          if (!hasAccess) {
            return null; // Access denied - return null like the real model
          }
          return unit;
        }
        
        // Unknown role - return null
        return null;
      }),
      
      getUnitAssignmentsForUser: jest.fn().mockImplementation(async (userId: string, userRole: string) => {
        if (userRole === 'tenant') {
          return mockUnitAssignments.filter(a => a.tenant_id === userId);
        }
        if (userRole === 'facility_admin') {
          // Return assignments for units in their facilities
          const facilityUnitIds = mockUnits.filter(u => u.facility_id === '550e8400-e29b-41d4-a716-446655440001').map(u => u.id);
          return mockUnitAssignments.filter(a => facilityUnitIds.includes(a.unit_id));
        }
        return mockUnitAssignments;
      }),
      
      getUnitStatsForUser: jest.fn().mockImplementation(async (userId: string, userRole: string) => {
        let units = [...mockUnits];
        
        if (userRole === 'facility_admin') {
          units = units.filter(u => u.facility_id === '550e8400-e29b-41d4-a716-446655440001');
        } else if (userRole === 'tenant') {
          const assignments = mockUnitAssignments.filter(a => a.tenant_id === userId);
          const unitIds = assignments.map(a => a.unit_id);
          units = units.filter(u => unitIds.includes(u.id));
        }
        
        return {
          total: units.length,
          occupied: units.filter(u => u.status === 'occupied').length,
          available: units.filter(u => u.status === 'available').length,
          maintenance: units.filter(u => u.status === 'maintenance').length,
          reserved: units.filter(u => u.status === 'reserved').length,
          locked: units.filter(u => u.lock_status === 'locked').length,
          unlocked: units.filter(u => u.lock_status === 'unlocked').length,
        };
      }),
      
      findById: jest.fn().mockImplementation(async (unitId: string) => {
        // Support both UUID and legacy IDs
        const idMap: Record<string, string> = {
          'unit-1': '550e8400-e29b-41d4-a716-446655440011',
          'unit-2': '550e8400-e29b-41d4-a716-446655440012',
          'unit-3': '550e8400-e29b-41d4-a716-446655440013',
        };
        const actualId = idMap[unitId] || unitId;
        return mockUnits.find(u => u.id === actualId) || null;
      }),
      
      findByPrimaryTenant: jest.fn().mockImplementation(async (tenantId: string) => {
        const assignments = mockUnitAssignments.filter(a => a.tenant_id === tenantId);
        const unitIds = assignments.map(a => a.unit_id);
        return mockUnits.filter(u => unitIds.includes(u.id));
      }),
      
      lockUnit: jest.fn().mockImplementation(async (unitId: string, _userId: string) => {
        const unit = mockUnits.find(u => u.id === unitId);
        if (!unit) return false;
        unit.lock_status = 'locked';
        return true;
      }),
      
      hasUserAccessToUnit: jest.fn().mockImplementation(async (unitId: string, userId: string, userRole: string) => {
        // Admin and dev_admin have access to all units
        if (userRole === 'admin' || userRole === 'dev_admin') {
          // Check if unit exists
          const unit = mockUnits.find(u => u.id === unitId);
          if (!unit) {
            throw new Error('Unit not found');
          }
          return true;
        }
        
        const unit = mockUnits.find(u => u.id === unitId);
        if (!unit) {
          throw new Error('Unit not found');
        }
        
        if (userRole === 'facility_admin') {
          return unit.facility_id === '550e8400-e29b-41d4-a716-446655440001';
        }
        
        if (userRole === 'tenant' || userRole === 'maintenance') {
          return mockUnitAssignments.some(a => a.unit_id === unitId && a.tenant_id === userId);
        }
        
        return false;
      }),
      
      createUnit: jest.fn().mockImplementation(async (unitData: any, _userId: string, userRole: string) => {
        // Check permissions
        if (userRole === 'facility_admin' && unitData.facility_id !== '550e8400-e29b-41d4-a716-446655440001') {
          throw new Error('Access denied: Cannot create units in facilities you do not manage');
        }
        
        const newUnit = {
          id: 'new-unit-' + Date.now(),
          ...unitData,
          created_at: new Date(),
          updated_at: new Date(),
        };
        mockUnits.push(newUnit);
        return newUnit;
      }),
      
      updateUnit: jest.fn().mockImplementation(async (unitId: string, updateData: any, _userId: string, userRole: string) => {
        const unit = mockUnits.find(u => u.id === unitId);
        if (!unit) {
          return null;
        }
        
        // Check permissions - facility admin can only update units in facilities they manage
        if (userRole === 'facility_admin') {
          if (unit.facility_id !== '550e8400-e29b-41d4-a716-446655440001') {
            throw new Error('Access denied: Cannot update units in facilities you do not manage');
          }
        }
        
        Object.assign(unit, updateData, { updated_at: new Date() });
        return unit;
      }),
    })),
  };
});

jest.mock('../models/user-widget-layout.model', () => ({
  UserWidgetLayoutModel: createModelMock({
    findByUserId: jest.fn().mockResolvedValue([]),
    findByUserAndWidget: jest.fn().mockResolvedValue(undefined),
    saveUserLayout: jest.fn().mockResolvedValue({ id: 'new-layout' }),
    saveUserLayouts: jest.fn().mockResolvedValue(undefined),
    hideWidget: jest.fn().mockResolvedValue(undefined),
    showWidget: jest.fn().mockResolvedValue(undefined),
    resetToDefaults: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../models/access-credentials.model', () => ({
  AccessCredentialsModel: createModelMock(),
}));

// JWT is not mocked - we want to test actual JWT functionality

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockImplementation((password: string, _hash: string) => {
    // Mock password comparison - return true for valid test passwords
    const validPasswords = ['password123', 'plaintextpassword', 'oldpassword'];
    return Promise.resolve(validPasswords.includes(password));
  }),
}));

// Mock UserWidgetLayoutModel
jest.mock('../models/user-widget-layout.model', () => ({
  UserWidgetLayoutModel: {
    findByUserId: jest.fn().mockImplementation((userId: string) => {
      // Return empty array for users without saved layouts
      if (userId === 'tenant-1' || userId === 'admin-1' || userId === 'facility_admin-1') {
        return Promise.resolve([]);
      }
      // Return some mock layouts for other users
      return Promise.resolve([
        {
          id: 'layout-1',
          user_id: userId,
          widget_id: 'facilities_stats',
          widget_type: 'stats',
          layout_config: {
            position: { x: 0, y: 0, w: 4, h: 3 },
            size: 'medium'
          },
          is_visible: true,
          display_order: 0,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    }),
    findByUserAndWidget: jest.fn().mockImplementation((userId: string, widgetId: string) => {
      if (userId === 'tenant-1' && widgetId === 'facilities_stats') {
        return Promise.resolve({
          id: 'layout-1',
          user_id: userId,
          widget_id: widgetId,
          widget_type: 'stats',
          layout_config: {
            position: { x: 0, y: 0, w: 4, h: 3 },
            size: 'medium'
          },
          is_visible: true,
          display_order: 0,
          created_at: new Date(),
          updated_at: new Date()
        });
      }
      return Promise.resolve(undefined);
    }),
    saveUserLayouts: jest.fn().mockImplementation((_userId: string, _layouts: any[]) => {
      return Promise.resolve();
    }),
    hideWidget: jest.fn().mockImplementation((_userId: string, _widgetId: string) => {
      return Promise.resolve();
    }),
    showWidget: jest.fn().mockImplementation((_userId: string, _widgetId: string) => {
      return Promise.resolve();
    }),
    resetToDefaults: jest.fn().mockImplementation((_userId: string) => {
      return Promise.resolve();
    }),
    updateById: jest.fn().mockImplementation((id: string, data: any) => {
      return Promise.resolve({
        id,
        ...data,
        updated_at: new Date()
      });
    }),
    create: jest.fn().mockImplementation((data: any) => {
      return Promise.resolve({
        id: 'new-layout-id',
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      });
    }),
    extractWidgetType: jest.fn().mockImplementation((widgetId: string) => {
      const parts = widgetId.split('_');
      return parts[parts.length - 1] || 'unknown';
    })
  },
  DefaultWidgetTemplateModel: {
    getAvailableForUser: jest.fn().mockImplementation((userRole: string) => {
      const templates = [
        {
          id: 'template-1',
          widget_id: 'facilities_stats',
          widget_type: 'stats',
          name: 'Facilities Statistics',
          description: 'Overview of facility statistics',
          default_config: {
            position: { x: 0, y: 0, w: 4, h: 3 },
            size: 'medium'
          },
          available_sizes: ['tiny', 'small', 'medium', 'large'],
          required_permissions: ['admin', 'facility_admin', 'tenant', 'maintenance'],
          is_active: true,
          default_order: 0,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'template-2',
          widget_id: 'units_overview',
          widget_type: 'overview',
          name: 'Units Overview',
          description: 'Overview of units in facilities',
          default_config: {
            position: { x: 4, y: 0, w: 4, h: 3 },
            size: 'medium'
          },
          available_sizes: ['small', 'medium', 'large'],
          required_permissions: ['admin', 'facility_admin', 'tenant', 'maintenance'],
          is_active: true,
          default_order: 1,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 'template-3',
          widget_id: 'admin_panel',
          widget_type: 'admin',
          name: 'Admin Panel',
          description: 'Administrative controls and settings',
          default_config: {
            position: { x: 0, y: 3, w: 8, h: 4 },
            size: 'large'
          },
          available_sizes: ['medium', 'large', 'huge'],
          required_permissions: ['admin', 'dev_admin'],
          is_active: true,
          default_order: 2,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      return Promise.resolve(templates.filter(template => {
        if (!template.required_permissions || template.required_permissions.length === 0) {
          return true;
        }
        return template.required_permissions.includes(userRole);
      }));
    }),
    findActive: jest.fn().mockResolvedValue([]),
    findByWidgetId: jest.fn().mockResolvedValue(undefined),
    findByType: jest.fn().mockResolvedValue([])
  }
}));

// Mock winston logger to avoid console noise during tests
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Global test setup
beforeEach(() => {
  resetMocks();
});

// Global test teardown
afterEach(() => {
  jest.clearAllMocks();
});

export { resetMocks };
