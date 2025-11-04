import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('Devices Routes - Validation', () => {
  let app: any;
  let testData: any;

  beforeAll(() => {
    testData = createMockTestData();
    app = createApp();
  });

  it('rejects invalid pagination bounds on GET /api/v1/devices', async () => {
    const res = await request(app)
      .get('/api/v1/devices?limit=0&offset=-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(400);
    expect(res.body.success).toBe(false);
  });

  // Intentionally limit scope to validation failure case to avoid external mocks
});


