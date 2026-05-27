import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

const mockList = jest.fn();

jest.mock('@/services/gateway-telemetry-log.service', () => ({
  GatewayTelemetryLogService: {
    getInstance: jest.fn().mockReturnValue({
      list: (...args: unknown[]) => mockList(...args),
    }),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gateway-1') {
        return { id: 'gateway-1', facility_id: 'facility-1', name: 'GW' };
      }
      if (id === 'gateway-other') {
        return { id: 'gateway-other', facility_id: 'facility-other', name: 'Other GW' };
      }
      return null;
    }),
  })),
}));

describe('GET /api/v1/gateways/:id/telemetry-logs', () => {
  let app: any;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockList.mockReset();
    mockList.mockResolvedValue({
      logs: [
        {
          id: 'log-1',
          gateway_id: 'gateway-1',
          facility_id: 'facility-1',
          logged_at: new Date().toISOString(),
          payload: { message: 'test' },
          source: 'gateway_ws',
          created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/gateways/gateway-1/telemetry-logs');
    expectUnauthorized(res);
  });

  it('allows facility admin for assigned facility gateway', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-1/telemetry-logs')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.hasMore).toBe(false);
    expect(mockList).toHaveBeenCalledWith(
      'gateway-1',
      expect.objectContaining({}),
      expect.objectContaining({ limit: 500, offset: 0 }),
    );
  });

  it('denies facility admin for other facility gateway', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-other/telemetry-logs')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('passes query filters to service', async () => {
    await request(app)
      .get('/api/v1/gateways/gateway-1/telemetry-logs')
      .query({
        search: 'lock',
        payload_path: 'data.lock_id',
        payload_value: 'abc',
        payload_op: 'contains',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.999Z',
        limit: 100,
        offset: 50,
      })
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expect(mockList).toHaveBeenCalledWith(
      'gateway-1',
      expect.objectContaining({
        search: 'lock',
        payload_path: 'data.lock_id',
        payload_value: 'abc',
        payload_op: 'contains',
      }),
      expect.objectContaining({ limit: 100, offset: 50 }),
    );
  });

  it('rejects invalid payload_path', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-1/telemetry-logs')
      .query({ payload_path: 'data.$invalid', payload_value: 'x' })
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
