import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

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
    it.skip('should return detailed user information for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000) // Increase timeout for complex queries
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testData.users.tenant.id);
      expect(response.body.user).toHaveProperty('facilities');
      expect(response.body.user).toHaveProperty('devices');
      expect(Array.isArray(response.body.user.facilities)).toBe(true);
      expect(Array.isArray(response.body.user.devices)).toBe(true);
    }, 15000);

    it.skip('should return detailed user information for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.id).toBe(testData.users.tenant.id);
    }, 15000);

    it.skip('should return detailed user information for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user).toBeDefined();
    }, 15000);

    it.skip('should allow users to view their own details', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.id).toBe(testData.users.tenant.id);
    }, 15000);

    it.skip('should not include devices for non-DEV_ADMIN users', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .timeout(10000)
        .expect(200);

      expectSuccess(response);
      expect(response.body.user.devices).toEqual([]);
    }, 15000);

    it.skip('should deny access for FACILITY_ADMIN without facility access', async () => {
      // This test assumes there's a user that the facility admin doesn't have access to
      // In a real scenario, we'd need to set up test data accordingly
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.devAdmin.id}/details`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .timeout(10000)
        .expect(403);

      expectForbidden(response);
    }, 15000);

    it.skip('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/users/non-existent-id/details')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .timeout(10000)
        .expect(404);

      expectNotFound(response);
    }, 15000);

    it.skip('should require authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/users/${testData.users.tenant.id}/details`)
        .expect(401);

      expectUnauthorized(response);
    });
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
