import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectForbidden,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';

describe('Dev routes (/api/v1/dev)', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  describe('GET /api/v1/dev/websocket-stats', () => {
    it('returns 401 without token', async () => {
      const response = await request(app).get('/api/v1/dev/websocket-stats').expect(401);
      expectUnauthorized(response);
    });

    it('returns 403 for tenant (not admin / dev_admin)', async () => {
      const response = await request(app)
        .get('/api/v1/dev/websocket-stats')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
      expect(response.body.message).toMatch(/Admin or Dev Admin/i);
    });

    it('returns 403 for facility_admin', async () => {
      const response = await request(app)
        .get('/api/v1/dev/websocket-stats')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('returns 200 for admin with WebSocket stats payload', async () => {
      const response = await request(app)
        .get('/api/v1/dev/websocket-stats')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('totalClients');
    });

    it('returns 200 for dev_admin', async () => {
      const response = await request(app)
        .get('/api/v1/dev/websocket-stats')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/dev/logs', () => {
    it('returns 403 for tenant', async () => {
      const response = await request(app)
        .get('/api/v1/dev/logs')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });
  });
});
