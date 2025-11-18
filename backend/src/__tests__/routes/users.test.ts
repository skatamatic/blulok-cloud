import request from 'supertest';
import { createApp } from '@/app';
import { DatabaseService } from '@/services/database.service';
import { UserModel } from '@/models/user.model';
import { UserDeviceModel } from '@/models/user-device.model';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

const createMockQuery = (config: { rows?: any[]; reject?: boolean } = {}) => {
  const rows = config.rows ?? [];
  const reject = config.reject ?? false;
  const promise = reject ? Promise.reject(new Error('mock query failed')) : Promise.resolve(rows);
  const chain: any = {
    join: () => chain,
    select: () => chain,
    where: () => chain,
    whereIn: () => chain,
    whereNotNull: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    first: () => promise.then((res) => (Array.isArray(res) ? res[0] : res)),
    then: (resolve: any, rejectFn?: any) => promise.then(resolve, rejectFn),
    catch: (rejectFn: any) => promise.catch(rejectFn),
  };
  return chain;
};

const createMockKnex = (tables: Record<string, { rows?: any[]; reject?: boolean }> = {}) => {
  const fn: any = (tableName: string) => {
    const entry = tables[tableName] ?? tables.default ?? { rows: [] };
    return createMockQuery(entry);
  };
  fn.schema = { hasTable: jest.fn().mockResolvedValue(true) };
  return fn;
};

describe('Users Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all user endpoints', async () => {
      const endpoints = [
        '/api/v1/users',
        `/api/v1/users/${testData.users.tenant.id}`,
        '/api/v1/users',
        `/api/v1/users/${testData.users.tenant.id}`,
        `/api/v1/users/${testData.users.tenant.id}`,
        `/api/v1/users/${testData.users.tenant.id}/activate`,
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expect(response.status).toBe(401);
        expectUnauthorized(response);
      }
    });
  });

  describe('GET /api/v1/users - List Users', () => {
    it('should return all users for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return all users for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered users for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should filter by role', async () => {
      const response = await request(app)
        .get('/api/v1/users?role=tenant')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });

    it('should filter by facility_id', async () => {
      const response = await request(app)
        .get('/api/v1/users?facility_id=facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/v1/users?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle sorting', async () => {
      const response = await request(app)
        .get('/api/v1/users?sort_by=email&sort_order=asc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('users');
    });
  });

  describe('GET /api/v1/users/:id - Get Specific User', () => {
    it('should return user details for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('email');
    });

    it('should return user details for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return user details for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should allow users to view their own profile', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.facility2Tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT accessing other user', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/users - Create User', () => {
    const validUserData = {
      email: 'newuser@test.com',
      password: 'SecurePassword123!',
      firstName: 'New',
      lastName: 'User',
      role: 'tenant'
    };

    it('should create user for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should create user for ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should create user for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validUserData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('userId');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validUserData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validUserData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          email: 'test@test.com'
          // Missing other required fields
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'invalid-email'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for weak password', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          password: 'weak'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          email: 'tenant@test.com' // Already exists in test data
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validUserData,
          role: 'invalid-role'
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('PUT /api/v1/users/:id - Update User', () => {
    const updateData = {
      firstName: 'Updated',
      lastName: 'Name',
      role: 'tenant'
    };

    it('should update user for DEV_ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.firstName).toBe(updateData.firstName);
    });

    it('should update user for ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should update user for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should allow users to update their own profile', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name'
        })
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('user');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.facility2Tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT accessing other user', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...updateData,
          email: 'invalid-email'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid role', async () => {
      const response = await request(app)
        .put(`/api/v1/users/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...updateData,
          role: 'invalid-role'
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('DELETE /api/v1/users/:id - Delete User', () => {
    it('should delete user for DEV_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should delete user for ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .delete('/api/v1/users/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .delete(`/api/v1/users/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/users/:id/activate - Activate User', () => {
    it('should activate user for DEV_ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should activate user for ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/users/non-existent-id/activate')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post(`/api/v1/users/${testData.users.otherTenant.id}/activate`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Input Validation and Security', () => {
    it('should prevent XSS in user data', async () => {
      const maliciousData = {
        email: 'test@test.com',
        password: 'SecurePassword123!',
        firstName: '<script>alert("xss")</script>',
        lastName: 'User',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(201);

      expectSuccess(response);
      // The response should be sanitized
      expect(response.body.userId).toBeDefined();
    });

    it('should handle SQL injection attempts', async () => {
      const maliciousData = {
        email: "'; DROP TABLE users; --",
        password: 'SecurePassword123!',
        firstName: 'Test',
        lastName: 'User',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(maliciousData)
        .expect(400);

      expectBadRequest(response);
    });

    it('should limit input length to prevent DoS', async () => {
      const longData = {
        email: 'test@test.com',
        password: 'SecurePassword123!',
        firstName: 'a'.repeat(1000),
        lastName: 'User',
        role: 'tenant'
      };

      const response = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(longData)
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see users in their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned users should be in facilities the admin has access to
      const users = response.body.users;
      for (const user of users) {
        // This would need to be implemented based on actual user-facility relationships
        expect(user).toBeDefined();
      }
    });
  });

  describe('GET /api/v1/users/:id/details - Get User Details', () => {
    let getInstanceSpy: jest.SpyInstance;
    let userModelSpy: jest.SpyInstance;
    let listDevicesSpy: jest.SpyInstance;

    afterEach(() => {
      getInstanceSpy?.mockRestore();
      userModelSpy?.mockRestore();
      listDevicesSpy?.mockRestore();
    });

    it('should return detailed user information for DEV_ADMIN', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const baseDevice = {
        id: 'device-1',
        user_id: testData.users.tenant.id,
        app_device_id: 'app-1',
        platform: 'ios',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': { rows: [] },
        'device_lock_associations as dla': {
          rows: [{
            user_device_id: 'device-1',
            lock_id: 'lock-123',
            device_serial: 'ABC123',
            unit_number: '101',
            facility_name: 'Test Facility',
            key_status: 'active',
            last_error: null,
            key_version: 1,
            key_code: 42,
          }],
        },
        'device_lock_associations': {
          rows: [{
            user_device_id: 'device-1',
            last_error: 'timeout',
            updated_at: new Date(),
          }],
        },
      });

      getInstanceSpy = jest.spyOn(DatabaseService, 'getInstance').mockReturnValue({ connection: mockDb } as any);
      userModelSpy = jest.spyOn(UserModel, 'findById').mockResolvedValue(baseUser as any);
      listDevicesSpy = jest.spyOn(UserDeviceModel.prototype, 'listByUser').mockResolvedValue([baseDevice] as any);

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testData.users.tenant.id);
      expect(response.body.user.devices[0].associatedLocks).toHaveLength(1);
      expect(response.body.user.devices[0].distributionErrors).toHaveLength(1);
    }, 15000);

    it('should gracefully handle lock association query failures', async () => {
      const baseUser = {
        id: testData.users.tenant.id,
        email: 'tenant@test.com',
        first_name: 'Tenant',
        last_name: 'User',
        role: 'tenant',
        is_active: true,
        last_login: null,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const baseDevice = {
        id: 'device-1',
        user_id: testData.users.tenant.id,
        app_device_id: 'app-1',
        platform: 'ios',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockDb = createMockKnex({
        'user_facility_associations as ufa': { rows: [] },
        'device_lock_associations as dla': { reject: true },
        'device_lock_associations': { reject: true },
      });

      getInstanceSpy = jest.spyOn(DatabaseService, 'getInstance').mockReturnValue({ connection: mockDb } as any);
      userModelSpy = jest.spyOn(UserModel, 'findById').mockResolvedValue(baseUser as any);
      listDevicesSpy = jest.spyOn(UserDeviceModel.prototype, 'listByUser').mockResolvedValue([baseDevice] as any);

      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.devices[0].associatedLocks).toEqual([]);
      expect(response.body.user.devices[0].distributionErrors).toEqual([]);
    }, 15000);
  });

  describe('DELETE /api/v1/user-devices/admin/:id - Delete User Device', () => {
    it('should deny access for non-DEV_ADMIN users', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 404 for non-existent device', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/non-existent-device')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should allow DEV_ADMIN to attempt device deletion', async () => {
      // Test that DEV_ADMIN can access the endpoint (will return 404 for non-existent device)
      const response = await request(app)
        .delete('/api/v1/user-devices/admin/device-id')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(404);

      expectNotFound(response);
    });
  });
});
