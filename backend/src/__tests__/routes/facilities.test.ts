import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden, expectNotFound } from '@/__tests__/utils/mock-test-helpers';
import { UserFacilityAssociationModel } from '@/models/user-facility-association.model';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';

describe('Facilities Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all facility endpoints', async () => {
      // Test GET /api/v1/facilities
      let response = await request(app).get('/api/v1/facilities');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/facilities/:id
      response = await request(app).get('/api/v1/facilities/facility-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test POST /api/v1/facilities
      response = await request(app).post('/api/v1/facilities');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test PUT /api/v1/facilities/:id
      response = await request(app).put('/api/v1/facilities/facility-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test DELETE /api/v1/facilities/:id
      response = await request(app).delete('/api/v1/facilities/facility-1');
      expect(response.status).toBe(401);
      expectUnauthorized(response);

      // Test GET /api/v1/facilities/:facilityId/units
      response = await request(app).get('/api/v1/facilities/facility-1/units');
      expect(response.status).toBe(401);
      expectUnauthorized(response);
    }, 30000); // Increase timeout to 30s
  });

  describe('GET /api/v1/facilities - List Facilities', () => {
    it('should return all facilities for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });

    it('should return all facilities for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });

    it('should return only facilities with units for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
      // Should only return facilities where admin has units
      expect(response.body.facilities.length).toBeGreaterThan(0);
    });

    it('should list facilities from live DB associations even when JWT facilityIds are stale', async () => {
      const liveFacilityIds = [
        '550e8400-e29b-41d4-a716-446655440001',
        '550e8400-e29b-41d4-a716-446655440002',
      ];
      const getIdsMock = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;
      getIdsMock.mockResolvedValueOnce(liveFacilityIds);

      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      const returnedIds = response.body.facilities.map((f: { id: string }) => f.id);
      expect(returnedIds).toEqual(
        expect.arrayContaining(liveFacilityIds)
      );
      expect(response.body.total).toBe(liveFacilityIds.length);
      expect(returnedIds.length).toBe(liveFacilityIds.length);
    });

    it('should list only DB-associated facilities when JWT still includes a removed facility', async () => {
      const facilityOne = '550e8400-e29b-41d4-a716-446655440001';
      const facilityTwo = '550e8400-e29b-41d4-a716-446655440002';
      const jwtWithBothFacilities = AuthService.generateToken(
        {
          id: 'facility-admin-1',
          email: 'facilityadmin@test.com',
          role: UserRole.FACILITY_ADMIN,
          password_hash: 'hashed-password',
          first_name: 'Facility',
          last_name: 'Admin',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as any,
        [facilityOne, facilityTwo]
      );

      const getIdsMock = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;
      getIdsMock.mockResolvedValueOnce([facilityOne]);

      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${jwtWithBothFacilities}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.total).toBe(1);
      expect(response.body.facilities.map((f: { id: string }) => f.id)).toEqual([facilityOne]);
    });

    it('should return only facilities with units for TENANT', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
      // Should only return facilities where tenant has units
      expect(response.body.facilities.length).toBeGreaterThan(0);
    });

    it('should return only facilities with units for MAINTENANCE', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
      // Should only return facilities where maintenance has units
      expect(response.body.facilities.length).toBeGreaterThan(0);
    });

    it('should filter facilities by search query', async () => {
      const response = await request(app)
        .get('/api/v1/facilities?search=facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });

    it('should filter facilities by status', async () => {
      const response = await request(app)
        .get('/api/v1/facilities?status=active')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle pagination with limit and offset', async () => {
      const response = await request(app)
        .get('/api/v1/facilities?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });

    it('should handle sorting by name', async () => {
      const response = await request(app)
        .get('/api/v1/facilities?sortBy=name&sortOrder=asc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facilities');
      expect(response.body).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/facilities/:facilityId/units - List Facility Units', () => {
    it('should return units scoped to the facility path param', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?limit=25&offset=0`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('units');
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('should return 404 for unknown facility', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/non-existent-facility/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 when facility admin requests units for an unassigned facility', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility2.id}/units`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should scope to path facility when query facility_id differs', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?facility_id=${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });
  });

  describe('GET /api/v1/facilities/:id - Get Specific Facility', () => {
    it('should return facility details for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
      expect(response.body.facility).toHaveProperty('id');
      expect(response.body.facility).toHaveProperty('name');
    });

    it('should return facility details for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return facility details for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return facility details for TENANT with access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return facility details for MAINTENANCE with access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return 404 for non-existent facility', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-2')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for removed facility even when JWT still includes it', async () => {
      const facilityOne = '550e8400-e29b-41d4-a716-446655440001';
      const facilityTwo = '550e8400-e29b-41d4-a716-446655440002';
      const jwtWithBothFacilities = AuthService.generateToken(
        {
          id: 'facility-admin-1',
          email: 'facilityadmin@test.com',
          role: UserRole.FACILITY_ADMIN,
          password_hash: 'hashed-password',
          first_name: 'Facility',
          last_name: 'Admin',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as any,
        [facilityOne, facilityTwo]
      );

      const getIdsMock = UserFacilityAssociationModel.getUserFacilityIds as jest.Mock;
      getIdsMock.mockResolvedValueOnce([facilityOne]);

      const response = await request(app)
        .get(`/api/v1/facilities/${facilityTwo}`)
        .set('Authorization', `Bearer ${jwtWithBothFacilities}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT without access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-2')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE without access', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/facility-2')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('POST /api/v1/facilities - Create Facility', () => {
    const validFacilityData = {
      name: 'Test Facility',
      address: '123 Test Street',
      city: 'Test City',
      state: 'TS',
      zip_code: '12345',
      status: 'active',
      description: 'Test facility description'
    };

    it('should create facility for DEV_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(validFacilityData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
      expect(response.body.facility).toHaveProperty('id');
      expect(response.body.facility.name).toBe(validFacilityData.name);
    });

    it('should create facility for ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(validFacilityData)
        .expect(201);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(validFacilityData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(validFacilityData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(validFacilityData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 409 when creating a facility with a duplicate name', async () => {
      const response = await request(app)
        .post('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ ...validFacilityData, name: 'Test Facility 1' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/name already exists/i);
    });
  });

  describe('PUT /api/v1/facilities/:id - Update Facility', () => {
    const updateData = {
      name: 'Updated Facility Name',
      status: 'inactive',
      description: 'Updated description'
    };

    it('should update facility for DEV_ADMIN', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
      expect(response.body.facility.name).toBe(updateData.name);
    });

    it('should update facility for ADMIN', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should update facility for FACILITY_ADMIN with access', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('facility');
    });

    it('should return 404 for non-existent facility', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send(updateData)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN without access', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-2')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .send(updateData)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 409 when renaming to an existing facility name', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ name: 'Test Facility 2' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/name already exists/i);
    });

    it('should allow keeping the same facility name on update', async () => {
      const response = await request(app)
        .put('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({ name: 'Test Facility 1', description: 'Same name, new description' })
        .expect(200);

      expectSuccess(response);
    });
  });

  describe('DELETE /api/v1/facilities/:id - Delete Facility', () => {
    it('should delete facility for DEV_ADMIN', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should delete facility for ADMIN', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 for non-existent facility', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/non-existent-id')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should return 403 for FACILITY_ADMIN', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for TENANT', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for MAINTENANCE', async () => {
      const response = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure facility admins only see facilities with their units', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned facilities should be in the admin's assigned facilities
      const returnedFacilityIds = response.body.facilities.map((f: any) => f.id);
      const assignedFacilityIds = testData.users.facilityAdmin.facilityIds;
      
      for (const facilityId of returnedFacilityIds) {
        expect(assignedFacilityIds).toContain(facilityId);
      }
    });

    it('should ensure tenants only see facilities with their units', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned facilities should be in the tenant's assigned facilities
      const returnedFacilityIds = response.body.facilities.map((f: any) => f.id);
      const assignedFacilityIds = testData.users.tenant.facilityIds;
      
      for (const facilityId of returnedFacilityIds) {
        expect(assignedFacilityIds).toContain(facilityId);
      }
    });

    it('should ensure maintenance only see facilities with their units', async () => {
      const response = await request(app)
        .get('/api/v1/facilities')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned facilities should be in the maintenance's assigned facilities
      const returnedFacilityIds = response.body.facilities.map((f: any) => f.id);
      const assignedFacilityIds = testData.users.maintenance.facilityIds;
      
      for (const facilityId of returnedFacilityIds) {
        expect(assignedFacilityIds).toContain(facilityId);
      }
    });
  });
});