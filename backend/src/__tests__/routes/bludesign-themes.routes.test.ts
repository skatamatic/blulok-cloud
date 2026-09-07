import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';

describe('BluDesign themes routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeEach(() => {
    app = createApp();
    testData = createMockTestData();
  });

  it('returns 401 without token for GET /api/v1/bludesign/themes', async () => {
    const response = await request(app).get('/api/v1/bludesign/themes').expect(401);
    expectUnauthorized(response);
  });

  it('returns 200 and themes payload for authenticated user', async () => {
    const response = await request(app)
      .get('/api/v1/bludesign/themes')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);

    expectSuccess(response);
    expect(response.body).toHaveProperty('themes');
    expect(Array.isArray(response.body.themes)).toBe(true);
  });
});
