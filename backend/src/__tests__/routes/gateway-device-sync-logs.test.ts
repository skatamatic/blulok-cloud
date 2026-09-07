import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

const mockListForGateway = jest.fn();

jest.mock('@/services/gateway-device-sync-log.service', () => ({
  GatewayDeviceSyncLogService: {
    getInstance: jest.fn().mockReturnValue({
      listForGateway: (...args: unknown[]) => mockListForGateway(...args),
    }),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gateway-1') {
        return { id: 'gateway-1', facility_id: 'facility-1', name: 'GW' };
      }
      return null;
    }),
  })),
}));

describe('GET /api/v1/gateways/:id/device-sync-logs', () => {
  let app: any;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    mockListForGateway.mockReset();
    mockListForGateway.mockResolvedValue({
      logs: [
        {
          id: 'sync-log-1',
          gateway_id: 'gateway-1',
          facility_id: 'facility-1',
          sync_kind: 'inventory',
          source: 'gateway_ws',
          summary: { locks: { added: 1, removed: 0, unchanged: 0, errors: [] } },
          entries: [],
          created_at: new Date(),
        },
      ],
      total: 2,
    });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/gateways/gateway-1/device-sync-logs');
    expectUnauthorized(res);
  });

  it('allows platform admin to list sync logs', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-1/device-sync-logs')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.hasMore).toBe(true);
    expect(mockListForGateway).toHaveBeenCalledWith('gateway-1', { limit: 20, offset: 0 });
  });

  it('denies facility admin', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-1/device-sync-logs')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('returns 404 for unknown gateway', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/missing-gateway/device-sync-logs')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(404);

    expect(res.body.success).toBe(false);
  });

  it('passes pagination params', async () => {
    await request(app)
      .get('/api/v1/gateways/gateway-1/device-sync-logs')
      .query({ limit: 50, offset: 25 })
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .expect(200);

    expect(mockListForGateway).toHaveBeenCalledWith('gateway-1', { limit: 50, offset: 25 });
  });
});
