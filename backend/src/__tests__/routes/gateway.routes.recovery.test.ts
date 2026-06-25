import request from 'supertest';
import { createApp } from '@/app';
import { createMockTestData, expectUnauthorized, expectForbidden } from '@/__tests__/utils/mock-test-helpers';

const mockGetStatusForGateway = jest.fn();
const mockGetStatusForFacility = jest.fn();
const mockGetSwapCandidates = jest.fn();
const mockGetRecoveryEvents = jest.fn();
const mockGetRecoveryById = jest.fn();
const mockGetRecoveryOptions = jest.fn();
const mockInitiate = jest.fn();
const mockBypass = jest.fn();
const mockRetry = jest.fn();
const mockCancel = jest.fn();

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    getStatusForGateway: (...args: unknown[]) => mockGetStatusForGateway(...args),
    getStatusForFacility: (...args: unknown[]) => mockGetStatusForFacility(...args),
    getSwapCandidates: (...args: unknown[]) => mockGetSwapCandidates(...args),
    getRecoveryOptions: (...args: unknown[]) => mockGetRecoveryOptions(...args),
    getRecoveryEvents: (...args: unknown[]) => mockGetRecoveryEvents(...args),
    getRecoveryById: (...args: unknown[]) => mockGetRecoveryById(...args),
    initiate: (...args: unknown[]) => mockInitiate(...args),
    bypass: (...args: unknown[]) => mockBypass(...args),
    retry: (...args: unknown[]) => mockRetry(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
  },
}));

jest.mock('@/services/gateway/inventory-snapshot.service', () => ({
  InventorySnapshotService: {
    previewForFacility: jest.fn().mockResolvedValue([{ kind: 'lock', serial: 'L-1' }]),
  },
}));

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gateway-bound') {
        return { id: 'gateway-bound', facility_id: 'facility-1', name: 'Bound Gateway' };
      }
      if (id === 'gateway-swap') {
        return { id: 'gateway-swap', facility_id: null, name: 'Swap Candidate' };
      }
      if (id === 'gateway-other-facility') {
        return { id: 'gateway-other-facility', facility_id: 'facility-2', name: 'Other Gateway' };
      }
      return null;
    }),
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  })),
}));

describe('Gateway Recovery Routes', () => {
  let app: ReturnType<typeof createApp>;
  let testData: ReturnType<typeof createMockTestData>;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    testData = createMockTestData();
    jest.clearAllMocks();
    mockGetSwapCandidates.mockReturnValue([{ gatewayId: 'gateway-swap', connected: true }]);
    mockGetStatusForFacility.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'facility-1',
      gateway_id: 'gateway-swap',
      status: 'detected',
    });
    mockGetStatusForGateway.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'facility-1',
      gateway_id: 'gateway-swap',
      status: 'detected',
    });
    mockGetRecoveryOptions.mockResolvedValue({
      firmwareOptions: [{ id: 'fw-1', version: '1.0.0', label: '1.0.0' }],
      defaultFirmwareId: 'fw-1',
    });
    mockGetRecoveryById.mockResolvedValue({
      id: 'rec-1',
      facility_id: 'facility-1',
      gateway_id: 'gateway-swap',
      status: 'detected',
    });
  });

  it('requires auth for recovery status', async () => {
    const res = await request(app).get('/api/v1/gateways/gateway-swap/recovery/status');
    expectUnauthorized(res);
  });

  it('returns recovery status for swap candidate via recovery facility scope', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-swap/recovery/status')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('detected');
    expect(mockGetStatusForGateway).toHaveBeenCalledWith('gateway-swap');
  });

  it('lists swap candidates for a facility', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/facility/facility-1/recovery/candidates')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.data.candidates).toEqual([{ gatewayId: 'gateway-swap', connected: true }]);
    expect(mockGetSwapCandidates).toHaveBeenCalledWith('facility-1');
  });

  it('forbids recovery candidates for another facility', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/facility/facility-2/recovery/candidates')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`);

    expectForbidden(res);
  });

  it('returns recovery options for authorized gateway', async () => {
    const res = await request(app)
      .get('/api/v1/gateways/gateway-swap/recovery/options')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.data.defaultFirmwareId).toBe('fw-1');
    expect(mockGetRecoveryOptions).toHaveBeenCalledWith('gateway-swap', 'facility-1');
  });

  it('initiates recovery with firmware selection', async () => {
    const firmwareId = '11111111-1111-4111-8111-111111111111';
    mockInitiate.mockResolvedValueOnce({
      id: 'rec-1',
      status: 'firmware',
      gateway_id: 'gateway-swap',
      facility_id: 'facility-1',
      firmware_id: firmwareId,
    });

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/initiate')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ firmwareId })
      .expect(200);

    expect(res.body.data.status).toBe('firmware');
    expect(mockInitiate).toHaveBeenCalledWith(
      'gateway-swap',
      'facility-1',
      testData.users.facilityAdmin.id,
      { firmwareId },
    );
  });

  it('rejects bypass without confirm flag', async () => {
    mockBypass.mockRejectedValueOnce(new Error('Bypass requires confirm: true'));

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/bypass')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ confirm: false })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/confirm/i);
  });

  it('forbids bypass for facility admin', async () => {
    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/bypass')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .send({ confirm: true });

    expectForbidden(res);
    expect(mockBypass).not.toHaveBeenCalled();
  });

  it('passes confirm and user id to bypass service', async () => {
    mockBypass.mockResolvedValueOnce({
      id: 'rec-1',
      status: 'bypassed',
      gateway_id: 'gateway-swap',
      facility_id: 'facility-1',
    });

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/bypass')
      .set('Authorization', `Bearer ${testData.users.admin.token}`)
      .send({ confirm: true })
      .expect(200);

    expect(res.body.data.status).toBe('bypassed');
    expect(mockBypass).toHaveBeenCalledWith(
      'gateway-swap',
      'facility-1',
      testData.users.admin.id,
      true,
    );
  });

  it('returns 400 when retry is not allowed', async () => {
    mockRetry.mockRejectedValueOnce(new Error('Retry is only available when recovery has failed'));

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/retry')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(400);

    expect(res.body.message).toMatch(/failed/i);
  });

  it('cancels recovery when id matches gateway latest status', async () => {
    mockCancel.mockResolvedValueOnce(undefined);

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/rec-1/cancel')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(mockCancel).toHaveBeenCalledWith('rec-1');
  });

  it('returns recovery events for matching recovery id', async () => {
    mockGetRecoveryEvents.mockResolvedValueOnce([
      { id: 'evt-1', phase: 'firmware', message: 'Starting firmware', progress_percent: 10, created_at: new Date() },
    ]);

    const res = await request(app)
      .get('/api/v1/gateways/gateway-swap/recovery/rec-1/events')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(200);

    expect(res.body.data.events).toHaveLength(1);
    expect(mockGetRecoveryEvents).toHaveBeenCalledWith('rec-1', 100);
  });

  it('returns 404 when cancel recovery id does not match gateway status', async () => {
    mockGetRecoveryById.mockResolvedValueOnce({
      id: 'rec-other',
      facility_id: 'facility-1',
      gateway_id: 'gateway-swap',
      status: 'detected',
    });

    const res = await request(app)
      .post('/api/v1/gateways/gateway-swap/recovery/rec-1/cancel')
      .set('Authorization', `Bearer ${testData.users.facilityAdmin.token}`)
      .expect(404);

    expect(res.body.message).toMatch(/not found/i);
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
