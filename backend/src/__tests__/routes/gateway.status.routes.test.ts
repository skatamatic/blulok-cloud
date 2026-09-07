import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData } from '@/__tests__/utils/mock-test-helpers';

describe('GET /api/v1/gateways/status/:facilityId', () => {
  it('returns status for ADMIN regardless of facility scope', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const adminToken = testData.users.admin.token;

    const res = await request(app)
      .get('/api/v1/gateways/status/facility-1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('facilityId', 'facility-1');
    expect(res.body).toHaveProperty('connected');
  });

  it('forbids FACILITY_ADMIN without access to the facility', async () => {
    const app = createApp();
    const testData = createMockTestData();
    const faToken = testData.users.facilityAdmin.token;

    const res = await request(app)
      .get('/api/v1/gateways/status/unauthorized-facility')
      .set('Authorization', `Bearer ${faToken}`)
      .expect(403);

    expect(res.body).toHaveProperty('success', false);
  });
});

describe('PUT /api/v1/gateways/:id', () => {
  it('allows an admin to rename a gateway', async () => {
    const app = createApp();
    const testData = createMockTestData();

    const res = await request(app)
      .put('/api/v1/gateways/gateway-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'North Entry Gateway' })
      .expect(200);

    expect(res.body).toMatchObject({
      success: true,
      gateway: { id: 'gateway-1', name: 'North Entry Gateway' },
    });
  });

  it('allows a facility admin to rename a gateway in an assigned facility', async () => {
    const app = createApp();
    const testData = createMockTestData();

    const res = await request(app)
      .put('/api/v1/gateways/gateway-1')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ name: 'Facility Gateway' })
      .expect(200);

    expect(res.body.gateway.name).toBe('Facility Gateway');
  });

  it('forbids a facility admin from renaming another facility gateway', async () => {
    const app = createApp();
    const testData = createMockTestData();

    await request(app)
      .put('/api/v1/gateways/gateway-2')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ name: 'Unauthorized Rename' })
      .expect(403);
  });

  it('forbids facility admins from editing non-name gateway fields', async () => {
    const app = createApp();
    const testData = createMockTestData();

    const res = await request(app)
      .put('/api/v1/gateways/gateway-1')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ status: 'maintenance' })
      .expect(403);

    expect(res.body.message).toMatch(/only rename/i);
  });

  it('rejects blank gateway names', async () => {
    const app = createApp();
    const testData = createMockTestData();

    await request(app)
      .put('/api/v1/gateways/gateway-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: '   ' })
      .expect(400);
  });
});


