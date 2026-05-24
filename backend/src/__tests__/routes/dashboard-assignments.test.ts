import request from 'supertest';
import { createApp } from '@/app';
import {
  createMockTestData,
  MockTestData,
  expectUnauthorized,
  expectSuccess,
} from '@/__tests__/utils/mock-test-helpers';
import { DashboardAssignmentModel } from '@/models/saved-dashboard.model';

describe('Dashboard Assignments Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: MockTestData;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/dashboard-assignments');
    expectUnauthorized(response);
  });

  it('rejects non-admin roles', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);
    expect(response.status).toBe(403);
  });

  it('allows admin to list assignments', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.admin.token}`);
    expectSuccess(response);
    expect(response.body.assignments).toEqual([]);
  });

  it('rejects invalid create payload', async () => {
    const response = await request(app)
      .post('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ scope: 'global' });
    expect(response.status).toBe(400);
  });

  it('maps create validation errors to 400', async () => {
    (DashboardAssignmentModel.createAssignment as jest.Mock).mockRejectedValueOnce(
      new Error('User role (tenant) does not match target role (facility_admin)')
    );

    const response = await request(app)
      .post('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({
        savedDashboardId: '11111111-1111-1111-1111-111111111111',
        scope: 'user',
        userId: '33333333-3333-3333-3333-333333333333',
        targetRole: 'facility_admin',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('does not match target role');
  });

  it('maps duplicate slot errors to 409', async () => {
    (DashboardAssignmentModel.createAssignment as jest.Mock).mockRejectedValueOnce(
      new Error('An assignment already exists for this role and scope target')
    );

    const response = await request(app)
      .post('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({
        savedDashboardId: '11111111-1111-1111-1111-111111111111',
        scope: 'global',
        targetRole: 'facility_admin',
      });

    expect(response.status).toBe(409);
  });

  it('creates assignment successfully', async () => {
    (DashboardAssignmentModel.createAssignment as jest.Mock).mockResolvedValueOnce({
      id: 'assignment-1',
      saved_dashboard_id: '11111111-1111-1111-1111-111111111111',
      scope: 'global',
      facility_id: null,
      user_id: null,
      target_role: 'facility_admin',
      priority: 0,
    });

    const response = await request(app)
      .post('/api/v1/dashboard-assignments')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({
        savedDashboardId: '11111111-1111-1111-1111-111111111111',
        scope: 'global',
        targetRole: 'facility_admin',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.assignment.id).toBe('assignment-1');
  });

  it('updates assignment template and priority', async () => {
    (DashboardAssignmentModel.findById as jest.Mock).mockResolvedValueOnce({
      id: 'assignment-1',
      saved_dashboard_id: '11111111-1111-1111-1111-111111111111',
      scope: 'global',
      facility_id: null,
      user_id: null,
      target_role: 'facility_admin',
      priority: 0,
    });
    (DashboardAssignmentModel.updateAssignment as jest.Mock).mockResolvedValueOnce({
      id: 'assignment-1',
      saved_dashboard_id: '22222222-2222-2222-2222-222222222222',
      scope: 'global',
      facility_id: null,
      user_id: null,
      target_role: 'facility_admin',
      priority: 10,
    });

    const response = await request(app)
      .patch('/api/v1/dashboard-assignments/assignment-1')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({
        savedDashboardId: '22222222-2222-2222-2222-222222222222',
        priority: 10,
      });

    expectSuccess(response);
    expect(response.body.assignment.priority).toBe(10);
  });

  it('returns 404 when updating missing assignment', async () => {
    (DashboardAssignmentModel.findById as jest.Mock).mockResolvedValueOnce(undefined);

    const response = await request(app)
      .patch('/api/v1/dashboard-assignments/missing-id')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ priority: 1 });

    expect(response.status).toBe(404);
  });
});
