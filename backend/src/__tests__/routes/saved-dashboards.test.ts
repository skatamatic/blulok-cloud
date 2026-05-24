import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';

describe('Saved Dashboards Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/saved-dashboards');
    expectUnauthorized(response);
  });

  it('rejects non-admin roles', async () => {
    const response = await request(app)
      .get('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(403);
    expect(response.body.success).toBe(false);
  });

  it('allows admin to list saved dashboards', async () => {
    const response = await request(app)
      .get('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expectSuccess(response);
    expect(Array.isArray(response.body.dashboards)).toBe(true);
  });

  it('rejects tenant saving dashboard snapshot', async () => {
    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({ name: 'Tenant Save' })
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('rejects facility_admin from listing saved dashboards', async () => {
    const response = await request(app)
      .get('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('rejects facility_admin from saving dashboard snapshot', async () => {
    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ name: 'Facility Admin Save' })
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('allows admin to update an existing template snapshot', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({
      id: 'saved-dashboard-1',
      name: 'Ops',
    });

    const response = await request(app)
      .put('/api/v1/saved-dashboards/saved-dashboard-1/snapshot')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expectSuccess(response);
    expect(response.body.dashboard).toMatchObject({
      id: 'saved-dashboard-1',
      name: 'Test Dashboard',
    });
    expect(SavedDashboardModel.updateSnapshotFromUserWorkingLayout).toHaveBeenCalledWith(
      'saved-dashboard-1',
      testData.users.admin.id
    );
  });

  it('returns 404 when updating missing template snapshot', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue(undefined);

    const response = await request(app)
      .put('/api/v1/saved-dashboards/missing-id/snapshot')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

describe('Widget Layouts RBAC', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
  });

  it('allows tenant to GET working layout', async () => {
    const response = await request(app)
      .get('/api/v1/widget-layouts')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(200);

    expectSuccess(response);
  });

  it('rejects tenant POST save', async () => {
    const response = await request(app)
      .post('/api/v1/widget-layouts')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({
        pages: [
          {
            name: 'Main',
            pageOrder: 0,
            widgets: [],
          },
        ],
      })
      .expect(403);

    expect(response.body.success).toBe(false);
  });

  it('rejects facility_admin POST save', async () => {
    const response = await request(app)
      .post('/api/v1/widget-layouts')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({
        pages: [
          {
            name: 'Main',
            pageOrder: 0,
            widgets: [],
          },
        ],
      })
      .expect(403);

    expect(response.body.success).toBe(false);
  });
});
