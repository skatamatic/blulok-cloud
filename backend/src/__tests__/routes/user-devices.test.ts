import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectForbidden, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';
import { DatabaseService } from '@/services/database.service';
import { UserDeviceModel } from '@/models/user-device.model';
import { SystemSettingsModel } from '@/models/system-settings.model';

// Mock services and models
jest.mock('@/services/database.service');
jest.mock('@/models/user-device.model');
jest.mock('@/models/system-settings.model');

describe('User Devices Routes', () => {
  let app: any;
  let testData: MockTestData;
  let mockDb: any;
  let mockUserDeviceModel: jest.Mocked<UserDeviceModel>;
  let mockSystemSettingsModel: jest.Mocked<SystemSettingsModel>;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();

    // Mock database - needs to be a function that returns a query builder
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      count: jest.fn().mockReturnThis(),
      first: jest.fn().mockResolvedValue({ key: 'security.max_devices_per_user', value: '2' }), // Default for system_settings
      insert: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
    };

    mockDb = jest.fn((tableName: string) => {
      // Return appropriate mock based on table name
      if (tableName === 'system_settings') {
        return {
          where: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue({ key: 'security.max_devices_per_user', value: '2' }),
        };
      }
      // For user_devices table, return the default query builder
      return mockQueryBuilder;
    });
    // Add query builder methods directly to mockDb for backwards compatibility
    mockDb.where = mockQueryBuilder.where;
    mockDb.whereIn = mockQueryBuilder.whereIn;
    mockDb.count = mockQueryBuilder.count;
    mockDb.first = mockQueryBuilder.first;
    mockDb.insert = mockQueryBuilder.insert;
    mockDb.returning = mockQueryBuilder.returning;
    mockDb.update = mockQueryBuilder.update;

    (DatabaseService.getInstance as jest.Mock).mockReturnValue({
      connection: mockDb
    });

    // legacy key distribution removed; no mocks required

    // Mock UserDeviceModel
    mockUserDeviceModel = {
      findByUserAndAppDeviceId: jest.fn(),
      listByUser: jest.fn(),
      countActiveByUser: jest.fn(),
      create: jest.fn(),
      upsertByUserAndAppDeviceId: jest.fn(),
      revoke: jest.fn(),
    } as any;

    (UserDeviceModel as jest.MockedClass<typeof UserDeviceModel>).mockImplementation(() => mockUserDeviceModel);

    // Mock SystemSettingsModel
    mockSystemSettingsModel = {
      get: jest.fn(),
      set: jest.fn(),
    } as any;

    mockSystemSettingsModel.get.mockResolvedValue('2');
    (SystemSettingsModel as jest.MockedClass<typeof SystemSettingsModel>).mockImplementation(() => mockSystemSettingsModel);
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all user device endpoints', async () => {
      // Test GET /me
      let response = await request(app).get('/api/v1/user-devices/me');
      expect(response.status).toBe(401);

      // Test POST /register-key
      response = await request(app).post('/api/v1/user-devices/register-key').send({});
      expect(response.status).toBe(401);

      // Test DELETE /me/:id
      response = await request(app).delete(`/api/v1/user-devices/me/${testData.users.tenant.id}`);
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/user-devices/me', () => {
    it('should return user devices for authenticated user', async () => {
      const mockDevices: any[] = [
        {
          id: 'device-1',
          user_id: testData.users.tenant.id,
          app_device_id: 'app-device-123',
          platform: 'ios',
          device_name: 'iPhone 12',
          status: 'active',
          last_used_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockUserDeviceModel.listByUser.mockResolvedValue(mockDevices);

      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('devices');
      expect(Array.isArray(response.body.devices)).toBe(true);
      expect(mockUserDeviceModel.listByUser).toHaveBeenCalledWith(testData.users.tenant.id);
    });

    it('should allow all authenticated users to access their devices', async () => {
      // All user types should be able to access their own devices
      const mockDevices: any[] = [];
      mockUserDeviceModel.listByUser.mockResolvedValue(mockDevices);

      // Admin
      let response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);
      expectSuccess(response);

      // Facility Admin
      response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);
      expectSuccess(response);

      // Maintenance
      response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);
      expectSuccess(response);
    });
  });

  describe('POST /api/v1/user-devices/register-key', () => {
    const validRequest = {
      app_device_id: 'test-device-123',
      platform: 'ios',
      device_name: 'iPhone 12',
      public_key: 'SGVsbG8gV29ybGQ=', // base64 encoded "Hello World"
    };

    it('should register device key successfully', async () => {
      // Mock settings - under cap
      mockSystemSettingsModel.get.mockResolvedValue('2'); // max devices = 2

      // Mock device creation
      const mockDevice: any = {
        id: 'new-device-id',
        user_id: testData.users.tenant.id,
        app_device_id: 'test-device-123',
        platform: 'ios',
        device_name: 'iPhone 12',
        public_key: 'SGVsbG8gV29ybGQ=',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockUserDeviceModel.countActiveByUser.mockResolvedValue(1);
      mockUserDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(undefined);
      mockUserDeviceModel.upsertByUserAndAppDeviceId.mockResolvedValue(mockDevice);

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validRequest)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('device');
      expect(mockUserDeviceModel.countActiveByUser).toHaveBeenCalledWith(testData.users.tenant.id);
      expect(mockUserDeviceModel.upsertByUserAndAppDeviceId).toHaveBeenCalled();
    });

    it('should enforce device cap and return 409 when exceeded', async () => {
      // Mock settings - at cap
      mockSystemSettingsModel.get.mockResolvedValue('2'); // max devices = 2

      // Mock existing devices for response
      const mockDevices: any[] = [
        { id: 'device-1', app_device_id: 'old-device-1', platform: 'ios', device_name: 'iPhone 12', status: 'active', user_id: testData.users.tenant.id, created_at: new Date(), updated_at: new Date() },
        { id: 'device-2', app_device_id: 'old-device-2', platform: 'android', device_name: 'Pixel 6', status: 'active', user_id: testData.users.tenant.id, created_at: new Date(), updated_at: new Date() },
      ];

      mockUserDeviceModel.countActiveByUser.mockResolvedValue(2);
      mockUserDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(undefined);
      mockUserDeviceModel.listByUser.mockResolvedValue(mockDevices);

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validRequest)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Device limit reached');
      expect(response.body).toHaveProperty('devices');
      expect(response.body.maxDevices).toBe(2);
      expect(mockUserDeviceModel.listByUser).toHaveBeenCalledWith(testData.users.tenant.id);
    });

    it('should treat 0 max devices as unlimited (no cap enforced)', async () => {
      mockSystemSettingsModel.get.mockResolvedValue('0');

      const mockDevice: any = {
        id: 'new-device-id',
        user_id: testData.users.tenant.id,
        app_device_id: 'test-device-123',
        platform: 'ios',
        device_name: 'iPhone 12',
        public_key: 'SGVsbG8gV29ybGQ=',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockUserDeviceModel.countActiveByUser.mockResolvedValue(25);
      mockUserDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(undefined);
      mockUserDeviceModel.upsertByUserAndAppDeviceId.mockResolvedValue(mockDevice);

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validRequest)
        .expect(200);

      expectSuccess(response);
      expect(mockUserDeviceModel.upsertByUserAndAppDeviceId).toHaveBeenCalled();
      expect(mockUserDeviceModel.listByUser).not.toHaveBeenCalled();
    });

    it('should validate public key format', async () => {
      const invalidRequest = { ...validRequest, public_key: 'invalid-base64!' };

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(invalidRequest)
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate platform enum', async () => {
      const invalidRequest = { ...validRequest, platform: 'invalid-platform' };

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(invalidRequest)
        .expect(400);

      expectBadRequest(response);
    });

    it('should validate app_device_id length', async () => {
      const invalidRequest = { ...validRequest, app_device_id: 'a'.repeat(200) }; // too long

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(invalidRequest)
        .expect(400);

      expectBadRequest(response);
    });

    it('should require all mandatory fields', async () => {
      const invalidRequest = { platform: 'ios', device_name: 'Test' }; // missing required fields

      const response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(invalidRequest)
        .expect(400);

      expectBadRequest(response);
    });

    it('should allow all authenticated users to register device keys', async () => {
      // Mock settings
      mockSystemSettingsModel.get.mockResolvedValue('5');
      mockUserDeviceModel.countActiveByUser.mockResolvedValue(0);
      mockUserDeviceModel.findByUserAndAppDeviceId.mockResolvedValue(undefined);
      mockUserDeviceModel.upsertByUserAndAppDeviceId.mockResolvedValue({
        id: 'new-device-id',
        user_id: 'test-user',
        app_device_id: 'test-device-123',
        platform: 'ios',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      } as any);

      // Admin can register
      let response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validRequest)
        .expect(200);
      expectSuccess(response);

      // Facility Admin can register
      response = await request(app)
        .post('/api/v1/user-devices/register-key')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validRequest)
        .expect(200);
      expectSuccess(response);
    });
  });

  describe('POST /api/v1/user-devices/me/rotate-key', () => {
    it('should rotate key for current device (happy path)', async () => {
      // Mock existing device for user
      (mockUserDeviceModel.findByUserAndAppDeviceId as jest.Mock).mockResolvedValue({ id: 'device-1', user_id: testData.users.tenant.id });
      (mockUserDeviceModel.upsertByUserAndAppDeviceId as jest.Mock).mockResolvedValue({ id: 'device-1' });

      // Mock rotate flow DB queries implicitly via service (we rely on service internals)
      const response = await request(app)
        .post('/api/v1/user-devices/me/rotate-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .set('X-App-Device-Id', 'app-device-123')
        .send({ public_key: 'UHVibGljS2V5QmFzZTY0' })
        .expect(200);

      expectSuccess(response);
      expect(mockUserDeviceModel.findByUserAndAppDeviceId).toHaveBeenCalledWith(testData.users.tenant.id, 'app-device-123');
    });

    it('should return 400 when X-App-Device-Id missing', async () => {
      const response = await request(app)
        .post('/api/v1/user-devices/me/rotate-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ public_key: 'UHVibGljS2V5QmFzZTY0' })
        .expect(400);
      expectBadRequest(response);
    });

    it('should return 400 when public_key invalid/missing', async () => {
      const response = await request(app)
        .post('/api/v1/user-devices/me/rotate-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .set('X-App-Device-Id', 'app-device-123')
        .send({})
        .expect(400);
      expectBadRequest(response);
    });

    it('should return 404 when device not found for user', async () => {
      (mockUserDeviceModel.findByUserAndAppDeviceId as jest.Mock).mockResolvedValue(undefined);
      const response = await request(app)
        .post('/api/v1/user-devices/me/rotate-key')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .set('X-App-Device-Id', 'missing-device')
        .send({ public_key: 'UHVibGljS2V5QmFzZTY0' })
        .expect(404);
      expectNotFound(response);
    });

    it('should allow all authenticated users to rotate keys', async () => {
      (mockUserDeviceModel.findByUserAndAppDeviceId as jest.Mock).mockResolvedValue({ id: 'device-1', user_id: testData.users.admin.id });
      (mockUserDeviceModel.upsertByUserAndAppDeviceId as jest.Mock).mockResolvedValue({ id: 'device-1' });

      const response = await request(app)
        .post('/api/v1/user-devices/me/rotate-key')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .set('X-App-Device-Id', 'app-device-123')
        .send({ public_key: 'UHVibGljS2V5QmFzZTY0' })
        .expect(200);
      expectSuccess(response);
    });
  });

  describe('DELETE /api/v1/user-devices/me/:id', () => {
    it('should revoke user device successfully', async () => {
      // Override mockDb for this test to return the device
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: jest.fn((tableName: string) => {
          if (tableName === 'system_settings') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({ key: 'security.max_devices_per_user', value: '2' }),
            };
          }
          if (tableName === 'user_devices') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({
                id: 'device-1',
                user_id: testData.users.tenant.id,
                app_device_id: 'test-device',
                status: 'active',
              }),
            };
          }
          return mockDb(tableName);
        })
      });

      mockUserDeviceModel.revoke.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/user-devices/me/device-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(mockUserDeviceModel.revoke).toHaveBeenCalledWith('device-1');
    });

    it('should return 404 when device not found', async () => {
      // Override mockDb for this test to return null
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: jest.fn((tableName: string) => {
          if (tableName === 'system_settings') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({ key: 'security.max_devices_per_user', value: '2' }),
            };
          }
          if (tableName === 'user_devices') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue(null),
            };
          }
          return mockDb(tableName);
        })
      });

      const response = await request(app)
        .delete('/api/v1/user-devices/me/device-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 404 when device belongs to different user', async () => {
      // Override mockDb for this test - when WHERE clause filters by user_id, it should return null
      // because the device belongs to a different user
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: jest.fn((tableName: string) => {
          if (tableName === 'system_settings') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({ key: 'security.max_devices_per_user', value: '2' }),
            };
          }
          if (tableName === 'user_devices') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue(null), // Returns null because user_id doesn't match in WHERE clause
            };
          }
          return mockDb(tableName);
        })
      });

      const response = await request(app)
        .delete('/api/v1/user-devices/me/device-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should allow all authenticated users to revoke their devices', async () => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: jest.fn((tableName: string) => {
          if (tableName === 'user_devices') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({
                id: 'device-1',
                user_id: testData.users.admin.id,
                app_device_id: 'test-device',
                status: 'active',
              }),
            };
          }
          return mockDb(tableName);
        })
      });

      mockUserDeviceModel.revoke.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/v1/user-devices/me/device-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });

  describe('DELETE /api/v1/user-devices/admin/:id', () => {
    beforeEach(() => {
      (DatabaseService.getInstance as jest.Mock).mockReturnValue({
        connection: jest.fn((tableName: string) => {
          if (tableName === 'user_devices') {
            return {
              where: jest.fn().mockReturnThis(),
              first: jest.fn().mockResolvedValue({
                id: 'device-admin',
                user_id: testData.users.tenant.id,
              }),
            };
          }
          return mockDb(tableName);
        })
      });
      mockUserDeviceModel.revoke.mockResolvedValue(undefined);
    });

    it('should allow DEV_ADMIN to delete any user device', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-admin')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(mockUserDeviceModel.revoke).toHaveBeenCalledWith('device-admin');
    });

    it('should return 403 for non DEV_ADMIN users', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-admin')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('RBAC and Scope Tests', () => {
    beforeEach(() => {
      mockUserDeviceModel.listByUser.mockResolvedValue([]);
    });

    it('should allow TENANT users to access their own devices', async () => {
      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow ADMIN users to access their own devices', async () => {
      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow FACILITY_ADMIN users to access their own devices', async () => {
      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow MAINTENANCE users to access their own devices', async () => {
      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow DEV_ADMIN users to access their own devices', async () => {
      const response = await request(app)
        .get('/api/v1/user-devices/me')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });
  });
});
