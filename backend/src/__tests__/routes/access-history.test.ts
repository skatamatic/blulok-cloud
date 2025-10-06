import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectUnauthorized, expectForbidden, expectSuccess, expectNotFound } from '@/__tests__/utils/mock-test-helpers';
import { setupMockResponse, setupMockMutation } from '@/__tests__/mocks/database.mock';

describe('Access History Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(async () => {
    // Create mock test data
    testData = createMockTestData();
    
    // Setup mock database responses
    setupMockResponse('users', Object.values(testData.users).map(u => ({ 
      id: u.id, 
      email: u.email, 
      role: u.role,
      first_name: 'Test',
      last_name: 'User',
      password_hash: 'hashed',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    })));
    setupMockResponse('facilities', Object.values(testData.facilities));
    setupMockResponse('units', Object.values(testData.units));
    setupMockResponse('access_logs', Object.values(testData.accessLogs));
    
    // Setup mock mutations
    setupMockMutation('access_logs', { id: 'new-log-id' });
  });

  describe('Authentication Requirements', () => {
    it('should require authentication for all access history endpoints', async () => {
      const endpoints = [
        '/api/v1/access-history',
        `/api/v1/access-history/user/${testData.users.tenant.id}`,
        `/api/v1/access-history/facility/${testData.facilities.facility1.id}`,
        `/api/v1/access-history/unit/${testData.units.unit1.id}`,
        `/api/v1/access-history/${testData.accessLogs.log1.id}`,
        '/api/v1/access-history/export',
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        expectUnauthorized(response);
      }
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expectUnauthorized(response);
    });

    it('should reject expired tokens', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', 'Bearer expired-token')
        .expect(401);

      expectUnauthorized(response);
    });
  });

  describe('Business Logic - Main Access History Endpoint', () => {
    it('should return paginated access logs for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?limit=10&offset=0')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit', 10);
      expect(response.body).toHaveProperty('offset', 0);
    });

    it('should return paginated access logs for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?limit=5&offset=5')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('limit', 5);
      expect(response.body).toHaveProperty('offset', 5);
    });

    it('should filter by user_id', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history?user_id=${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter by facility_id', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history?facility_id=${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter by unit_id', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history?unit_id=${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(app)
        .get(`/api/v1/access-history?start_date=${startDate}&end_date=${endDate}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter by action_type', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?action_type=access_granted')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should handle sorting by timestamp', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?sort_by=timestamp&sort_order=desc')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should handle malformed query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?limit=invalid&offset=invalid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Security - Role-Based Access Control - Main Access History Endpoint', () => {
    it('should allow DEV_ADMIN to access all data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should allow ADMIN to access all data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should allow FACILITY_ADMIN to access only their assigned facilities', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should prevent FACILITY_ADMIN from accessing other facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history?facility_id=${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should allow TENANT to access only their own units', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should allow MAINTENANCE to access only their own logs', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Business Logic - User-Specific Access History Endpoint', () => {
    it('should return user-specific logs for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should return user-specific logs for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter user logs by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}?start_date=${startDate}&end_date=${endDate}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter user logs by action type', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}?action_type=access_granted`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Security - User-Specific Access History Endpoint', () => {
    it('should allow DEV_ADMIN to access any user\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow ADMIN to access any user\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow FACILITY_ADMIN to access users in their facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should prevent FACILITY_ADMIN from accessing users in other facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.facility2Tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent TENANT from accessing other users\' history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.otherTenant.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from accessing other users\' history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/user/${testData.users.tenant.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Business Logic - Facility-Specific Access History Endpoint', () => {
    it('should return facility-specific logs for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should return facility-specific logs for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter facility logs by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}?start_date=${startDate}&end_date=${endDate}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Security - Facility-Specific Access History Endpoint', () => {
    it('should allow DEV_ADMIN to access any facility\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow ADMIN to access any facility\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow FACILITY_ADMIN to access their assigned facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should prevent FACILITY_ADMIN from accessing other facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent TENANT from accessing facility history directly', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from accessing facility history directly', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/facility/${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Business Logic - Unit-Specific Access History Endpoint', () => {
    it('should return unit-specific logs for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should return unit-specific logs for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });

    it('should filter unit logs by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}?start_date=${startDate}&end_date=${endDate}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });

  describe('Security - Unit-Specific Access History Endpoint', () => {
    it('should allow DEV_ADMIN to access any unit\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow ADMIN to access any unit\'s history', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow FACILITY_ADMIN to access units in their facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should prevent FACILITY_ADMIN from accessing units in other facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should allow TENANT to access their own units', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

      it('should allow TENANT to access their own units', async () => {
        const response = await request(app)
          .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .expect(200);

        expectSuccess(response);
      });

    it('should prevent TENANT from accessing other tenants\' units', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit2.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from accessing unit history directly', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/unit/${testData.units.unit1.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Business Logic - Individual Access Log Endpoint', () => {
    it('should return specific log details for DEV_ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('log');
      expect(response.body.log).toHaveProperty('id', testData.accessLogs.log1.id);
    });

    it('should return specific log details for ADMIN', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('log');
      expect(response.body.log).toHaveProperty('id');
    });

    it('should return 404 for non-existent log', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/non-existent-log')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });
  });

  describe('Security - Individual Access Log Endpoint', () => {
    it('should allow DEV_ADMIN to access any log', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow ADMIN to access any log', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should allow FACILITY_ADMIN to access logs from their facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should prevent FACILITY_ADMIN from accessing logs from other facilities', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should allow TENANT to access logs for their units', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
    });

    it('should prevent TENANT from accessing logs for other units', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log2.id}`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('should prevent MAINTENANCE from accessing logs for other users', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/${testData.accessLogs.log1.id}`)
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Business Logic - CSV Export', () => {
    it('should export CSV data for DEV_ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('ID,User ID,Facility ID');
    });

    it('should export CSV data for ADMIN', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should filter export by date range', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();
      
      const response = await request(app)
        .get(`/api/v1/access-history/export?start_date=${startDate}&end_date=${endDate}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should filter export by facility_id', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/export?facility_id=${testData.facilities.facility1.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });
  });

  describe('Security - CSV Export', () => {
    it('should allow DEV_ADMIN to export all data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should allow ADMIN to export all data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should allow FACILITY_ADMIN to export only their facilities data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should allow TENANT to export only their units data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should allow MAINTENANCE to export only their own data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/export')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
    });

    it('should prevent unauthorized export with facility filter', async () => {
      const response = await request(app)
        .get(`/api/v1/access-history/export?facility_id=${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure tenants cannot see other tenants\' data in main endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned logs should be related to the tenant
      const logs = response.body.logs;
      expect(logs.length).toBeGreaterThan(0);
      for (const log of logs) {
        expect(log.user_id === testData.users.tenant.id || 
               log.unit_id === testData.units.unit1.id || 
               log.unit_id === testData.units.unit3.id).toBe(true);
      }
    });

    it('should ensure facility admins cannot see other facilities\' data', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned logs should be for facilities the admin has access to
      const logs = response.body.logs;
      expect(logs.length).toBeGreaterThan(0);
      for (const log of logs) {
        expect(testData.users.facilityAdmin.facilityIds).toContain(log.facility_id);
      }
    });

    it('should ensure maintenance users only see their own logs', async () => {
      const response = await request(app)
        .get('/api/v1/access-history')
        .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
        .expect(200);

      expectSuccess(response);
      // All returned logs should be for the maintenance user
      const logs = response.body.logs;
      expect(logs.length).toBeGreaterThan(0);
      for (const log of logs) {
        expect(log.user_id).toBe(testData.users.maintenance.id);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle non-existent user IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/user/non-existent-user')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
      expect(response.body.logs).toHaveLength(0);
    });

    it('should handle non-existent facility IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/facility/non-existent-facility')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
      expect(response.body.logs).toHaveLength(0);
    });

    it('should handle non-existent unit IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/unit/non-existent-unit')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
      expect(response.body.logs).toHaveLength(0);
    });

    it('should handle non-existent log IDs gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history/non-existent-log')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(404);

      expectNotFound(response);
    });

    it('should handle malformed query parameters gracefully', async () => {
      const response = await request(app)
        .get('/api/v1/access-history?limit=invalid&offset=invalid&sort_by=invalid')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body).toHaveProperty('logs');
    });
  });
});
