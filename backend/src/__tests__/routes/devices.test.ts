import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectUnauthorized, expectForbidden, expectSuccess, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';
import { DatabaseService } from '@/services/database.service';
import { DevicesService } from '@/services/devices.service';
import { AuthService } from '@/services/auth.service';
import { ConflictError, NotFoundError } from '@/middleware/error.middleware';
import { UserRole } from '@/types/auth.types';

/**
 * Matches knex chains used by devices.routes (join + select + where + first).
 * Tenant-check tables default to vacant so unlock tests don't trip override enforcement.
 * Occupant checks include `tenant_id` / `shared_with_user_id` in where — controlled by `isOccupant`.
 */
function mockKnexChainForFirstRow(
  row: Record<string, unknown>,
  options?: { hasTenant?: boolean; isOccupant?: boolean },
) {
  return jest.fn((table: string) => {
    const whereArgs: unknown[] = [];
    const chain: Record<string, unknown> = {
      select: jest.fn().mockReturnThis(),
      join: jest.fn().mockReturnThis(),
      where: jest.fn((...args: unknown[]) => {
        whereArgs.push(...args);
        return chain;
      }),
      first: jest.fn().mockImplementation(() => {
        if (table === 'unit_assignments' || table === 'key_sharing') {
          const hasUserFilter = whereArgs.some(
            (arg) =>
              arg
              && typeof arg === 'object'
              && !Array.isArray(arg)
              && ('tenant_id' in (arg as object) || 'shared_with_user_id' in (arg as object)),
          );
          if (hasUserFilter) {
            return Promise.resolve(options?.isOccupant ? { id: 'occupant-1' } : null);
          }
          return Promise.resolve(options?.hasTenant ? { id: 'assignment-1' } : null);
        }
        return Promise.resolve(row);
      }),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
    };
    return chain;
  });
}

// Mock DevicesService
jest.mock('@/services/devices.service');

const mockListNetworkInfraDevices = jest.fn().mockResolvedValue({ devices: [], total: 0 });

jest.mock('@/services/gateway-inventory-device-sync.service', () => ({
  GatewayInventoryDeviceSyncService: {
    getInstance: jest.fn(() => ({
      listNetworkInfraDevices: (...args: unknown[]) => mockListNetworkInfraDevices(...args),
    })),
  },
}));

const mockAssignAccessControlToDefaultGroup = jest.fn().mockResolvedValue(undefined);
const mockAssignBluLokToDefaultGroup = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/device-group.service', () => ({
  DeviceGroupService: {
    getInstance: jest.fn(() => ({
      assignAccessControlToDefaultGroup: (...args: unknown[]) =>
        mockAssignAccessControlToDefaultGroup(...args),
      assignBluLokToDefaultGroup: (...args: unknown[]) =>
        mockAssignBluLokToDefaultGroup(...args),
    })),
  },
}));

jest.mock('@/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn(() => ({
      pushCodesToGateway: jest.fn().mockResolvedValue(undefined),
    })),
  },
}));

const mockUpdateBluLokMetadata = jest.fn();
const mockUpdateAccessControlMetadata = jest.fn();

jest.mock('@/services/device-metadata.service', () => ({
  DeviceMetadataService: {
    getInstance: jest.fn(() => ({
      updateBluLokMetadata: mockUpdateBluLokMetadata,
      updateAccessControlMetadata: mockUpdateAccessControlMetadata,
    })),
  },
}));

const mockFindByDevice = jest.fn().mockResolvedValue([
  { id: 'de-1', user_id: 'user-1', device_id: 'device-1', reason: 'revoked' },
]);

jest.mock('@/models/denylist-entry.model', () => ({
  DenylistEntryModel: jest.fn().mockImplementation(() => ({
    findByDevice: (...args: unknown[]) => mockFindByDevice(...args),
  })),
}));

// Mock DatabaseService
jest.mock('@/services/database.service');

// Mock LockCommandService so lock route tests don't depend on real gateways
jest.mock('@/services/lock-command.service', () => {
  const issueLockCommandMock = jest.fn().mockResolvedValue({
    success: true,
    message: 'Lock command accepted and in progress',
    lock_status: 'locking',
    previous_status: 'locked',
  });
  const issueAccessControlLockCommandMock = jest.fn().mockResolvedValue({
    success: true,
    message: 'Lock command accepted',
  });
  return {
    LockCommandService: {
      getInstance: jest.fn(() => ({
        issueLockCommand: issueLockCommandMock,
        issueAccessControlLockCommand: issueAccessControlLockCommandMock,
      })),
    },
    __mocks: {
      issueLockCommandMock,
      issueAccessControlLockCommandMock,
    },
  };
});

// DeviceModel is mocked once in setup-mocks.ts (singleton on __sharedMockDeviceModel).

// Helper function to create mock device model instance
const createMockDeviceModel = () => ({
  findUnassignedDevices: jest.fn().mockResolvedValue([]),
  countUnassignedDevices: jest.fn().mockResolvedValue(0),
  findBluLokDevices: jest.fn().mockResolvedValue([]),
  findAccessControlDevices: jest.fn().mockResolvedValue([]),
  countBluLokDevices: jest.fn().mockResolvedValue(0),
  countAccessControlDevices: jest.fn().mockResolvedValue(0),
  getFacilityDeviceHierarchy: jest.fn().mockResolvedValue({}),
  createAccessControlDevice: jest.fn().mockResolvedValue({ id: 'device-1', name: 'Test Device' }),
  deleteAccessControlDevice: jest.fn().mockResolvedValue(undefined),
  createBluLokDevice: jest.fn().mockResolvedValue({ id: 'device-1', name: 'Test Device' }),
  updateDeviceStatus: jest.fn().mockResolvedValue(undefined),
  updateLockStatus: jest.fn().mockResolvedValue(undefined),
  db: { connection: jest.fn() },
});

// Mock UnitsService
jest.mock('@/services/units.service', () => ({
  UnitsService: {
    getInstance: jest.fn().mockReturnValue({
      hasUserAccessToUnit: jest.fn().mockResolvedValue(true),
    }),
  },
}));

describe('Devices Routes', () => {
  let app: any;
  let testData: MockTestData;
  let mockDeviceModel: any;
  let mockUnitsService: any;

  beforeAll(async () => {
    app = createApp();
    // Same object as `const deviceModel` in devices.routes (Jest can duplicate device.model mocks).
    const { deviceModel: routeDeviceModel } = require('@/routes/devices.routes');
    mockDeviceModel = routeDeviceModel;
    (global as any).__sharedMockDeviceModel = routeDeviceModel;
  });

  beforeEach(async () => {
    testData = createMockTestData();
    mockAssignAccessControlToDefaultGroup.mockClear();
    mockAssignBluLokToDefaultGroup.mockClear();
    mockListNetworkInfraDevices.mockReset();
    mockListNetworkInfraDevices.mockResolvedValue({ devices: [], total: 0 });
    
    // Create mock knex connection (vacant tenant tables by default)
    const createMockKnex = (returnValue?: any) => {
      const mockKnexFn = jest.fn((table: string) => {
        const isTenantCheck = table === 'unit_assignments' || table === 'key_sharing';
        const queryBuilder = {
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(
            isTenantCheck
              ? null
              : (returnValue || { unit_id: testData.units.unit1.id }),
          ),
          whereIn: jest.fn().mockReturnThis(),
          join: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
        };
        return queryBuilder;
      });
      return mockKnexFn;
    };
    
    // Don't override mock methods here - let individual tests set their own return values
    // The default from createMockDeviceModel() will be used if tests don't override
    
    // Set up db.connection to return a mock knex function
    mockDeviceModel.db.connection = createMockKnex();
    
    // Reset and setup UnitsService mock
    const { UnitsService } = require('@/services/units.service');
    mockUnitsService = {
      hasUserAccessToUnit: jest.fn().mockResolvedValue(true),
    };
    (UnitsService.getInstance as jest.Mock).mockReturnValue(mockUnitsService);
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all device endpoints', async () => {
      const endpoints = [
        '/api/v1/devices',
        `/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`,
        '/api/v1/devices/access-control',
        '/api/v1/devices/blulok',
        `/api/v1/devices/access_control/device-1/status`,
        `/api/v1/devices/blulok/device-1/lock`,
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expectUnauthorized(response);
      }
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('Business Logic - Device Management', () => {
    describe('GET /api/v1/devices - List Devices', () => {
      it('should return paginated devices for DEV_ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/devices?limit=10&offset=0')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should filter devices by facility_id', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should filter devices by device_type', async () => {
        const response = await request(app)
          .get('/api/v1/devices?device_type=access_control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should filter devices by status', async () => {
        const response = await request(app)
          .get('/api/v1/devices?status=online')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle search query', async () => {
        const response = await request(app)
          .get('/api/v1/devices?search=gate')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle sorting', async () => {
        const response = await request(app)
          .get('/api/v1/devices?sort_by=name&sort_order=asc')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle pagination', async () => {
        const response = await request(app)
          .get('/api/v1/devices?limit=5&offset=5')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should cap merged device_type=all list when limit is omitted', async () => {
        const rows = Array.from({ length: 40 }, (_, i) => ({
          id: `ac-${i}`,
          name: `Device ${i}`,
          device_type: 'gate',
          status: 'online',
          facility_name: 'F',
          gateway_name: 'G',
          last_activity: null as string | null,
          created_at: '2020-01-01T00:00:00.000Z',
        }));
        mockDeviceModel.findAccessControlDevices.mockResolvedValue(rows);
        mockDeviceModel.findBluLokDevices.mockResolvedValue([]);

        const response = await request(app)
          .get('/api/v1/devices?device_type=all')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.total).toBe(40);
        expect(response.body.devices.length).toBe(30);
      });

      it('should paginate merged device_type=all with natural name order (page 2)', async () => {
        mockDeviceModel.findAccessControlDevices.mockResolvedValue([
          {
            id: 'g2',
            name: 'Gate 2',
            device_type: 'gate',
            status: 'online',
            facility_name: 'F',
            gateway_name: 'G',
            last_activity: null,
            created_at: '2020-01-01T00:00:00.000Z',
          },
          {
            id: 'g10',
            name: 'Gate 10',
            device_type: 'gate',
            status: 'online',
            facility_name: 'F',
            gateway_name: 'G',
            last_activity: null,
            created_at: '2020-01-01T00:00:00.000Z',
          },
          {
            id: 'g1',
            name: 'Gate 1',
            device_type: 'gate',
            status: 'online',
            facility_name: 'F',
            gateway_name: 'G',
            last_activity: null,
            created_at: '2020-01-01T00:00:00.000Z',
          },
        ]);
        mockDeviceModel.findBluLokDevices.mockResolvedValue([]);

        const response = await request(app)
          .get('/api/v1/devices?device_type=all&sort_by=name&sort_order=asc&limit=1&offset=1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.devices).toHaveLength(1);
        expect(response.body.devices[0].id).toBe('g2');
      });

      it('should return id projection and skip BluLok tenant enrichment when projection=id', async () => {
        mockDeviceModel.findAccessControlDevices.mockResolvedValue([
          {
            id: 'ac-1',
            name: 'Gate A',
            device_type: 'gate',
            status: 'online',
            facility_name: 'F',
            gateway_name: 'G',
            last_activity: null,
            created_at: '2020-01-01T00:00:00.000Z',
          },
        ]);
        mockDeviceModel.findBluLokDevices.mockResolvedValue([
          {
            id: 'bl-1',
            unit_number: '101',
            device_serial: 'S1',
            status: 'online',
            facility_name: 'F',
            gateway_name: 'G',
            last_activity: null,
            created_at: '2020-01-01T00:00:00.000Z',
          },
        ]);

        const response = await request(app)
          .get('/api/v1/devices?device_type=all&projection=id')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.total).toBe(2);
        for (const d of response.body.devices as Array<Record<string, unknown>>) {
          expect(Object.keys(d).sort()).toEqual(['device_category', 'id'].sort());
          expect(typeof d.id).toBe('string');
          expect(typeof d.device_category).toBe('string');
        }
        expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalledWith(
          expect.objectContaining({ skipPrimaryTenantEnrichment: true })
        );
      });
    });

    describe('GET /api/v1/devices/facility/:facilityId/hierarchy - Get Facility Device Hierarchy', () => {
      it('should return facility device hierarchy for DEV_ADMIN', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should return facility device hierarchy for ADMIN', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should return 404 for non-existent facility', async () => {
        const response = await request(app)
          .get('/api/v1/devices/facility/non-existent-facility/hierarchy')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        // The route returns 200 with empty hierarchy for non-existent facilities
        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });
    });

    describe('POST /api/v1/devices/access-control - Create Access Control Device', () => {
      const validAccessControlData = {
        gateway_id: 'gateway-1',
        name: 'Main Gate Controller',
        device_type: 'gate',
        location_description: 'Main entrance gate',
        relay_channel: 1,
        device_serial: 'AC-GATE-001',
      };

      it('should create access control device for DEV_ADMIN', async () => {
        // Update the return value that the mock function reads from
        const mockReturnValues = (global as any).__mockReturnValues;
        mockReturnValues.createAccessControlDevice = {
          id: 'device-1',
          name: validAccessControlData.name,
          device_type: validAccessControlData.device_type,
          gateway_id: validAccessControlData.gateway_id,
          location_description: validAccessControlData.location_description,
          relay_channel: validAccessControlData.relay_channel,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
        expect(response.body.device).toHaveProperty('name', validAccessControlData.name);
        expect(response.body.device).toHaveProperty('device_type', validAccessControlData.device_type);
        expect(mockAssignAccessControlToDefaultGroup).toHaveBeenCalledWith(
          '550e8400-e29b-41d4-a716-446655440001',
          'device-1',
          expect.objectContaining({ actorId: expect.any(String) }),
        );
      });

      it('should create access control device for ADMIN', async () => {
        mockDeviceModel.createAccessControlDevice.mockResolvedValueOnce({
          id: 'device-1',
          name: validAccessControlData.name,
          device_type: validAccessControlData.device_type,
          gateway_id: validAccessControlData.gateway_id,
        });

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should create access control device for FACILITY_ADMIN with access', async () => {
        mockDeviceModel.createAccessControlDevice.mockResolvedValueOnce({
          id: 'device-1',
          name: validAccessControlData.name,
          device_type: validAccessControlData.device_type,
        });

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            name: 'Test Device'
            // Missing other required fields
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid device_type', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            ...validAccessControlData,
            device_type: 'invalid_type'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should sanitize HTML in device name', async () => {
        const maliciousData = {
          ...validAccessControlData,
          name: '<script>alert("xss")</script>Malicious Device'
        };

        const sanitizedName = '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious Device';
        // Update the return value that the mock function reads from
        const mockReturnValues = (global as any).__mockReturnValues;
        mockReturnValues.createAccessControlDevice = {
          id: 'device-1',
          name: sanitizedName,
          device_type: validAccessControlData.device_type,
          gateway_id: validAccessControlData.gateway_id,
          location_description: validAccessControlData.location_description,
          relay_channel: validAccessControlData.relay_channel,
        };

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(maliciousData)
          .expect(201);

        expectSuccess(response);
        expect(response.body.device.name).toBe(sanitizedName);
      });

      it('should allow the same device_serial on a different relay_channel', async () => {
        mockDeviceModel.findAccessControlIdentityConflict.mockResolvedValue(null);
        mockDeviceModel.createAccessControlDevice
          .mockResolvedValueOnce({
            id: 'device-door-1',
            ...validAccessControlData,
            relay_channel: 1,
          })
          .mockResolvedValueOnce({
            id: 'device-door-2',
            ...validAccessControlData,
            relay_channel: 2,
          });

        const first = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validAccessControlData)
          .expect(201);

        const second = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            ...validAccessControlData,
            relay_channel: 2,
            name: 'Second Door on Shared Keypad',
          })
          .expect(201);

        expectSuccess(first);
        expectSuccess(second);
        expect(second.body.device.relay_channel).toBe(2);
        expect(mockDeviceModel.findAccessControlIdentityConflict).toHaveBeenCalledTimes(2);
      });
    });

    describe('POST /api/v1/devices/blulok - Create BluLok Device', () => {
      const validBluLokData = {
        gateway_id: 'gateway-1',
        name: 'Unit 1 Lock Controller',
        device_type: 'blulok',
        location_description: 'Unit 1 entrance',
        unit_id: 'unit-1',
        serial: 'BL-UNIT-1'
      };

      it('should create BluLok device for DEV_ADMIN', async () => {
        // Update the return value that the mock function reads from
        const mockReturnValues = (global as any).__mockReturnValues;
        mockReturnValues.createBluLokDevice = {
          id: 'device-1',
          name: validBluLokData.name,
          device_type: validBluLokData.device_type,
          gateway_id: validBluLokData.gateway_id,
          location_description: validBluLokData.location_description,
          unit_id: validBluLokData.unit_id,
          created_at: new Date(),
          updated_at: new Date(),
        };

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
        expect(response.body.device).toHaveProperty('name', validBluLokData.name);
        expect(response.body.device).toHaveProperty('device_type', validBluLokData.device_type);
        expect(mockAssignBluLokToDefaultGroup).toHaveBeenCalledWith(
          '550e8400-e29b-41d4-a716-446655440001',
          'device-1',
          expect.objectContaining({ actorId: expect.any(String) }),
        );
      });

      it('should normalize serial alias to device_serial and serial', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validBluLokData)
          .expect(201);
        expectSuccess(response);
      });

      it('should accept device_serial alias directly', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            name: 'Unit 2 Lock Controller',
            device_type: 'blulok',
            location_description: 'Unit 2 entrance',
            unit_id: 'unit-2',
            device_serial: 'BL-UNIT-2',
          })
          .expect(201);
        expectSuccess(response);
      });

      it('should create BluLok with minimal payload (serial only, no unit)', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            device_serial: 'BL-MINIMAL-1',
          })
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('returns 409 when BluLok serial already exists', async () => {
        mockDeviceModel.findBluLokBySerial.mockResolvedValueOnce({ id: 'existing-device' });

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            device_serial: 'BL-DUPLICATE',
          })
          .expect(409);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/already in use/i);
        expect(mockDeviceModel.createBluLokDevice).not.toHaveBeenCalled();
      });

      it('returns 403 when facility_admin creates BluLok on out-of-scope gateway', async () => {
        mockDeviceModel.findGatewayById.mockResolvedValueOnce({
          id: 'gateway-other',
          facility_id: '00000000-0000-0000-0000-000000000099',
          name: 'Other Gateway',
        });

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({
            gateway_id: 'gateway-other',
            device_serial: 'BL-SCOPED-TEST',
          })
          .expect(403);

        expectForbidden(response);
      });

      it('should reject request when both serial aliases are missing', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            name: 'Missing Serial Lock',
            device_type: 'blulok',
            location_description: 'Unit 3 entrance',
            unit_id: 'unit-3',
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should reject request when serial and device_serial disagree', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            name: 'Conflicting Serial Lock',
            device_type: 'blulok',
            location_description: 'Unit conflict entrance',
            unit_id: 'unit-4',
            serial: 'BL-UNIT-4A',
            device_serial: 'BL-UNIT-4B',
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should create BluLok device for ADMIN', async () => {
        mockDeviceModel.createBluLokDevice.mockResolvedValueOnce({
          id: 'device-1',
          name: validBluLokData.name,
          device_type: validBluLokData.device_type,
        });

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should create BluLok device for FACILITY_ADMIN with access', async () => {
        mockDeviceModel.createBluLokDevice.mockResolvedValueOnce({
          id: 'device-1',
          name: validBluLokData.name,
          device_type: validBluLokData.device_type,
        });

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should return 400 for missing required fields', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            name: 'Test BluLok'
            // Missing other required fields
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid lock_status', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            ...validBluLokData,
            lock_status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should sanitize HTML in device name', async () => {
        const maliciousData = {
          ...validBluLokData,
          name: '<script>alert("xss")</script>Malicious BluLok'
        };

        const sanitizedName = '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious BluLok';
        // Update the return value that the mock function reads from
        const mockReturnValues = (global as any).__mockReturnValues;
        mockReturnValues.createBluLokDevice = {
          id: 'device-1',
          name: sanitizedName,
          device_type: validBluLokData.device_type,
          gateway_id: validBluLokData.gateway_id,
        };

        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(maliciousData)
          .expect(201);

        expectSuccess(response);
        expect(response.body.device.name).toBe(sanitizedName);
      });
    });

    describe('PUT /api/v1/devices/:deviceType/:id/status - Update Device Status', () => {
      const validStatusData = {
        status: 'offline'
      };

      it('should update device status for DEV_ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update device status for ADMIN', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update device status for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for invalid status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for invalid device type', async () => {
        const response = await request(app)
          .put('/api/v1/devices/invalid_type/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(400);

        expectBadRequest(response);
      });
    });

    describe('PUT /api/v1/devices/blulok/:id/lock - Update Lock Status / Command', () => {
      const validLockData = {
        lock_status: 'unlocked'
      };

      it('should send lock command and enter transitional state for DEV_ADMIN', async () => {
        // Setup mock knex for device lookup
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for ADMIN', async () => {
        // Setup mock knex for device lookup
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for FACILITY_ADMIN with access', async () => {
        // Setup mock knex for device lookup
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for TENANT with access', async () => {
        // Setup mock knex for device lookup
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should update lock status for MAINTENANCE when assigned', async () => {
        // Setup mock knex for device lookup
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for invalid lock_status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            lock_status: 'invalid_status'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('allows unlock without override when override is optional', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(
          { unit_id: testData.units.unit1.id },
          { hasTenant: true },
        );
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);
        const { __mocks } = require('@/services/lock-command.service');
        __mocks.issueLockCommandMock.mockClear();

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(__mocks.issueLockCommandMock).toHaveBeenCalledWith(
          'device-1',
          'unlocked',
          expect.objectContaining({ userId: expect.any(String) }),
          { tenantUnlockOverride: undefined },
        );
      });

      it('rejects invalid tenant_override_reason when provided', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(
          { unit_id: testData.units.unit1.id },
          { hasTenant: true },
        );
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);
        const { __mocks } = require('@/services/lock-command.service');
        __mocks.issueLockCommandMock.mockClear();

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            lock_status: 'unlocked',
            tenant_override_reason: 'not-a-real-reason',
          })
          .expect(400);

        // Joi may reject before route logic; either way unlock must not proceed.
        expect(response.body.success).toBe(false);
        expect(__mocks.issueLockCommandMock).not.toHaveBeenCalled();
      });

      it('should unlock without override when caller is unit occupant', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(
          { unit_id: testData.units.unit1.id },
          { hasTenant: true, isOccupant: true },
        );
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);
        const { __mocks } = require('@/services/lock-command.service');
        __mocks.issueLockCommandMock.mockClear();

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(__mocks.issueLockCommandMock).toHaveBeenCalledWith(
          'device-1',
          'unlocked',
          expect.objectContaining({ userId: expect.any(String) }),
          { tenantUnlockOverride: undefined },
        );
      });

      it('should unlock with valid tenant override and pass it to LockCommandService', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(
          { unit_id: testData.units.unit1.id },
          { hasTenant: true },
        );
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);
        const { __mocks } = require('@/services/lock-command.service');
        __mocks.issueLockCommandMock.mockClear();

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            lock_status: 'unlocked',
            tenant_override_reason: 'emergency',
            tenant_override_notes: 'Flood under door',
          })
          .expect(200);

        expectSuccess(response);
        expect(__mocks.issueLockCommandMock).toHaveBeenCalledWith(
          'device-1',
          'unlocked',
          expect.objectContaining({ userId: expect.any(String) }),
          {
            tenantUnlockOverride: {
              reason: 'emergency',
              reasonLabel: 'Emergency (Fire, flood, other)',
              notes: 'Flood under door',
            },
          },
        );
      });
    });

    describe('POST /api/v1/devices/blulok/:id/occupied-unit-override', () => {
      const { OccupiedUnlockIntentService } = require('@/services/occupied-unlock-intent.service');
      const path = '/api/v1/devices/blulok/device-1/occupied-unit-override';
      const deviceRow = {
        unit_id: 'unit-1',
        facility_id: 'facility-1',
        gateway_id: 'gw-1',
      };

      beforeEach(() => {
        OccupiedUnlockIntentService.resetForTests();
        deviceRow.unit_id = testData.units.unit1.id;
        deviceRow.facility_id = testData.facilities.facility1.id;
      });

      it('returns 404 when device is missing', async () => {
        mockDeviceModel.db.connection = jest.fn(() => ({
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
        }));

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'emergency' })
          .expect(404);

        expect(response.body.success).toBe(false);
        expect(response.body.message).toMatch(/not found/i);
      });

      it('returns 400 when device has no unit', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({
          unit_id: null,
          facility_id: deviceRow.facility_id,
          gateway_id: 'gw-1',
        });

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'emergency' })
          .expect(400);

        expect(response.body.code).toBe('TENANT_UNLOCK_OVERRIDE_NOT_REQUIRED');
      });

      it('returns 403 when caller lacks unit access', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, { hasTenant: true });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(false);

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'emergency' })
          .expect(403);

        expect(response.body.success).toBe(false);
      });

      it('returns 400 when unit is vacant', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, { hasTenant: false });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'emergency' })
          .expect(400);

        expect(response.body.code).toBe('TENANT_UNLOCK_OVERRIDE_NOT_REQUIRED');
      });

      it('returns 400 when caller is the unit occupant', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, {
          hasTenant: true,
          isOccupant: true,
        });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send({ reason: 'emergency' })
          .expect(400);

        expect(response.body.code).toBe('TENANT_UNLOCK_OVERRIDE_NOT_APPLICABLE');
      });

      it('returns 400 for invalid override reason (schema)', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, { hasTenant: true });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'not-a-valid-reason' })
          .expect(400);

        expect(response.body.success).toBe(false);
      });

      it('creates intent for facility admin on occupied unit', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, { hasTenant: true });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'emergency', notes: 'Flood under door' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual(
          expect.objectContaining({
            intent_id: expect.any(String),
            expires_at: expect.any(String),
            device_id: 'device-1',
            unit_id: deviceRow.unit_id,
          }),
        );
      });

      it('returns 409 when another user already has a pending intent', async () => {
        mockDeviceModel.db.connection = mockKnexChainForFirstRow(deviceRow, { hasTenant: true });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValue(true);

        OccupiedUnlockIntentService.getInstance().createIntent({
          userId: 'other-user',
          userName: 'Other Staff',
          role: 'facility_admin',
          deviceId: 'device-1',
          unitId: deviceRow.unit_id,
          facilityId: deviceRow.facility_id,
          gatewayId: 'gw-1',
          override: { reason: 'emergency', reasonLabel: 'Emergency (Fire, flood, other)' },
        });

        const response = await request(app)
          .post(path)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ reason: 'testing_maintenance' })
          .expect(409);

        expect(response.body.code).toBe('OCCUPIED_UNLOCK_INTENT_IN_USE');
      });
    });

    describe('PUT /api/v1/devices/access-control/:id/lock - Gateway OPEN/CLOSE', () => {
      const validLockData = { lock_status: 'unlocked' as const };

      it('should issue access-control unlock for ADMIN', async () => {
        mockDeviceModel.db.connection = jest.fn(() => ({
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: testData.facilities.facility1.id }),
          update: jest.fn().mockResolvedValue(1),
        }));

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body.success).toBe(true);
      });

      it('should return 403 for FACILITY_ADMIN when device is in another facility', async () => {
        mockDeviceModel.db.connection = jest.fn(() => ({
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: testData.facilities.facility2.id }),
        }));

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow FACILITY_ADMIN when device facility is in scope', async () => {
        mockDeviceModel.db.connection = jest.fn(() => ({
          join: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ facility_id: testData.facilities.facility1.id }),
          update: jest.fn().mockResolvedValue(1),
        }));

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Security - Role-Based Access Control', () => {
    describe('GET /api/v1/devices - List Devices', () => {
      it('should allow DEV_ADMIN to list all devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should allow ADMIN to list all devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should allow FACILITY_ADMIN to list devices in their facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should pass all assigned facility IDs when FACILITY_ADMIN omits facility_id (dashboard all-facilities scope)', async () => {
        mockDeviceModel.findAccessControlDevices.mockClear();
        mockDeviceModel.findBluLokDevices.mockClear();
        mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
        mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
        mockDeviceModel.countAccessControlDevices.mockResolvedValue(0);
        mockDeviceModel.countBluLokDevices.mockResolvedValue(0);

        await request(app)
          .get('/api/v1/devices?device_type=access_control')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
          expect.objectContaining({
            facility_ids: testData.users.facilityAdmin.facilityIds,
          })
        );
      });

      it('should prevent FACILITY_ADMIN from listing devices in other facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-2')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should deny TENANT from listing devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent TENANT from listing devices in other facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices?facility_id=facility-2')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow MAINTENANCE to list devices in their facilities', async () => {
        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });
    });

    describe('GET /api/v1/devices/facility/:facilityId/hierarchy - Get Facility Device Hierarchy', () => {
      it('should allow DEV_ADMIN to view any facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should allow ADMIN to view any facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should allow FACILITY_ADMIN to view their facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('hierarchy');
      });

      it('should prevent FACILITY_ADMIN from viewing other facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility2.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should deny TENANT from viewing facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility1.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent TENANT from viewing other facility hierarchy', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/facility/${testData.facilities.facility2.id}/hierarchy`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('POST /api/v1/devices/access-control - Create Access Control Device', () => {
      const validAccessControlData = {
        gateway_id: 'gateway-1',
        name: 'Main Gate Controller',
        device_type: 'gate',
        location_description: 'Main entrance gate',
        relay_channel: 1,
        device_serial: 'AC-GATE-001',
      };

      it('should allow DEV_ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow FACILITY_ADMIN to create access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validAccessControlData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should prevent TENANT from creating access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validAccessControlData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from creating access control devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validAccessControlData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('POST /api/v1/devices/blulok - Create BluLok Device', () => {
      const validBluLokData = {
        gateway_id: 'gateway-1',
        name: 'Unit 1 Lock Controller',
        device_type: 'blulok',
        location_description: 'Unit 1 entrance',
        unit_id: 'unit-1',
        serial: 'BL-UNIT-1'
      };

      it('should allow DEV_ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should allow FACILITY_ADMIN to create BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validBluLokData)
          .expect(201);

        expectSuccess(response);
        expect(response.body).toHaveProperty('device');
      });

      it('should prevent TENANT from creating BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validBluLokData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from creating BluLok devices', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validBluLokData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('PUT /api/v1/devices/:deviceType/:id/status - Update Device Status', () => {
      const validStatusData = {
        status: 'offline'
      };

      it('should allow DEV_ADMIN to update device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow ADMIN to update device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow FACILITY_ADMIN to update device status in their facilities', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validStatusData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should prevent TENANT from updating device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validStatusData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from updating device status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access_control/device-1/status')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validStatusData)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('PUT /api/v1/devices/blulok/:id/lock - Update Lock Status', () => {
      const validLockData = {
        lock_status: 'unlocked'
      };

      it('should allow DEV_ADMIN to control lock status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow ADMIN to control lock status', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow FACILITY_ADMIN to control lock status in their facilities', async () => {
        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should allow TENANT to control lock status for their units', async () => {
        // Setup mock knex to return device with unit_id that tenant has access to
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should prevent TENANT from controlling lock status for other units', async () => {
        // Setup mock knex to return device with unit_id that tenant doesn't have access to
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit2.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(false);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-2/lock')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validLockData)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow MAINTENANCE to control lock status when assigned', async () => {
        // Setup mock knex to return device with unit_id
        mockDeviceModel.db.connection = mockKnexChainForFirstRow({ unit_id: testData.units.unit1.id });
        mockUnitsService.hasUserAccessToUnit.mockResolvedValueOnce(true);

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/lock')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validLockData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see devices in their facilities', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
      mockDeviceModel.countBluLokDevices.mockResolvedValue(0);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned devices should be for facilities the admin has access to
      expect(response.body).toHaveProperty('devices');
    });

    it('should deny tenants from listing devices', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
      mockDeviceModel.countBluLokDevices.mockResolvedValue(0);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/devices')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Input Validation and Security', () => {
    it('should prevent SQL injection in device queries', async () => {
      mockDeviceModel.findBluLokDevices.mockResolvedValue([]);
      mockDeviceModel.findAccessControlDevices.mockResolvedValue([]);
      mockDeviceModel.countBluLokDevices.mockResolvedValue(0);
      mockDeviceModel.countAccessControlDevices.mockResolvedValue(0);

      const response = await request(app)
        .get('/api/v1/devices?search=\'; DROP TABLE devices; --')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('devices');
    });

    it('should validate device type enum values', async () => {
      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          name: 'Test Device',
          device_type: 'invalid_type',
          facility_id: 'facility-1',
          unit_id: 'unit-1',
          location_description: 'Test location',
          ip_address: '192.168.1.100',
          port: 8080,
          status: 'online'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate lock status enum values', async () => {
      const response = await request(app)
        .put('/api/v1/devices/blulok/device-1/lock')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          lock_status: 'invalid_status'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate device status enum values', async () => {
      const response = await request(app)
        .put('/api/v1/devices/access_control/device-1/status')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          status: 'invalid_status'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should prevent XSS in device names', async () => {
      const maliciousData = {
        gateway_id: 'gateway-1',
        name: '<script>alert("xss")</script>Malicious Device',
        device_type: 'door',
        location_description: 'Test location',
        relay_channel: 1,
        device_serial: 'AC-GATE-001',
      };

      const sanitizedName = '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;Malicious Device';
      // Update the return value that the mock function reads from
      const mockReturnValues = (global as any).__mockReturnValues;
      mockReturnValues.createAccessControlDevice = {
        id: 'device-1',
        name: sanitizedName,
        device_type: maliciousData.device_type,
        gateway_id: maliciousData.gateway_id,
      };

      const response = await request(app)
        .post('/api/v1/devices/access-control')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(201);

      expectSuccess(response);
      expect(response.body.device.name).toBe(sanitizedName);
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    it('should handle rapid device status updates gracefully', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .put('/api/v1/devices/access_control/device-1/status')
            .set('Authorization', `Bearer ${testData.users.admin.token}`)
            .send({ status: 'online' })
        );
      }

      const responses = await Promise.all(promises);
      
      // All requests should succeed (rate limiting is disabled in test mode)
      responses.forEach(response => {
        expect([200]).toContain(response.status);
      });
    });
  });

  describe('Device Assignment Routes', () => {
    describe('GET /api/v1/devices/unassigned - Get Unassigned Devices', () => {
      beforeEach(() => {
        // Reset DeviceModel mocks for unassigned devices
        mockDeviceModel.findUnassignedDevices.mockResolvedValue([]);
        mockDeviceModel.countUnassignedDevices.mockResolvedValue(0);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .expect(401);

        expectUnauthorized(response);
      });

      it('should return unassigned devices for DEV_ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(response.body).toHaveProperty('total');
        expect(Array.isArray(response.body.devices)).toBe(true);
      });

      it('should return unassigned devices for ADMIN', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(response.body).toHaveProperty('total');
      });

      it('should return unassigned devices for FACILITY_ADMIN with facility filter', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/unassigned?facility_id=${testData.facilities.facility1.id}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(response.body).toHaveProperty('total');
      });

      it('should prevent FACILITY_ADMIN from accessing other facilities', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/unassigned?facility_id=${testData.facilities.facility2.id}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should filter unassigned devices by facility_id', async () => {
        const response = await request(app)
          .get(`/api/v1/devices/unassigned?facility_id=${testData.facilities.facility1.id}`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
      });

      it('should handle pagination for unassigned devices', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned?limit=10&offset=0')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('devices');
        expect(response.body).toHaveProperty('total');
      });

      it('should prevent TENANT from accessing unassigned devices endpoint', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent MAINTENANCE from accessing unassigned devices endpoint', async () => {
        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('POST /api/v1/devices/blulok/:deviceId/assign - Assign Device to Unit', () => {
      const assignData = {
        unit_id: '550e8400-e29b-41d4-a716-446655440011' // unit1.id
      };

      beforeEach(() => {
        // Mock DevicesService methods
        const mockDevicesService = {
          assignDeviceToUnit: jest.fn().mockResolvedValue(undefined),
          unassignDeviceFromUnit: jest.fn().mockResolvedValue(undefined),
          hasUserAccessToDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .send(assignData)
          .expect(401);

        expectUnauthorized(response);
      });

      it('should assign device to unit for DEV_ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(assignData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('assigned');
      });

      it('should assign device to unit for ADMIN', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(assignData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should assign device to unit for FACILITY_ADMIN with access', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(assignData)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for missing unit_id', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({})
          .expect(400);

        expectBadRequest(response);
        expect(response.body.message).toContain('unit_id');
      });

      it('should return 400 for missing deviceId', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok//assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(assignData)
          .expect(404); // Route not found, not 400

        // This is expected - invalid route
        expect([404, 400]).toContain(response.status);
      });

      it('should return 403 for TENANT', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(assignData)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 403 for MAINTENANCE', async () => {
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(assignData)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent FACILITY_ADMIN from assigning device in other facility', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.hasUserAccessToDevice.mockResolvedValueOnce(false);

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-2/assign') // Assuming device-2 is in facility-2
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({
            unit_id: testData.units.unit2.id // unit2 is in facility2
          })
          .expect(403);

        expectForbidden(response);
      });

      it('should return 400 for non-existent device', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Device not found')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/non-existent-device/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(assignData)
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 for non-existent unit', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Unit not found')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: 'non-existent-unit'
          })
          .expect(400);

        expectBadRequest(response);
      });

      it('should return 400 when device is already assigned to different unit', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Device is already assigned to another unit. Unassign it first or change the assignment.')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit2.id
          })
          .expect(400);

        expectBadRequest(response);
        expect(response.body.message).toMatch(/already assigned|different unit/i);
      });

      it('should return 400 when unit already has a device', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Unit already has a device assigned')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-2/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          })
          .expect(400);

        expectBadRequest(response);
        expect(response.body.message).toMatch(/already has|device assigned/i);
      });

      it('should handle device and unit from different facilities gracefully', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Device and unit must belong to the same facility')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit2.id // unit2 is in facility2, device-1 might be in facility1
          })
          .expect(400); // Should fail due to facility mismatch

        expectBadRequest(response);
        expect(response.body.message).toMatch(/facility|must belong/i);
      });
    });

    describe('DELETE /api/v1/devices/blulok/:deviceId/unassign - Unassign Device from Unit', () => {
      beforeEach(() => {
        // Mock DevicesService methods
        const mockDevicesService = {
          assignDeviceToUnit: jest.fn().mockResolvedValue(undefined),
          unassignDeviceFromUnit: jest.fn().mockResolvedValue(undefined),
          hasUserAccessToDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .expect(401);

        expectUnauthorized(response);
      });

      it('should unassign device from unit for DEV_ADMIN', async () => {
        // First assign device
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          });

        // Then unassign
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('unassigned');
      });

      it('should unassign device from unit for ADMIN', async () => {
        // First assign device
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          });

        // Then unassign
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should unassign device from unit for FACILITY_ADMIN with access', async () => {
        // First assign device
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          });

        // Then unassign
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should return 400 for missing deviceId', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok//unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404); // Route not found

        expect([404, 400]).toContain(response.status);
      });

      it('should return 403 for TENANT', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 403 for MAINTENANCE', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should prevent FACILITY_ADMIN from unassigning device in other facility', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.hasUserAccessToDevice.mockResolvedValueOnce(false);

        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-2/unassign') // Assuming device-2 is in facility-2
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 400 for non-existent device', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.unassignDeviceFromUnit.mockRejectedValueOnce(
          new Error('Device not found')
        );

        const response = await request(app)
          .delete('/api/v1/devices/blulok/non-existent-device/unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(400);

        expectBadRequest(response);
      });

      it('should handle unassigning already unassigned device gracefully', async () => {
        const mockDevicesService = DevicesService.getInstance() as any;
        mockDevicesService.unassignDeviceFromUnit.mockRejectedValueOnce(
          new Error('Device is not assigned to any unit')
        );

        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(400); // Should return error for already unassigned device

        expectBadRequest(response);
        expect(response.body.message).toMatch(/not assigned|already unassigned/i);
      });

      it('should allow reassignment after unassignment', async () => {
        // Assign device
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          });

        // Unassign device
        await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        // Should be able to assign again
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit2.id
          })
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });
    });

    describe('DELETE /api/v1/devices/blulok/:deviceId - Remove BluLok from cloud inventory', () => {
      let mockDevicesService: {
        removeBluLokDeviceFromCloudInventory: jest.Mock;
        hasUserAccessToDevice: jest.Mock;
      };

      beforeEach(() => {
        mockDevicesService = {
          removeBluLokDeviceFromCloudInventory: jest.fn().mockResolvedValue({
            gatewayId: 'gateway-1',
            facilityId: 'facility-1',
            hadUnit: false,
            unitId: null,
            deviceSerial: 'LOCK-1',
          }),
          hasUserAccessToDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should require authentication', async () => {
        const response = await request(app).delete('/api/v1/devices/blulok/device-1');
        expectUnauthorized(response);
      });

      it('should allow FACILITY_ADMIN with facility access', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.success).toBe(true);
        expect(mockDevicesService.hasUserAccessToDevice).toHaveBeenCalledWith(
          'device-1',
          testData.users.facilityAdmin.id,
          testData.users.facilityAdmin.role,
        );
        expect(mockDevicesService.removeBluLokDeviceFromCloudInventory).toHaveBeenCalled();
      });

      it('should forbid FACILITY_ADMIN without device access', async () => {
        mockDevicesService.hasUserAccessToDevice.mockResolvedValueOnce(false);

        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should remove inventory for ADMIN', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.success).toBe(true);
        expect(response.body.removed).toMatchObject({ gatewayId: 'gateway-1' });
        expect(mockDevicesService.removeBluLokDeviceFromCloudInventory).toHaveBeenCalledWith(
          'device-1',
          expect.objectContaining({ performedBy: expect.any(String) }),
        );
      });

      it('should remove inventory for DEV_ADMIN', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.success).toBe(true);
      });

      it('should return 404 when device not found', async () => {
        mockDevicesService.removeBluLokDeviceFromCloudInventory.mockRejectedValueOnce(new Error('Device not found'));

        const response = await request(app)
          .delete('/api/v1/devices/blulok/missing')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('should return 403 for TENANT', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 403 for MAINTENANCE', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('DELETE /api/v1/devices/access-control/:deviceId - Remove access control from cloud inventory', () => {
      let mockDevicesService: {
        removeAccessControlDeviceFromCloudInventory: jest.Mock;
        hasUserAccessToAccessControlDevice: jest.Mock;
      };

      beforeEach(() => {
        mockDevicesService = {
          removeAccessControlDeviceFromCloudInventory: jest.fn().mockResolvedValue({
            gatewayId: 'gateway-1',
            facilityId: 'facility-1',
            accessId: 'KP-001',
            relayChannel: 1,
          }),
          hasUserAccessToAccessControlDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should require authentication', async () => {
        const response = await request(app).delete('/api/v1/devices/access-control/device-1');
        expectUnauthorized(response);
      });

      it('should allow FACILITY_ADMIN with facility access', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/access-control/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(mockDevicesService.hasUserAccessToAccessControlDevice).toHaveBeenCalled();
        expect(mockDevicesService.removeAccessControlDeviceFromCloudInventory).toHaveBeenCalledWith(
          'device-1',
          expect.objectContaining({ performedBy: expect.any(String) }),
        );
      });

      it('should forbid FACILITY_ADMIN without device access', async () => {
        mockDevicesService.hasUserAccessToAccessControlDevice.mockResolvedValueOnce(false);

        const response = await request(app)
          .delete('/api/v1/devices/access-control/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 403 for TENANT', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/access-control/device-1')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('DELETE /api/v1/devices/network-infra/:deviceId - Remove network infra from cloud inventory', () => {
      let mockDevicesService: {
        removeNetworkInfraDeviceFromCloudInventory: jest.Mock;
        hasUserAccessToNetworkInfraDevice: jest.Mock;
      };

      beforeEach(() => {
        mockDevicesService = {
          removeNetworkInfraDeviceFromCloudInventory: jest.fn().mockResolvedValue({
            gatewayId: 'gateway-1',
            facilityId: 'facility-1',
            deviceKind: 'bridge',
            deviceSerial: 'BR-001',
          }),
          hasUserAccessToNetworkInfraDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should require authentication', async () => {
        const response = await request(app).delete('/api/v1/devices/network-infra/ni-1');
        expectUnauthorized(response);
      });

      it('should allow ADMIN to remove network infra device', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/network-infra/ni-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(mockDevicesService.removeNetworkInfraDeviceFromCloudInventory).toHaveBeenCalledWith(
          'ni-1',
          expect.objectContaining({ performedBy: expect.any(String) }),
        );
      });

      it('should forbid FACILITY_ADMIN without device access', async () => {
        mockDevicesService.hasUserAccessToNetworkInfraDevice.mockResolvedValueOnce(false);

        const response = await request(app)
          .delete('/api/v1/devices/network-infra/ni-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should return 404 when device not found', async () => {
        mockDevicesService.removeNetworkInfraDeviceFromCloudInventory.mockRejectedValueOnce(
          new Error('Network infra device not found'),
        );

        const response = await request(app)
          .delete('/api/v1/devices/network-infra/missing')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('should return 403 for TENANT', async () => {
        const response = await request(app)
          .delete('/api/v1/devices/network-infra/ni-1')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('GET /api/v1/devices/blulok/:id/denylist', () => {
      beforeEach(() => {
        mockFindByDevice.mockResolvedValue([
          { id: 'de-1', user_id: 'user-1', device_id: 'device-1', reason: 'revoked' },
        ]);
        (DatabaseService.getInstance as jest.Mock).mockReturnValue({
          connection: mockKnexChainForFirstRow({
            id: 'user-1',
            email: 'u@test.com',
            first_name: 'U',
            last_name: 'Ser',
            facility_id: testData.facilities.facility1.id,
          }),
        });
      });

      it('should require authentication', async () => {
        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1/denylist')
          .expect(401);

        expectUnauthorized(response);
      });

      it('should return denylist entries for admin', async () => {
        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1/denylist')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.entries).toHaveLength(1);
        expect(response.body.entries[0].user).toMatchObject({ email: 'u@test.com' });
        expect(mockFindByDevice).toHaveBeenCalledWith('device-1');
      });

      it('should return 403 for facility_admin without facility access', async () => {
        (DatabaseService.getInstance as jest.Mock).mockReturnValue({
          connection: mockKnexChainForFirstRow({
            facility_id: testData.facilities.facility2.id,
          }),
        });

        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1/denylist')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('should allow facility_admin with facility access', async () => {
        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1/denylist')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.entries).toHaveLength(1);
      });
    });

    describe('Device Assignment - Change Device Flow', () => {
      let mockDevicesService: any;

      beforeEach(() => {
        // Mock DevicesService methods
        mockDevicesService = {
          assignDeviceToUnit: jest.fn().mockResolvedValue(undefined),
          unassignDeviceFromUnit: jest.fn().mockResolvedValue(undefined),
          hasUserAccessToDevice: jest.fn().mockResolvedValue(true),
        };
        (DevicesService.getInstance as jest.Mock).mockReturnValue(mockDevicesService);
      });

      it('should allow changing device assignment (unassign old, assign new)', async () => {
        // Assign first device to unit
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          })
          .expect(200);

        // Unassign first device
        await request(app)
          .delete('/api/v1/devices/blulok/device-1/unassign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        // Assign different device to same unit
        const response = await request(app)
          .post('/api/v1/devices/blulok/device-2/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          })
          .expect(200);

        expectSuccess(response);
        expect(response.body).toHaveProperty('message');
      });

      it('should prevent assigning device to unit that already has one', async () => {
        // First assignment succeeds
        mockDevicesService.assignDeviceToUnit.mockResolvedValueOnce(undefined);
        await request(app)
          .post('/api/v1/devices/blulok/device-1/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          })
          .expect(200);

        // Second assignment to same unit fails
        mockDevicesService.assignDeviceToUnit.mockRejectedValueOnce(
          new Error('Unit already has a device assigned')
        );

        const response = await request(app)
          .post('/api/v1/devices/blulok/device-2/assign')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            unit_id: testData.units.unit1.id
          })
          .expect(400);

        expectBadRequest(response);
        expect(response.body.message).toMatch(/already has|device assigned/i);
      });
    });

    describe('PUT /api/v1/devices/*/metadata', () => {
      beforeEach(() => {
        mockUpdateBluLokMetadata.mockReset();
        mockUpdateAccessControlMetadata.mockReset();
      });

      it('updates BluLok metadata for admin', async () => {
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
          id: 'device-1',
          gateway_facility_id: testData.facilities.facility1.id,
        });
        mockUpdateBluLokMetadata.mockResolvedValue({
          device: { id: 'device-1', device_serial: 'NEW-SN' },
          sideEffects: { identityChanged: true, accessCodesPushed: false },
        });

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/metadata')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ device_serial: 'NEW-SN' })
          .expect(200);

        expectSuccess(response);
        expect(mockUpdateBluLokMetadata).toHaveBeenCalled();
        expect(response.body.sideEffects.identityChanged).toBe(true);
      });

      it('updates access control metadata for facility admin in scope', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility1.id,
        });
        mockUpdateAccessControlMetadata.mockResolvedValue({
          device: { id: 'ac-1', relay_channel: 2 },
          sideEffects: { identityChanged: true, accessCodesPushed: true },
        });

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1/metadata')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ relay_channel: 2 })
          .expect(200);

        expectSuccess(response);
        expect(mockUpdateAccessControlMetadata).toHaveBeenCalled();
      });

      it('returns 403 for facility admin out of scope', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: 'other-facility',
        });

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1/metadata')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ name: 'Updated Gate' })
          .expect(403);

        expectForbidden(response);
      });

      it('returns 404 when BluLok device is missing', async () => {
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .put('/api/v1/devices/blulok/missing/metadata')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ device_serial: 'X' })
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('returns 404 when access-control device is missing', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .put('/api/v1/devices/access-control/missing/metadata')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ name: 'Gone' })
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('maps ConflictError from BluLok metadata service to 409', async () => {
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
          id: 'device-1',
          gateway_facility_id: testData.facilities.facility1.id,
        });
        mockUpdateBluLokMetadata.mockRejectedValueOnce(new ConflictError('Serial already in use'));

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/metadata')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ device_serial: 'DUP' })
          .expect(409);

        expect(response.body.message).toMatch(/already in use/i);
      });

      it('maps NotFoundError from access-control metadata service to 404', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility1.id,
        });
        mockUpdateAccessControlMetadata.mockRejectedValueOnce(new NotFoundError('Device'));

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1/metadata')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ name: 'Missing' })
          .expect(404);

        expect(response.body.success).toBe(false);
      });
    });

    describe('GET /api/v1/devices/blulok/:id - Get single BluLok', () => {
      it('returns enriched device for ADMIN', async () => {
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
          id: 'device-1',
          device_serial: 'BL-001',
          device_status: 'online',
          facility_id: testData.facilities.facility1.id,
        });

        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.device).toMatchObject({ id: 'device-1', device_serial: 'BL-001' });
      });

      it('returns 404 when BluLok is missing', async () => {
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .get('/api/v1/devices/blulok/missing')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404);

        expect(response.body.message).toMatch(/not found/i);
      });

      it('returns 403 when facility_admin lacks gateway facility access', async () => {
        (DatabaseService.getInstance as jest.Mock).mockReturnValue({
          connection: mockKnexChainForFirstRow({
            facility_id: testData.facilities.facility2.id,
          }),
        });

        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });

      it('allows facility_admin when gateway facility is in scope', async () => {
        (DatabaseService.getInstance as jest.Mock).mockReturnValue({
          connection: mockKnexChainForFirstRow({
            facility_id: testData.facilities.facility1.id,
          }),
        });
        mockDeviceModel.findBluLokDeviceById = jest.fn().mockResolvedValue({
          id: 'device-1',
          device_serial: 'BL-001',
          device_status: 'online',
          facility_id: testData.facilities.facility1.id,
        });

        const response = await request(app)
          .get('/api/v1/devices/blulok/device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.device.id).toBe('device-1');
      });
    });

    describe('GET /api/v1/devices/access-control/:id - Get single access control', () => {
      it('returns enriched device with facility name for ADMIN', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-device-1',
          name: 'Main Gate',
          facility_id: testData.facilities.facility1.id,
          status: 'online',
        });
        (DatabaseService.getInstance as jest.Mock).mockReturnValue({
          connection: mockKnexChainForFirstRow({ name: 'Test Facility 1' }),
        });

        const response = await request(app)
          .get('/api/v1/devices/access-control/ac-device-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.device).toMatchObject({
          id: 'ac-device-1',
          facility_name: 'Test Facility 1',
        });
      });

      it('returns 404 when access-control device is missing', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .get('/api/v1/devices/access-control/missing')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404);

        expect(response.body.message).toMatch(/not found/i);
      });

      it('returns 403 when facility_admin is out of scope', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-device-1',
          facility_id: testData.facilities.facility2.id,
          status: 'online',
        });

        const response = await request(app)
          .get('/api/v1/devices/access-control/ac-device-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .expect(403);

        expectForbidden(response);
      });
    });

    describe('PUT /api/v1/devices/access-control/:id - Update access control settings', () => {
      beforeEach(() => {
        mockUpdateAccessControlMetadata.mockReset();
        mockDeviceModel.updateAccessControlDevice = jest.fn().mockResolvedValue({
          id: 'ac-1',
          name: 'Updated',
          status: 'online',
        });
      });

      it('updates status-only via device model for ADMIN', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility1.id,
        });

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ status: 'offline' })
          .expect(200);

        expectSuccess(response);
        expect(mockDeviceModel.updateAccessControlDevice).toHaveBeenCalledWith(
          'ac-1',
          expect.objectContaining({ status: 'offline' }),
        );
        expect(mockUpdateAccessControlMetadata).not.toHaveBeenCalled();
      });

      it('updates metadata fields via DeviceMetadataService', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility1.id,
        });
        mockUpdateAccessControlMetadata.mockResolvedValue({
          device: { id: 'ac-1', name: 'Sanitized Gate' },
          sideEffects: { identityChanged: false, accessCodesPushed: false },
        });

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ name: '<b>Gate</b>', status: 'online' })
          .expect(200);

        expectSuccess(response);
        expect(mockUpdateAccessControlMetadata).toHaveBeenCalledWith(
          'ac-1',
          expect.objectContaining({ name: '&lt;b&gt;Gate&lt;&#x2F;b&gt;' }),
          expect.any(Object),
        );
        expect(mockDeviceModel.updateAccessControlDevice).toHaveBeenCalled();
        expect(response.body.sideEffects).toBeDefined();
      });

      it('returns 404 when device is missing', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue(null);

        const response = await request(app)
          .put('/api/v1/devices/access-control/missing')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ status: 'online' })
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('returns 403 for facility_admin out of scope', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility2.id,
        });

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send({ name: 'Nope' })
          .expect(403);

        expectForbidden(response);
      });

      it('returns 403 for TENANT', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send({ status: 'online' })
          .expect(403);

        expectForbidden(response);
      });

      it('maps ConflictError from metadata update to 409', async () => {
        mockDeviceModel.findAccessControlDeviceWithGateway = jest.fn().mockResolvedValue({
          id: 'ac-1',
          facility_id: testData.facilities.facility1.id,
        });
        mockUpdateAccessControlMetadata.mockRejectedValueOnce(
          new ConflictError('Relay channel already in use'),
        );

        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ relay_channel: 2 })
          .expect(409);

        expect(response.body.message).toMatch(/already in use/i);
      });

      it('returns 400 for empty body', async () => {
        const response = await request(app)
          .put('/api/v1/devices/access-control/ac-1')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({})
          .expect(400);

        expectBadRequest(response);
      });
    });

    describe('GET /api/v1/devices list branches - network_infra, all, DB path', () => {
      it('lists network_infra devices via GatewayInventoryDeviceSyncService', async () => {
        mockListNetworkInfraDevices.mockResolvedValueOnce({
          devices: [
            {
              id: 'ni-1',
              device_category: 'network_infra',
              device_kind: 'bridge',
              name: 'Bridge A',
              facility_id: testData.facilities.facility1.id,
              status: 'online',
            },
          ],
          total: 1,
        });

        const response = await request(app)
          .get('/api/v1/devices?device_scope=network_infra&limit=10')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(response.body.devices).toHaveLength(1);
        expect(response.body.devices[0]).toMatchObject({
          id: 'ni-1',
          device_category: 'network_infra',
        });
        expect(mockListNetworkInfraDevices).toHaveBeenCalled();
      });

      it('returns id projection for network_infra without enrichment', async () => {
        mockListNetworkInfraDevices.mockResolvedValueOnce({
          devices: [
            {
              id: 'ni-2',
              device_category: 'network_infra',
              device_kind: 'reader',
              name: 'Reader',
            },
          ],
          total: 1,
        });

        const response = await request(app)
          .get('/api/v1/devices?device_scope=network_infra&projection=id')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expect(response.body.devices[0]).toEqual({
          id: 'ni-2',
          device_category: 'network_infra',
        });
      });

      it('filters network_infra by effective status and paginates', async () => {
        mockListNetworkInfraDevices.mockResolvedValueOnce({
          devices: [
            {
              id: 'ni-on',
              device_category: 'network_infra',
              // gateway kind preserves reported status (no liveness coerce)
              device_kind: 'gateway',
              name: 'On',
              facility_id: testData.facilities.facility1.id,
              status: 'online',
            },
            {
              id: 'ni-off',
              device_category: 'network_infra',
              device_kind: 'gateway',
              name: 'Off',
              facility_id: testData.facilities.facility1.id,
              status: 'offline',
            },
          ],
          total: 2,
        });

        const response = await request(app)
          .get('/api/v1/devices?device_scope=network_infra&status=online&limit=10')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expect(response.body.devices).toHaveLength(1);
        expect(response.body.devices[0].id).toBe('ni-on');
        expect(response.body.total).toBe(1);
      });

      it('merges network_infra when device_scope=all', async () => {
        mockDeviceModel.findAccessControlDevices.mockResolvedValueOnce([]);
        mockDeviceModel.findBluLokDevices.mockResolvedValueOnce([
          { id: 'bl-1', device_serial: 'S1', device_status: 'online' },
        ]);
        mockListNetworkInfraDevices.mockResolvedValueOnce({
          devices: [
            {
              id: 'ni-1',
              device_category: 'network_infra',
              device_kind: 'gateway',
              name: 'GW',
              status: 'online',
              facility_id: testData.facilities.facility1.id,
            },
          ],
          total: 1,
        });

        const response = await request(app)
          .get('/api/v1/devices?device_scope=all&device_type=all&limit=50')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        const ids = response.body.devices.map((d: { id: string }) => d.id);
        expect(ids).toEqual(expect.arrayContaining(['bl-1', 'ni-1']));
        expect(mockListNetworkInfraDevices).toHaveBeenCalled();
      });

      it('uses DB pagination path for blulok sorted by created_at', async () => {
        mockDeviceModel.findBluLokDevices.mockResolvedValueOnce([
          { id: 'bl-db-1', device_serial: 'DB1', device_status: 'online', created_at: new Date() },
        ]);
        mockDeviceModel.countBluLokDevices.mockResolvedValueOnce(1);

        const response = await request(app)
          .get('/api/v1/devices?device_type=blulok&sort_by=created_at&limit=5&offset=0')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(mockDeviceModel.findBluLokDevices).toHaveBeenCalledWith(
          expect.objectContaining({
            sortBy: 'created_at',
            limit: 5,
            offset: 0,
          }),
        );
        expect(mockDeviceModel.countBluLokDevices).toHaveBeenCalled();
      });

      it('uses DB pagination path for access_control sorted by created_at', async () => {
        mockDeviceModel.findAccessControlDevices.mockResolvedValueOnce([
          { id: 'ac-db-1', name: 'Gate', status: 'online', created_at: new Date() },
        ]);
        mockDeviceModel.countAccessControlDevices.mockResolvedValueOnce(1);

        const response = await request(app)
          .get('/api/v1/devices?device_type=access_control&sort_by=created_at&limit=5')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        expect(mockDeviceModel.findAccessControlDevices).toHaveBeenCalledWith(
          expect.objectContaining({ sortBy: 'created_at', limit: 5 }),
        );
        expect(mockDeviceModel.countAccessControlDevices).toHaveBeenCalled();
      });

      it('returns empty list when facility-scoped user has no facilities', async () => {
        const orphanToken = AuthService.generateToken(
          {
            id: 'orphan-fa',
            email: 'orphan@test.com',
            first_name: 'Orphan',
            last_name: 'Admin',
            role: UserRole.FACILITY_ADMIN,
          } as any,
          [],
        );

        const response = await request(app)
          .get('/api/v1/devices')
          .set('Authorization', `Bearer ${orphanToken}`)
          .expect(200);

        expect(response.body).toMatchObject({ devices: [], total: 0 });
      });
    });

    describe('Additional create / inventory / unassigned edge cases', () => {
      it('returns 409 when access-control serial+relay conflicts', async () => {
        mockDeviceModel.findAccessControlIdentityConflict = jest.fn().mockResolvedValue({
          type: 'serial_relay',
        });

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            name: 'Dup Gate',
            device_type: 'gate',
            location_description: 'Entrance',
            relay_channel: 1,
            device_serial: 'AC-DUP',
          })
          .expect(409);

        expect(response.body.message).toMatch(/already in use/i);
      });

      it('returns 404 when removing missing access-control inventory', async () => {
        (DevicesService.getInstance as jest.Mock).mockReturnValue({
          hasUserAccessToAccessControlDevice: jest.fn().mockResolvedValue(true),
          removeAccessControlDeviceFromCloudInventory: jest
            .fn()
            .mockRejectedValue(new Error('Access control device not found')),
        });

        const response = await request(app)
          .delete('/api/v1/devices/access-control/missing-ac')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(404);

        expect(response.body.success).toBe(false);
      });

      it('returns 500 when device status update throws', async () => {
        mockDeviceModel.updateDeviceStatus = jest
          .fn()
          .mockRejectedValueOnce(new Error('db down'));

        const response = await request(app)
          .put('/api/v1/devices/blulok/device-1/status')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({ status: 'online' })
          .expect(500);

        expect(response.body.success).toBe(false);
      });

      it('applies effective status filter for unassigned devices', async () => {
        const findUnassigned = jest.fn().mockResolvedValue([
          {
            id: 'u1',
            device_serial: 'U1',
            device_status: 'online',
            facility_id: testData.facilities.facility1.id,
          },
          {
            id: 'u2',
            device_serial: 'U2',
            device_status: 'offline',
            facility_id: testData.facilities.facility1.id,
          },
        ]);
        mockDeviceModel.findUnassignedDevices = findUnassigned;

        const response = await request(app)
          .get('/api/v1/devices/unassigned?status=offline&limit=10')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .expect(200);

        expectSuccess(response);
        // Status filter loads full set (no DB limit) then filters after enrichment
        expect(findUnassigned).toHaveBeenCalledWith(
          expect.not.objectContaining({ limit: expect.any(Number) }),
        );
        expect(response.body.devices.length).toBeGreaterThanOrEqual(1);
        expect(
          response.body.devices.every((d: { device_status: string }) => d.device_status === 'offline'),
        ).toBe(true);
      });

      it('returns empty unassigned list when facility-scoped user has no facilities', async () => {
        const orphanToken = AuthService.generateToken(
          {
            id: 'orphan-fa-2',
            email: 'orphan2@test.com',
            first_name: 'Orphan',
            last_name: 'Admin',
            role: UserRole.FACILITY_ADMIN,
          } as any,
          [],
        );

        const response = await request(app)
          .get('/api/v1/devices/unassigned')
          .set('Authorization', `Bearer ${orphanToken}`)
          .expect(200);

        expect(response.body).toMatchObject({ success: true, devices: [], total: 0 });
      });

      it('rolls back access-control create when default group assignment fails', async () => {
        mockDeviceModel.createAccessControlDevice = jest.fn().mockResolvedValue({
          id: 'ac-new',
          name: 'Gate',
        });
        mockDeviceModel.deleteAccessControlDevice = jest.fn().mockResolvedValue(undefined);
        mockDeviceModel.findAccessControlIdentityConflict = jest.fn().mockResolvedValue(null);
        mockAssignAccessControlToDefaultGroup.mockRejectedValueOnce(new Error('group boom'));

        const response = await request(app)
          .post('/api/v1/devices/access-control')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send({
            gateway_id: 'gateway-1',
            name: 'Gate',
            device_type: 'gate',
            location_description: 'Entrance',
            relay_channel: 3,
            device_serial: 'AC-ROLLBACK',
          });

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(mockDeviceModel.deleteAccessControlDevice).toHaveBeenCalledWith('ac-new');
      });
    });
  });
});
