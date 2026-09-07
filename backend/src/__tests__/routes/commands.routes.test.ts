import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';

describe('Commands routes (/api/v1/commands)', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  it('returns 401 without authentication for GET /pending', async () => {
    const response = await request(app).get('/api/v1/commands/pending').expect(401);
    expectUnauthorized(response);
  });

  it('returns 200 for admin listing pending commands', async () => {
    const response = await request(app)
      .get('/api/v1/commands/pending')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expectSuccess(response);
    expect(response.body.success).toBe(true);
    expect(response.body).toHaveProperty('items');
  });

  it('returns 403 for tenant on POST /:id/retry (requireAdmin)', async () => {
    const response = await request(app)
      .post('/api/v1/commands/some-command-id/retry')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });
});
