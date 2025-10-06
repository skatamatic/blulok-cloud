import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden, expectNotFound, expectBadRequest } from '@/__tests__/utils/mock-test-helpers';

describe('User-Facilities Routes', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all routes', async () => {
      const routes = [
        { method: 'get', path: '/api/v1/user-facilities/user-1' },
        { method: 'put', path: '/api/v1/user-facilities/user-1' },
        { method: 'post', path: '/api/v1/user-facilities/user-1/facilities/facility-1' },
        { method: 'delete', path: '/api/v1/user-facilities/user-1/facilities/facility-1' }
      ];

      for (const route of routes) {
        let response;
        if (route.method === 'get') {
          response = await request(app).get(route.path);
        } else if (route.method === 'post') {
          response = await request(app).post(route.path);
        } else if (route.method === 'put') {
          response = await request(app).put(route.path);
        } else if (route.method === 'delete') {
          response = await request(app).delete(route.path);
        }
        expectUnauthorized(response);
      }
    });
  });

  describe('GET /api/v1/user-facilities/:userId - Get User Facilities', () => {
    it('should allow ADMIN to get any user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityIds).toBeDefined();
    });

    it('should allow DEV_ADMIN to get any user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityIds).toBeDefined();
    });

    it('should allow FACILITY_ADMIN to get user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityIds).toBeDefined();
    });

    it('should prevent TENANT from getting user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from getting user facilities', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

      expectForbidden(response);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/non-existent')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectNotFound(response);
      expect(response.body.message).toBe('User not found');
    });

    it('should return empty array for global admin users', async () => {
      const response = await request(app)
        .get('/api/v1/user-facilities/admin-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityIds).toEqual([]);
      expect(response.body.note).toContain('global access');
    });
  });

  describe('PUT /api/v1/user-facilities/:userId - Set User Facilities', () => {
    const validData = {
      facilityIds: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002']
    };

    it('should allow ADMIN to set user facilities', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('updated successfully');
    });

    it('should allow DEV_ADMIN to set user facilities', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow FACILITY_ADMIN to set facilities they manage', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ facilityIds: ['facility-1'] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent FACILITY_ADMIN from setting facilities they dont manage', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ facilityIds: ['550e8400-e29b-41d4-a716-446655440002'] });

      expectForbidden(response);
      expect(response.body.message).toContain('You can only assign users to facilities you manage');
    });

    it('should prevent TENANT from setting user facilities', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validData);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from setting user facilities', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validData);

      expectForbidden(response);
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/tenant-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ facilityIds: 'invalid' });

      expectBadRequest(response);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/non-existent')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validData);

      expectNotFound(response);
      expect(response.body.message).toBe('User not found');
    });

    it('should prevent setting facilities for global admin', async () => {
      const response = await request(app)
        .put('/api/v1/user-facilities/admin-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validData);

      expectBadRequest(response);
      expect(response.body.message).toContain('Global administrators do not require facility associations');
    });
  });

  describe('POST /api/v1/user-facilities/:userId/facilities/:facilityId - Add Facility', () => {
    it('should allow ADMIN to add facility to user', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('added to facility successfully');
    });

    it('should allow DEV_ADMIN to add facility to user', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow FACILITY_ADMIN to add facility they manage', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/other-tenant-1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent FACILITY_ADMIN from adding facility they dont manage', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectForbidden(response);
    });

    it('should prevent TENANT from adding facilities', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from adding facilities', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

      expectForbidden(response);
    });

    it('should return 400 if association already exists', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectBadRequest(response);
      expect(response.body.message).toContain('already has access');
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/user-facilities/non-existent/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectNotFound(response);
      expect(response.body.message).toBe('User not found');
    });
  });

  describe('DELETE /api/v1/user-facilities/:userId/facilities/:facilityId - Remove Facility', () => {
    it('should allow ADMIN to remove facility from user', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('removed from facility successfully');
    });

    it('should allow DEV_ADMIN to remove facility from user', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should allow FACILITY_ADMIN to remove facility they manage', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should prevent FACILITY_ADMIN from removing facility they dont manage', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440002')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

      expectForbidden(response);
    });

    it('should prevent TENANT from removing facilities', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from removing facilities', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/550e8400-e29b-41d4-a716-446655440001')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

      expectForbidden(response);
    });

    it('should return 404 for non-existent association', async () => {
      const response = await request(app)
        .delete('/api/v1/user-facilities/tenant-1/facilities/non-existent')
        .set('Authorization', `Bearer ${testData.users.admin.token}`);

      expectNotFound(response);
      expect(response.body.message).toBe('Association not found');
    });
  });
});
