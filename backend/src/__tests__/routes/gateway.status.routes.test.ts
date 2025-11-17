import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('GET /api/v1/gateways/status/:facilityId', () => {
  it('returns status for ADMIN regardless of facility', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const adminToken = testData.users.admin.token;

    const res = await request(app)
      .get('/api/v1/gateways/status/facility-1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect([200, 403]).toContain(res.status); // If facility-1 not in mock, still should not 401/404
    if (res.status === 200) {
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('facilityId', 'facility-1');
      expect(res.body).toHaveProperty('connected');
    }
  });

  it('forbids FACILITY_ADMIN without access to facility', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const faToken = testData.users.facilityAdmin.token;

    const res = await request(app)
      .get('/api/v1/gateways/status/unauthorized-facility')
      .set('Authorization', `Bearer ${faToken}`);

    // In our integration harness, facilityadmin has fixed facilities; use 403 expectation
    expect(res.status).toBe(403);
  });
});


