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

  it('rejects access-control no-feedback timeouts over one hour', async () => {
    const res = await request(app)
      .post('/api/v1/devices/access-control')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({
        gateway_id: 'gateway-1',
        device_serial: 'AC-NO-FEEDBACK',
        name: 'Relay gate',
        device_type: 'gate',
        location_description: 'North entry',
        relay_channel: 1,
        has_lock_feedback: false,
        no_feedback_open_timeout_sec: 3601,
      })
      .expect(400);

    expect(res.body.message).toMatch(/less than or equal to 3600/i);
  });

  // Intentionally limit scope to validation failure case to avoid external mocks
});


