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

  describe('POST /api/v1/dev/simulator/user-session', () => {
    it('returns 401 without token', async () => {
      const response = await request(app)
        .post('/api/v1/dev/simulator/user-session')
        .send({ userId: testData.users.tenant.id })
        .expect(401);

      expectUnauthorized(response);
    });

    it('returns 403 for tenant', async () => {
      const response = await request(app)
        .post('/api/v1/dev/simulator/user-session')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ userId: testData.users.tenant.id })
        .expect(403);

      expectForbidden(response);
    });

    it('mints a JWT for an existing user when called by admin', async () => {
      const response = await request(app)
        .post('/api/v1/dev/simulator/user-session')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ userId: testData.users.tenant.id })
        .expect(200);

      expectSuccess(response);
      expect(response.body.token).toBeTruthy();
      expect(response.body.user?.id).toBe(testData.users.tenant.id);
    });

  describe('PUT /api/v1/dev/gateway-offline-grace', () => {
    afterEach(() => {
      const { GatewayEventsService } = require('@/services/gateway/gateway-events.service');
      GatewayEventsService.getInstance().setOfflineGraceMsOverride(null);
    });

    it('returns 403 for tenant', async () => {
      const response = await request(app)
        .put('/api/v1/dev/gateway-offline-grace')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({ grace_ms: 1000 })
        .expect(403);

      expectForbidden(response);
    });

    it('sets and clears process override for admin', async () => {
      const setResp = await request(app)
        .put('/api/v1/dev/gateway-offline-grace')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ grace_ms: 1500 })
        .expect(200);

      expectSuccess(setResp);
      expect(setResp.body.data.grace_ms).toBe(1500);
      expect(setResp.body.data.override_active).toBe(true);

      const getResp = await request(app)
        .get('/api/v1/dev/gateway-offline-grace')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(getResp.body.data.grace_ms).toBe(1500);
      expect(getResp.body.data.override_active).toBe(true);

      const clearResp = await request(app)
        .put('/api/v1/dev/gateway-offline-grace')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ grace_ms: null })
        .expect(200);

      expect(clearResp.body.data.override_active).toBe(false);
    });
  });
});
