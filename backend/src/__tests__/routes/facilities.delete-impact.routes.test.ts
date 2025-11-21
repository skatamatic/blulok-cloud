import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

jest.mock('@/services/facilities.service', () => ({
  FacilitiesService: {
    getInstance: jest.fn().mockReturnValue({
      getDeleteImpact: jest.fn().mockResolvedValue({ units: 3, devices: 7, gateways: 1 }),
      deleteFacilityCascade: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('Facilities Delete Impact & Delete Routes', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  describe('GET /api/v1/facilities/:id/delete-impact', () => {
    it('returns impact counts for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/facility-1/delete-impact')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(res);
      expect(res.body.units).toBeDefined();
      expect(res.body.devices).toBeDefined();
      expect(res.body.gateways).toBeDefined();
    });

    it('returns impact counts for DEV_ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/facility-1/delete-impact')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(res);
    });

    it('forbids FACILITY_ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/facility-1/delete-impact')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);
      expectForbidden(res);
    });

    it('forbids TENANT', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/facility-1/delete-impact')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);
      expectForbidden(res);
    });
  });

  describe('DELETE /api/v1/facilities/:id', () => {
    it('deletes facility for ADMIN', async () => {
      const res = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(res);
    });

    it('deletes facility for DEV_ADMIN', async () => {
      const res = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
        .expect(200);

      expectSuccess(res);
    });

    it('forbids FACILITY_ADMIN', async () => {
      const res = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);
      expectForbidden(res);
    });

    it('forbids TENANT', async () => {
      const res = await request(app)
        .delete('/api/v1/facilities/facility-1')
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);
      expectForbidden(res);
    });
  });
});







