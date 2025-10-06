import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound } from '@/__tests__/utils/mock-test-helpers';

// All services are mocked in setup-mocks.ts


describe('Units Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    testData = createMockTestData();
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all unit endpoints', async () => {
      // Test GET /api/v1/units
      let response = await request(app).get('/api/v1/units');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/units/my
      response = await request(app).get('/api/v1/units/my');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/units/:id
      response = await request(app).get(`/api/v1/units/${testData.units.unit1.id}`);
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test POST /api/v1/units
      response = await request(app).post('/api/v1/units');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test PUT /api/v1/units/:id
      response = await request(app).put(`/api/v1/units/${testData.units.unit1.id}`);
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test POST /api/v1/units/:id/assign
      response = await request(app).post(`/api/v1/units/${testData.units.unit1.id}/assign`);
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test DELETE /api/v1/units/:id/assign/:tenantId
      response = await request(app).delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`);
      expect(response.status).toBe(401);
      expectUnauthorized(response);
    });
  });

  describe('GET /api/v1/units - List Units', () => {
    it('should return all units for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
    });

    it('should return all units for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered units for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
    });

    it('should return filtered units for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
    });

    it('should filter by facility_id', async () => {
      const response = await request(app)
        .get('/api/v1/units?facility_id=facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/v1/units?status=occupied')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get('/api/v1/units?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle sorting', async () => {
      const response = await request(app)
        .get('/api/v1/units?sort_by=unit_number&sort_order=asc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
    });
  });

  describe('GET /api/v1/units/my - Get My Units', () => {
    it('should return units for tenant with facility access', async () => {
      const response = await request(app)
        .get('/api/v1/units/my')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
    });

    it('should return 403 for non-tenant users', async () => {
      const response = await request(app)
        .get('/api/v1/units/my')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('GET /api/v1/units/:id - Get Specific Unit', () => {
    it('should return unit details for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
      expect(response.body.unit).toHaveProperty('unit_number');
    });

    it('should return unit details for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should return unit details for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should return unit details for TENANT with access', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .get('/api/v1/units/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT without access', async () => {
      const response = await request(app)
        .get(`/api/v1/units/${testData.units.unit2.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/units - Create Unit', () => {
    const getValidUnitData = () => ({
      unit_number: '101',
      facility_id: testData.facilities.facility1.id,
      unit_type: 'storage',
      status: 'available',
      size_sqft: 1000,
      monthly_rate: 1500.00,
      description: 'Test unit'
    });

    it('should create unit for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(getValidUnitData());

      expect(response.status).toBe(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
      expect(response.body.unit.unit_number).toBe(getValidUnitData().unit_number);
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
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should create unit for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(getValidUnitData())
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
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

    it('should return 201 for valid unit data', async () => {
      const response = await request(app)
        .post('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(getValidUnitData())
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit.unit_number).toBe(getValidUnitData().unit_number);
    });
  });

  describe('PUT /api/v1/units/:id - Update Unit', () => {
    const updateData = {
      unit_type: 'storage',
      status: 'occupied',
      monthly_rate: 1200.00,
      description: 'Updated unit description'
    };

    it('should update unit for DEV_ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
      expect(response.body.unit.unit_type).toBe(updateData.unit_type);
    });

    it('should update unit for ADMIN', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should update unit for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('unit');
      expect(response.body.unit).toHaveProperty('id');
      expect(response.body.unit).toHaveProperty('unit_type');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .put('/api/v1/units/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .put(`/api/v1/units/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/units/:id/assign - Assign Tenant to Unit', () => {
    const assignData = {
      tenant_id: 'other-tenant-1',
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      rent_amount: 1500.00
    };

    it('should assign tenant to unit for DEV_ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${testData.units.unit1.id}/assign`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(assignData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should assign tenant to unit for ADMIN', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${testData.units.unit1.id}/assign`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(assignData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should assign tenant to unit for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .post(`/api/v1/units/${testData.units.unit1.id}/assign`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(assignData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .post('/api/v1/units/non-existent-id/assign')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(assignData)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/units/unit-1/assign')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(assignData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/units/unit-1/assign')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(assignData)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('DELETE /api/v1/units/:id/assign/:tenantId - Remove Tenant from Unit', () => {
    it('should remove tenant from unit for DEV_ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should remove tenant from unit for ADMIN', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should remove tenant from unit for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('unit_id');
      expect(response.body.data).toHaveProperty('tenant_id');
    });

    it('should return 404 for non-existent unit', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/non-existent-id/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .delete(`/api/v1/units/${testData.units.unit1.id}/assign/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see units in their facilities', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned units should be in facilities the admin has access to
      const units = response.body.units;
      for (const unit of units) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(unit.facility_id);
      }
    });

    it('should ensure tenants only see units they have access to', async () => {
      const response = await request(app)
        .get('/api/v1/units')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned units should be accessible to the tenant
      const units = response.body.units;
      for (const unit of units) {
        expect(testData.users.tenant.facilityIds).toContain(unit.facility_id);
      }
    });
  });
});
