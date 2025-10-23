/**
 * FMS RBAC Security Tests
 * 
 * Validates that FMS routes are properly secured with role-based access control
 */

import request from 'supertest';
import express from 'express';
import { fmsRouter } from '@/routes/fms.routes';
import { FMSProviderType } from '@/types/fms.types';
import { createMockTestData, MockTestData } from '../utils/mock-test-helpers';
import { errorHandler } from '@/middleware/error.middleware';

describe('FMS RBAC Security Tests', () => {
  let app: express.Application;
  let testData: MockTestData;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/fms', fmsRouter);
    app.use(errorHandler); // Add error handler middleware

    testData = createMockTestData();
  });

  describe('Configuration Endpoints - Access Control', () => {
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';
    
    const validConfig = {
      facility_id: facilityId,
      provider_type: FMSProviderType.GENERIC_REST,
      config: {
        providerType: FMSProviderType.GENERIC_REST,
        baseUrl: 'https://api.example.com',
        auth: {
          type: 'api_key',
          credentials: { apiKey: 'test-key' }
        },
        features: {
          supportsTenantSync: true,
          supportsUnitSync: true,
          supportsWebhooks: false,
          supportsRealtime: false
        },
        syncSettings: {
          autoAcceptChanges: false
        }
      },
      is_enabled: true
    };

    describe('POST /api/v1/fms/config - Create Configuration', () => {
      it('should allow ADMIN to create FMS config', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(validConfig);

        expect([200, 201, 409]).toContain(response.status); // 409 if already exists
      });

      it('should allow DEV_ADMIN to create FMS config', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
          .send(validConfig);

        expect([200, 201, 409]).toContain(response.status);
      });

      it('should deny FACILITY_ADMIN from creating FMS config (admin-only operation)', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
          .send(validConfig);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toContain('Insufficient permissions');
      });

      it('should deny TENANT from creating FMS config', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(validConfig);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from creating FMS config', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(validConfig);

        expect(response.status).toBe(403);
      });

      it('should deny unauthenticated requests', async () => {
        const response = await request(app)
          .post('/api/v1/fms/config')
          .send(validConfig);

        expect(response.status).toBe(401);
      });
    });

    describe('GET /api/v1/fms/config/:facilityId - Get Configuration', () => {
      it('should allow ADMIN to get FMS config for any facility', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/config/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`);

        expect([200, 404]).toContain(response.status);
      });

      it('should allow DEV_ADMIN to get FMS config for any facility', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/config/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

        expect([200, 404]).toContain(response.status);
      });

      it('should allow FACILITY_ADMIN to get FMS config for their facility', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/config/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect([200, 404]).toContain(response.status);
      });

      it('should deny FACILITY_ADMIN from getting FMS config for other facilities', async () => {
        const otherFacilityId = '550e8400-e29b-41d4-a716-446655440002';

        const response = await request(app)
          .get(`/api/v1/fms/config/${otherFacilityId}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty('success', false);
      });

      it('should deny TENANT from getting FMS config', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/config/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from getting FMS config', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/config/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });

    describe('PUT /api/v1/fms/config/:id - Update Configuration', () => {
      const configId = 'test-config-id';

      it('should deny TENANT from updating FMS config', async () => {
        const response = await request(app)
          .put(`/api/v1/fms/config/${configId}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send({ is_enabled: true });

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from updating FMS config', async () => {
        const response = await request(app)
          .put(`/api/v1/fms/config/${configId}`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send({ is_enabled: true });

        expect(response.status).toBe(403);
      });
    });

    describe('DELETE /api/v1/fms/config/:id - Delete Configuration', () => {
      const configId = 'test-config-id';

      it('should deny TENANT from deleting FMS config', async () => {
        const response = await request(app)
          .delete(`/api/v1/fms/config/${configId}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from deleting FMS config', async () => {
        const response = await request(app)
          .delete(`/api/v1/fms/config/${configId}`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });
  });

  describe('Sync Endpoints - Access Control', () => {
    const facilityId = '550e8400-e29b-41d4-a716-446655440001';

    describe('POST /api/v1/fms/sync/:facilityId - Trigger Sync', () => {
      it('should allow ADMIN to trigger sync for any facility', async () => {
        const response = await request(app)
          .post(`/api/v1/fms/sync/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`);

        expect([200, 404, 500]).toContain(response.status);
      });

      it('should allow DEV_ADMIN to trigger sync for any facility', async () => {
        const response = await request(app)
          .post(`/api/v1/fms/sync/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.devAdmin.token}`);

        expect([200, 404, 500]).toContain(response.status);
      });

      it('should allow FACILITY_ADMIN to trigger sync for their facility', async () => {
        const response = await request(app)
          .post(`/api/v1/fms/sync/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect([200, 404, 500]).toContain(response.status);
      });

      it('should deny FACILITY_ADMIN from triggering sync for other facilities', async () => {
        const otherFacilityId = '550e8400-e29b-41d4-a716-446655440002';

        const response = await request(app)
          .post(`/api/v1/fms/sync/${otherFacilityId}`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect(response.status).toBe(403);
        expect(response.body).toHaveProperty('success', false);
      });

      it('should deny TENANT from triggering sync', async () => {
        const response = await request(app)
          .post(`/api/v1/fms/sync/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from triggering sync', async () => {
        const response = await request(app)
          .post(`/api/v1/fms/sync/${facilityId}`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/v1/fms/sync/:facilityId/history - Get Sync History', () => {
      it('should allow ADMIN to view sync history for any facility', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${facilityId}/history`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`);

        expect([200, 500]).toContain(response.status);
      });

      it('should allow FACILITY_ADMIN to view sync history for their facility', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${facilityId}/history`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect([200, 500]).toContain(response.status);
      });

      it('should deny FACILITY_ADMIN from viewing sync history for other facilities', async () => {
        const otherFacilityId = '550e8400-e29b-41d4-a716-446655440002';

        const response = await request(app)
          .get(`/api/v1/fms/sync/${otherFacilityId}/history`)
          .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny TENANT from viewing sync history', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${facilityId}/history`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from viewing sync history', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${facilityId}/history`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });

    describe('GET /api/v1/fms/sync/:syncLogId - Get Sync Details', () => {
      const syncLogId = 'test-sync-log-id';

      it('should deny TENANT from viewing sync details', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${syncLogId}`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from viewing sync details', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/sync/${syncLogId}`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });
  });

  describe('Change Management Endpoints - Access Control', () => {
    const syncLogId = 'test-sync-log-id';

    describe('GET /api/v1/fms/changes/:syncLogId/pending - Get Pending Changes', () => {
      it('should allow ADMIN to view pending changes', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/changes/${syncLogId}/pending`)
          .set('Authorization', `Bearer ${testData.users.admin.token}`);

        expect([200, 404, 500]).toContain(response.status);
      });

      it('should deny TENANT from viewing pending changes', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/changes/${syncLogId}/pending`)
          .set('Authorization', `Bearer ${testData.users.tenant.token}`);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from viewing pending changes', async () => {
        const response = await request(app)
          .get(`/api/v1/fms/changes/${syncLogId}/pending`)
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`);

        expect(response.status).toBe(403);
      });
    });

    describe('POST /api/v1/fms/changes/review - Review Changes', () => {
      const reviewPayload = {
        changeIds: ['change-1', 'change-2'],
        accepted: true
      };

      it('should allow ADMIN to review changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/review')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(reviewPayload);

        expect([200, 400, 500]).toContain(response.status);
      });

      it('should deny TENANT from reviewing changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/review')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(reviewPayload);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from reviewing changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/review')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(reviewPayload);

        expect(response.status).toBe(403);
      });
    });

    describe('POST /api/v1/fms/changes/apply - Apply Changes', () => {
      const applyPayload = {
        syncLogId: 'test-sync-log-id',
        changeIds: ['change-1', 'change-2']
      };

      it('should allow ADMIN to apply changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/apply')
          .set('Authorization', `Bearer ${testData.users.admin.token}`)
          .send(applyPayload);

        expect([200, 400, 404, 500]).toContain(response.status);
      });

      it('should deny TENANT from applying changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/apply')
          .set('Authorization', `Bearer ${testData.users.tenant.token}`)
          .send(applyPayload);

        expect(response.status).toBe(403);
      });

      it('should deny MAINTENANCE from applying changes', async () => {
        const response = await request(app)
          .post('/api/v1/fms/changes/apply')
          .set('Authorization', `Bearer ${testData.users.maintenance.token}`)
          .send(applyPayload);

        expect(response.status).toBe(403);
      });
    });
  });

  describe('Data Isolation Tests', () => {
    it('should ensure FACILITY_ADMIN can only access their own facilities', async () => {
      const facilityAdmin = testData.users.facilityAdmin;
      const authorizedFacility = '550e8400-e29b-41d4-a716-446655440001';
      const unauthorizedFacility = '550e8400-e29b-41d4-a716-446655440002';

      // Should succeed for authorized facility
      const authorizedResponse = await request(app)
        .get(`/api/v1/fms/config/${authorizedFacility}`)
        .set('Authorization', `Bearer ${facilityAdmin.token}`);

      expect([200, 404]).toContain(authorizedResponse.status);

      // Should fail for unauthorized facility
      const unauthorizedResponse = await request(app)
        .get(`/api/v1/fms/config/${unauthorizedFacility}`)
        .set('Authorization', `Bearer ${facilityAdmin.token}`);

      expect(unauthorizedResponse.status).toBe(403);
      expect(unauthorizedResponse.body).toHaveProperty('success', false);
      expect(unauthorizedResponse.body.message).toContain('Access denied');
    });

    it('should ensure TENANT has no access to FMS functionality', async () => {
      const tenant = testData.users.tenant;
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const endpoints = [
        { method: 'get', path: `/api/v1/fms/config/${facilityId}` },
        { method: 'post', path: '/api/v1/fms/sync/facility-1' },
        { method: 'get', path: `/api/v1/fms/sync/${facilityId}/history` },
        { method: 'get', path: '/api/v1/fms/changes/sync-1/pending' },
      ];

      for (const endpoint of endpoints) {
        let response;
        if (endpoint.method === 'post') {
          response = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`);
        } else {
          response = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`);
        }

        expect(response.status).toBe(403);
      }
    });

    it('should ensure MAINTENANCE has no access to FMS functionality', async () => {
      const maintenance = testData.users.maintenance;
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const endpoints = [
        { method: 'get', path: `/api/v1/fms/config/${facilityId}` },
        { method: 'post', path: `/api/v1/fms/sync/${facilityId}` },
        { method: 'get', path: `/api/v1/fms/sync/${facilityId}/history` },
        { method: 'get', path: '/api/v1/fms/changes/sync-1/pending' },
      ];

      for (const endpoint of endpoints) {
        let response;
        if (endpoint.method === 'post') {
          response = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${maintenance.token}`);
        } else {
          response = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${maintenance.token}`);
        }

        expect(response.status).toBe(403);
      }
    });
  });

  describe('Edge Cases and Security Boundaries', () => {
    it('should reject requests with invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config/facility-1')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });

    it('should reject requests without authentication', async () => {
      const response = await request(app)
        .get('/api/v1/fms/config/facility-1');

      expect(response.status).toBe(401);
    });

    it('should reject requests with expired tokens', async () => {
      // This would need a token generation utility that creates expired tokens
      // For now, we test with invalid token format
      const response = await request(app)
        .get('/api/v1/fms/config/facility-1')
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired');

      expect(response.status).toBe(401);
    });
  });

  describe('RBAC Consistency Across All Endpoints', () => {
    it('should consistently deny TENANT role across all FMS endpoints', async () => {
      const tenant = testData.users.tenant;
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const allEndpoints = [
        // Configuration
        { method: 'post', path: '/api/v1/fms/config', body: {} },
        { method: 'get', path: `/api/v1/fms/config/${facilityId}` },
        { method: 'put', path: '/api/v1/fms/config/config-1', body: {} },
        { method: 'delete', path: '/api/v1/fms/config/config-1' },
        { method: 'post', path: '/api/v1/fms/config/config-1/test' },
        
        // Sync
        { method: 'post', path: `/api/v1/fms/sync/${facilityId}` },
        { method: 'get', path: `/api/v1/fms/sync/${facilityId}/history` },
        { method: 'get', path: '/api/v1/fms/sync/sync-1' },
        
        // Changes
        { method: 'get', path: '/api/v1/fms/changes/sync-1/pending' },
        { method: 'post', path: '/api/v1/fms/changes/review', body: {} },
        { method: 'post', path: '/api/v1/fms/changes/apply', body: {} },
      ];

      for (const endpoint of allEndpoints) {
        let response;
        if (endpoint.method === 'post') {
          response = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send(endpoint.body || {});
        } else if (endpoint.method === 'put') {
          response = await request(app)
            .put(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`)
            .send(endpoint.body || {});
        } else if (endpoint.method === 'delete') {
          response = await request(app)
            .delete(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`);
        } else {
          response = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${tenant.token}`);
        }

        expect(response.status).toBe(403);
      }
    });

    it('should consistently deny MAINTENANCE role across all FMS endpoints', async () => {
      const maintenance = testData.users.maintenance;
      const facilityId = '550e8400-e29b-41d4-a716-446655440001';

      const allEndpoints = [
        { method: 'post', path: '/api/v1/fms/config', body: {} },
        { method: 'get', path: `/api/v1/fms/config/${facilityId}` },
        { method: 'post', path: `/api/v1/fms/sync/${facilityId}` },
        { method: 'get', path: `/api/v1/fms/sync/${facilityId}/history` },
        { method: 'get', path: '/api/v1/fms/changes/sync-1/pending' },
      ];

      for (const endpoint of allEndpoints) {
        let response;
        if (endpoint.method === 'post') {
          response = await request(app)
            .post(endpoint.path)
            .set('Authorization', `Bearer ${maintenance.token}`)
            .send(endpoint.body || {});
        } else {
          response = await request(app)
            .get(endpoint.path)
            .set('Authorization', `Bearer ${maintenance.token}`);
        }

        expect(response.status).toBe(403);
      }
    });
  });
});
