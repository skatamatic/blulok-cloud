import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectForbidden,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';

describe('Admin Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  describe('POST /api/v1/admin/ops-key-rotation/broadcast', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .send({})
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for tenant token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for facility_admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when root_private_key_b64 is missing (managed flow)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/ops-key-rotation/broadcast')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toContain('root_private_key');
    });
  });

  describe('POST /api/v1/admin/rate-limits/bypass', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .send({ enabled: false })
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ enabled: false })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when body fails Joi validation', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBeTruthy();
    });

    it('should return 200 for dev_admin disabling bypass in non-production test env', async () => {
      const response = await request(app)
        .post('/api/v1/admin/rate-limits/bypass')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ enabled: false })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/admin/dev-tools/gateway-ping', () => {
    it('should return 403 for admin token (requireDevAdmin)', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .send({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
        .expect(403);

      expectForbidden(response);
    });

    it('should return 400 for dev_admin when facilityId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(String(response.body.message)).toBeTruthy();
    });

    it('should return 200 for dev_admin with valid facilityId in non-production test env', async () => {
      const response = await request(app)
        .post('/api/v1/admin/dev-tools/gateway-ping')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .send({ facilityId: '550e8400-e29b-41d4-a716-446655440001' })
        .expect(200);

      expectSuccess(response);
      expect(response.body.success).toBe(true);
      expect(response.body.facilityId).toBe('550e8400-e29b-41d4-a716-446655440001');
    });
  });

  describe('POST /api/v1/admin/data-prune (requireAdmin)', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .send({})
        .expect(401);

      expectUnauthorized(response);
    });

    it('should return 403 for tenant token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });

    it('should return 403 for facility_admin token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/data-prune')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .send({})
        .expect(403);

      expectForbidden(response);
    });
  });
});
