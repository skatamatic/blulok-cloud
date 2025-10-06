import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

describe('Key Sharing Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all key sharing endpoints', async () => {
      // Test GET /api/v1/key-sharing
      let response = await request(app).get('/api/v1/key-sharing');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/key-sharing/user/user-1
      response = await request(app).get('/api/v1/key-sharing/user/user-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/key-sharing/unit/unit-1
      response = await request(app).get('/api/v1/key-sharing/unit/unit-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test POST /api/v1/key-sharing
      response = await request(app).post('/api/v1/key-sharing');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test PUT /api/v1/key-sharing/sharing-1
      response = await request(app).put('/api/v1/key-sharing/sharing-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test DELETE /api/v1/key-sharing/sharing-1
      response = await request(app).delete('/api/v1/key-sharing/sharing-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/key-sharing/admin/expired
      response = await request(app).get('/api/v1/key-sharing/admin/expired');
      expect(response.status).toBe(401);
      expectUnauthorized(response);
    });
  });

  describe('GET /api/v1/key-sharing - List Key Sharing Records', () => {
    it('should return all key sharing records for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
      expect(response.body).toHaveProperty('total');
    });

    it('should return all key sharing records for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered records for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered records for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
      expect(response.body).toHaveProperty('total');
    });

    it('should filter by unit_id', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing?unit_id=unit-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });

    it('should filter by access_level', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing?access_level=full')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });

    it('should filter by is_active', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing?is_active=true')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle sorting', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing?sort_by=shared_at&sort_order=asc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });
  });

  describe('GET /api/v1/key-sharing/user/:userId - Get User Key Sharing Records', () => {
    it('should return user key sharing records for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/tenant-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('owned_keys');
      expect(response.body).toHaveProperty('shared_keys');
    });

    it('should return user key sharing records for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('owned_keys');
      expect(response.body).toHaveProperty('shared_keys');
    });

    it('should return 403 for TENANT accessing other user records', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/other-tenant-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/user/non-existent-user')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });
  });

  describe('GET /api/v1/key-sharing/unit/:unitId - Get Unit Key Sharing Records', () => {
    it('should return unit key sharing records for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/unit-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });

    it('should return unit key sharing records for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/unit-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('sharings');
    });

    it('should return 403 for TENANT accessing unit they don\'t have access to', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/unit-2')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/unit/non-existent-unit')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });
  });

  describe('POST /api/v1/key-sharing - Create Key Sharing Record', () => {
    const validSharingData = {
      unit_id: 'unit-3',
      shared_with_user_id: 'tenant-2',
      access_level: 'full',
      expires_at: '2024-12-31T23:59:59Z',
      notes: 'Test key sharing'
    };

    it('should create key sharing record for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validSharingData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should create key sharing record for ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validSharingData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should create key sharing record for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validSharingData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validSharingData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validSharingData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          unit_id: 'unit-1'
          // Missing other required fields
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid access_level', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validSharingData,
          access_level: 'invalid-level'
        })
        .expect(400);

      expectBadRequest(response);
    });

    it('should return 400 for invalid expires_at format', async () => {
      const response = await request(app)
        .post('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({
          ...validSharingData,
          expires_at: 'invalid-date'
        })
        .expect(400);

      expectBadRequest(response);
    });
  });

  describe('PUT /api/v1/key-sharing/:id - Update Key Sharing Record', () => {
    const updateData = {
      access_level: 'limited',
      expires_at: '2024-12-31T23:59:59Z',
      notes: 'Updated notes'
    };

    it('should update key sharing record for DEV_ADMIN', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should update key sharing record for ADMIN', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should return 404 for non-existent sharing record', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(404);

      expectNotFound(response);
    });

    it('should allow TENANT to update their own sharing records', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('id');
    });

    it('should return 403 for TENANT trying to update others sharing records', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-2')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .put('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('DELETE /api/v1/key-sharing/:id - Delete Key Sharing Record', () => {
    it('should delete key sharing record for DEV_ADMIN', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should delete key sharing record for ADMIN', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent sharing record', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should allow TENANT to delete their own sharing records', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 403 for TENANT trying to delete others sharing records', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-2')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .delete('/api/v1/key-sharing/sharing-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('GET /api/v1/key-sharing/admin/expired - Get Expired Key Sharing Records', () => {
    it('should return expired records for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('expired_sharings');
    });

    it('should return expired records for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('expired_sharings');
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing/admin/expired')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure tenants only see their own key sharing records', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned records should be related to the tenant
      const records = response.body.sharings;
      for (const record of records) {
        expect(record.primary_tenant_id === testData.users.tenant.id || 
               record.shared_with_user_id === testData.users.tenant.id).toBe(true);
      }
    });

    it('should ensure facility admins only see records for their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/key-sharing')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned records should be for facilities the admin has access to
      const records = response.body.sharings;
      for (const record of records) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(record.unit.facility_id);
      }
    });
  });
});