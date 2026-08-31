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

  it('returns 400 when snapshot update throws a non-not-found error', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({ id: 'saved-dashboard-1', name: 'Ops' });
    SavedDashboardModel.updateSnapshotFromUserWorkingLayout.mockRejectedValueOnce(
      new Error('Working layout is empty'),
    );

    const response = await request(app)
      .put('/api/v1/saved-dashboards/saved-dashboard-1/snapshot')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/empty/i);
  });

  it('rejects create without name (400)', async () => {
    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('creates saved dashboard from working layout', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.createFromUserWorkingLayout.mockResolvedValueOnce({
      id: 'saved-dashboard-new',
      name: 'Coverage Dash',
      description: 'desc',
    });

    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Coverage Dash', description: 'desc' })
      .expect(201);

    expectSuccess(response);
    expect(response.body.dashboard).toMatchObject({
      id: 'saved-dashboard-new',
      name: 'Coverage Dash',
      description: 'desc',
    });
  });

  it('returns 409 when create hits duplicate name', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    const err = Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' });
    SavedDashboardModel.createFromUserWorkingLayout.mockRejectedValueOnce(err);

    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Dup' })
      .expect(409);

    expect(response.body.message).toMatch(/already exists/i);
  });

  it('returns 400 when create fails with other error', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.createFromUserWorkingLayout.mockRejectedValueOnce(
      new Error('No working layout'),
    );

    const response = await request(app)
      .post('/api/v1/saved-dashboards')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Fail Dash' })
      .expect(400);

    expect(response.body.message).toMatch(/No working layout/i);
  });

  it('updates saved dashboard metadata', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({
      id: 'saved-dashboard-1',
      name: 'Ops',
      description: null,
    });
    SavedDashboardModel.findByName.mockResolvedValue(undefined);
    SavedDashboardModel.updateMetadata.mockResolvedValue({
      id: 'saved-dashboard-1',
      name: 'Renamed',
      description: 'new',
    });

    const response = await request(app)
      .patch('/api/v1/saved-dashboards/saved-dashboard-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Renamed', description: 'new' })
      .expect(200);

    expectSuccess(response);
    expect(response.body.dashboard.name).toBe('Renamed');
  });

  it('returns 404 when patching missing dashboard', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue(undefined);

    const response = await request(app)
      .patch('/api/v1/saved-dashboards/missing-id')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'X' })
      .expect(404);

    expect(response.body.success).toBe(false);
  });

  it('returns 409 when patch rename collides', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({
      id: 'saved-dashboard-1',
      name: 'Ops',
    });
    SavedDashboardModel.findByName.mockResolvedValue({
      id: 'other-id',
      name: 'Taken',
    });

    const response = await request(app)
      .patch('/api/v1/saved-dashboards/saved-dashboard-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Taken' })
      .expect(409);

    expect(response.body.message).toMatch(/already exists/i);
  });

  it('returns 409 when updateMetadata hits duplicate errno', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({
      id: 'saved-dashboard-1',
      name: 'Ops',
    });
    SavedDashboardModel.findByName.mockResolvedValue(undefined);
    SavedDashboardModel.updateMetadata.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { errno: 1062 }),
    );

    const response = await request(app)
      .patch('/api/v1/saved-dashboards/saved-dashboard-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ name: 'Clash' })
      .expect(409);

    expect(response.body.message).toMatch(/already exists/i);
  });

  it('deletes saved dashboard when unreferenced', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({ id: 'saved-dashboard-1', name: 'Ops' });
    SavedDashboardModel.countAssignmentsReferencing.mockResolvedValue(0);

    const response = await request(app)
      .delete('/api/v1/saved-dashboards/saved-dashboard-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expectSuccess(response);
    expect(SavedDashboardModel.deleteById).toHaveBeenCalledWith('saved-dashboard-1');
  });

  it('returns 404 when deleting missing dashboard', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue(undefined);

    const response = await request(app)
      .delete('/api/v1/saved-dashboards/missing-id')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(404);

    expect(response.body.success).toBe(false);
  });

  it('returns 409 when deleting dashboard still referenced', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.findById.mockResolvedValue({ id: 'saved-dashboard-1', name: 'Ops' });
    SavedDashboardModel.countAssignmentsReferencing.mockResolvedValue(2);

    const response = await request(app)
      .delete('/api/v1/saved-dashboards/saved-dashboard-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(409);

    expect(response.body.message).toMatch(/Cannot delete/i);
  });

  it('loads saved dashboard into working layout', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.loadIntoUserWorkingLayout.mockResolvedValueOnce([]);

    const response = await request(app)
      .post('/api/v1/saved-dashboards/saved-dashboard-1/load')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({})
      .expect(200);

    expectSuccess(response);
    expect(response.body.message).toMatch(/loaded successfully/i);
    expect(SavedDashboardModel.loadIntoUserWorkingLayout).toHaveBeenCalledWith(
      'saved-dashboard-1',
      testData.users.admin.id,
    );
  });

  it('returns 404 when load target is missing', async () => {
    const { SavedDashboardModel } = jest.requireMock('@/models/saved-dashboard.model');
    SavedDashboardModel.loadIntoUserWorkingLayout.mockRejectedValueOnce(
      new Error('Saved dashboard not found'),
    );

    const response = await request(app)
      .post('/api/v1/saved-dashboards/missing-id/load')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({})
      .expect(404);

    expect(response.body.success).toBe(false);
  });

  it('rejects tenant from loading saved dashboard', async () => {
    const response = await request(app)
      .post('/api/v1/saved-dashboards/saved-dashboard-1/load')
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .send({})
      .expect(403);

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
