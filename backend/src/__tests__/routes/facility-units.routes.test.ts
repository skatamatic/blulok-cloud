import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

describe('Facility Units Routes (/api/v1 mount)', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  it('requires authentication', async () => {
    const response = await request(app)
      .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units`);
    expect(response.status).toBe(401);
    expectUnauthorized(response);
  });

  describe('GET /api/v1/facilities/:facilityId/units', () => {
    it('is registered (does not 404) and returns scoped units for admin', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?limit=25&offset=0`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expect(response.status).not.toBe(404);
      expectSuccess(response);
      expect(response.body).toMatchObject({
        success: true,
        total: expect.any(Number),
      });
      expect(Array.isArray(response.body.units)).toBe(true);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('allows facility admin to list units in an assigned facility', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('allows tenant to list units in a facility they belong to', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('returns 403 when facility admin requests units for an unassigned facility', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility2.id}/units`)
        .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('returns 403 when tenant requests units for a foreign facility', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility2.id}/units`)
        .set('Authorization', `Bearer ${testData.users.tenant.token}`)
        .expect(403);

      expectForbidden(response);
    });

    it('scopes to path facility when query facility_id differs', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?facility_id=${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('scopes to path facility when query facilityId differs', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?facilityId=${testData.facilities.facility2.id}`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.every((unit: { facility_id: string }) => unit.facility_id === testData.facilities.facility1.id)).toBe(true);
    });

    it('returns empty units for admin when facility id does not exist', async () => {
      const response = await request(app)
        .get('/api/v1/facilities/00000000-0000-4000-8000-000000000099/units')
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it('honors pagination query params', async () => {
      const response = await request(app)
        .get(`/api/v1/facilities/${testData.facilities.facility1.id}/units?limit=1&offset=0`)
        .set('Authorization', `Bearer ${testData.users.admin.token}`)
        .expect(200);

      expectSuccess(response);
      expect(response.body.units.length).toBeLessThanOrEqual(1);
    });
  });
});
