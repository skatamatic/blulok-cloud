import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

const mockUpdate = jest.fn().mockResolvedValue({});
const mockFindByFacilityId = jest.fn();
const mockFindById = jest.fn();

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    createUnboundSwapCandidateIfAbsent: jest.fn(),
    createOrBindAsFirstGateway: jest.fn(),
    update: (...args: unknown[]) => mockUpdate(...args),
    updateStatusAndLastSeen: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    detect: jest.fn().mockResolvedValue(undefined),
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
    resumePendingForFacility: jest.fn().mockResolvedValue(undefined),
  },
}));

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ws message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(typeof data === 'string' ? data : data.toString('utf8')));
      } catch {
        resolve({});
      }
    });
  });
}

describe('WebsocketGatewayTransport AUTH firmware_version', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = createIntegrationTestApp();
    server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      process.env.GATEWAY_PROXY_BASE_URL = `http://127.0.0.1:${port}/api/v1`;
      GatewayEventsService.getInstance().initialize(server);
      done();
    });
  });

  afterAll((done) => {
    GatewayEventsService.getInstance().shutdown();
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindByFacilityId.mockResolvedValue({ id: 'gw-bound', status: 'offline', name: 'GW' });
    mockFindById.mockResolvedValue({ id: 'gw-bound', facility_id: 'facility-1', status: 'offline' });
  });

  it('persists firmware_version from AUTH for bound gateway reconnect', async () => {
    const gatewayId = '11111111-1111-4111-8111-111111111111';
    mockFindByFacilityId.mockResolvedValue({ id: gatewayId, status: 'offline', name: 'GW' });
    mockFindById.mockResolvedValue({ id: gatewayId, facility_id: 'facility-1', status: 'offline' });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.send(JSON.stringify({
      type: 'AUTH',
      token: 'mock-jwt-token',
      facilityId: 'facility-1',
      gatewayId,
      firmware_version: '2.10.0',
    }));
    const reply = await waitForMessage(ws);
    expect(reply.type).toBe('AUTH_OK');
    expect(mockUpdate).toHaveBeenCalledWith(gatewayId, { firmware_version: '2.10.0' });
    ws.close();
  });

  it('rejects AUTH without gatewayId', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.send(JSON.stringify({
      type: 'AUTH',
      token: 'mock-jwt-token',
      facilityId: 'facility-1',
      firmware_version: '9.9.9',
    }));
    const reply = await waitForMessage(ws);
    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_BAD_REQUEST');
    expect(mockUpdate).not.toHaveBeenCalled();
    ws.close();
  });

  it('skips persist when firmware_version is omitted', async () => {
    const gatewayId = '11111111-1111-4111-8111-111111111111';
    mockFindByFacilityId.mockResolvedValue({ id: gatewayId, status: 'offline', name: 'GW' });
    mockFindById.mockResolvedValue({ id: gatewayId, facility_id: 'facility-1', status: 'offline' });

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.send(JSON.stringify({
      type: 'AUTH',
      token: 'mock-jwt-token',
      facilityId: 'facility-1',
      gatewayId,
    }));
    const reply = await waitForMessage(ws);
    expect(reply.type).toBe('AUTH_OK');
    expect(mockUpdate).not.toHaveBeenCalled();
    ws.close();
  });
});
