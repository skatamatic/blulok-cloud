import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, MockTestData, expectSuccess, expectForbidden, expectUnauthorized } from '@/__tests__/utils/mock-test-helpers';

const mockDeleteUnit = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/units.service', () => ({
  UnitsService: {
    getInstance: jest.fn().mockReturnValue({
      deleteUnit: (...args: unknown[]) => mockDeleteUnit(...args),
    }),
  },
}));

jest.mock('@/services/websocket.service', () => ({
  WebSocketService: {
    getInstance: jest.fn().mockReturnValue({
      broadcastUnitsUpdate: jest.fn().mockResolvedValue(undefined),
      broadcastBatteryStatusUpdate: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('DELETE /api/v1/units/:unitId', () => {
  let app: any;
  let testData: MockTestData;

  beforeAll(async () => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockDeleteUnit.mockClear();
  });

  it('requires authentication', async () => {
    const res = await request(app).delete(`/api/v1/units/${testData.units.unit1.id}`);
    expect(res.status).toBe(401);
    expectUnauthorized(res);
  });

  it('deletes unit for ADMIN', async () => {
    const res = await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expectSuccess(res);
    expect(res.body.data?.unit_id).toBe(testData.units.unit1.id);
    expect(mockDeleteUnit).toHaveBeenCalledWith(
      testData.units.unit1.id,
      testData.users.admin.id,
      'admin',
    );
  });

  it('deletes unit for DEV_ADMIN', async () => {
    await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.devAdmin.token}`)
      .expect(200);

    expect(mockDeleteUnit).toHaveBeenCalled();
  });

  it('deletes unit for FACILITY_ADMIN', async () => {
    await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(mockDeleteUnit).toHaveBeenCalled();
  });

  it('forbids TENANT', async () => {
    const res = await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.tenant.token}`)
      .expect(403);

    expectForbidden(res);
    expect(mockDeleteUnit).not.toHaveBeenCalled();
  });

  it('returns 404 when service reports unit not found', async () => {
    mockDeleteUnit.mockRejectedValueOnce(new Error('Unit not found'));

    const res = await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
  });

  it('returns 403 when service reports access denied', async () => {
    mockDeleteUnit.mockRejectedValueOnce(new Error('Access denied: You do not have permission to delete this unit'));

    const res = await request(app)
      .delete(`/api/v1/units/${testData.units.unit1.id}`)
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });
});
