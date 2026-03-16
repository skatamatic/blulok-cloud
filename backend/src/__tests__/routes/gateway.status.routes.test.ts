import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('GET /api/v1/gateways', () => {
  it('returns gateways for ADMIN', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const adminToken = testData.users.admin.token;

    const res = await request(app)
      .get('/api/v1/gateways')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.gateways)).toBe(true);
  });

  it('returns facility-scoped gateways for FACILITY_ADMIN', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const faToken = testData.users.facilityAdmin.token;

    const res = await request(app)
      .get('/api/v1/gateways')
      .set('Authorization', `Bearer ${faToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.gateways)).toBe(true);
  });
});


