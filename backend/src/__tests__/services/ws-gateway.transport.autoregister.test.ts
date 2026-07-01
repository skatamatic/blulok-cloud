import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { WebsocketGatewayTransport } from '@/services/gateway/websocket-gateway.transport';

const mockDetect = jest.fn().mockResolvedValue({ id: 'rec-auto' });
const mockCreateUnbound = jest.fn();
const mockCreateOrBind = jest.fn();
const mockLogActivity = jest.fn().mockResolvedValue(undefined);
const mockFindById = jest.fn();
const mockFindByFacilityId = jest.fn();

// Facilities prefixed with `bound-` already have a bound gateway; everything else is empty.
const OTHER_FACILITY_GUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EXISTING_UNBOUND_GUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOUND_GATEWAY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    createUnboundSwapCandidateIfAbsent: (...args: unknown[]) => mockCreateUnbound(...args),
    createOrBindAsFirstGateway: (...args: unknown[]) => mockCreateOrBind(...args),
  })),
}));

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    detect: (...args: unknown[]) => mockDetect(...args),
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
    resumePendingForFacility: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/activity.service', () => ({
  ActivityService: {
    getInstance: () => ({ logActivity: (...args: unknown[]) => mockLogActivity(...args) }),
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

async function openWs(port: number): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
      if (msg?.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
    } catch { /* ignore */ }
  });
  return ws;
}

async function auth(port: number, facilityId: string, gatewayId: string): Promise<{ ws: WebSocket; reply: Record<string, unknown> }> {
  const ws = await openWs(port);
  const payload: Record<string, string> = { type: 'AUTH', token: 'mock-jwt-token', facilityId, gatewayId };
  ws.send(JSON.stringify(payload));
  const reply = await waitForMessage(ws);
  return { ws, reply };
}

describe('WebsocketGatewayTransport auto-registration', () => {
  let server: http.Server;
  let port: number;
  let transport: WebsocketGatewayTransport;

  beforeAll((done) => {
    const app = createIntegrationTestApp();
    server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      port = typeof address === 'object' && address ? address.port : 0;
      process.env.GATEWAY_PROXY_BASE_URL = `http://127.0.0.1:${port}/api/v1`;
      GatewayEventsService.getInstance().initialize(server);
      transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      done();
    });
  });

  afterAll((done) => {
    GatewayEventsService.getInstance().shutdown();
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindByFacilityId.mockImplementation(async (facilityId: string) =>
      String(facilityId).startsWith('bound-') ? { id: BOUND_GATEWAY_ID } : null,
    );
    mockFindById.mockImplementation(async (id: string) => {
      if (id === OTHER_FACILITY_GUID) return { id, facility_id: 'someone-else' };
      if (id === EXISTING_UNBOUND_GUID) return { id, facility_id: null };
      return null;
    });
    mockCreateUnbound.mockResolvedValue({ created: true, gateway: { id: 'created' } });
    mockCreateOrBind.mockResolvedValue({ bound: true, created: true, gateway: { id: 'created' } });
  });

  it('auto-registers an unknown GUID as swap candidate when a bound gateway exists', async () => {
    const facilityId = 'bound-fac-A';
    const newGuid = '11111111-1111-4111-8111-111111111111';

    const bound = await auth(port, facilityId, BOUND_GATEWAY_ID);
    const { ws: swapWs, reply } = await auth(port, facilityId, newGuid);

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('swap_candidate');
    expect(reply.autoRegistered).toBe(true);
    expect(mockCreateUnbound).toHaveBeenCalledWith(expect.objectContaining({ id: newGuid }));
    expect(mockDetect).toHaveBeenCalledWith(facilityId, newGuid, BOUND_GATEWAY_ID);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'gateway',
      metadata: expect.objectContaining({ autoRegistered: true, bound: false }),
    }));

    expect(bound.ws.readyState).toBe(WebSocket.OPEN);
    expect(transport.getSwapCandidatesForFacility(facilityId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ gatewayId: newGuid, connected: true }),
    ]));

    bound.ws.close();
    swapWs.close();
  });

  it('auto-registers and binds the first gateway for an empty facility', async () => {
    const facilityId = 'empty-fac-A';
    const newGuid = '22222222-2222-4222-8222-222222222222';

    const { ws, reply } = await auth(port, facilityId, newGuid);

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('active');
    expect(reply.autoRegistered).toBe(true);
    expect(mockCreateOrBind).toHaveBeenCalledWith(expect.objectContaining({ id: newGuid, facilityId }));
    expect(mockDetect).not.toHaveBeenCalled();

    ws.close();
  });

  it('does not set autoRegistered on reconnect when the gateway row already exists', async () => {
    const facilityId = 'bound-fac-reconnect';
    const { ws, reply } = await auth(port, facilityId, EXISTING_UNBOUND_GUID);

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('swap_candidate');
    expect(reply.autoRegistered).toBe(false);
    expect(mockCreateUnbound).not.toHaveBeenCalled();

    ws.close();
  });

  it('parks as swap candidate and creates row when first-install bind race is lost', async () => {
    const facilityId = 'race-fac-A';
    const newGuid = '44444444-4444-4444-8444-444444444444';
    mockFindByFacilityId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'gw-winner-race' });
    mockCreateOrBind.mockResolvedValueOnce({ bound: false, created: false, gateway: null });

    const { ws, reply } = await auth(port, facilityId, newGuid);

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('swap_candidate');
    expect(reply.autoRegistered).toBe(true);
    expect(mockCreateUnbound).toHaveBeenCalledWith(expect.objectContaining({ id: newGuid }));
    expect(mockDetect).toHaveBeenCalledWith(facilityId, newGuid, 'gw-winner-race');

    ws.close();
  });

  it('rejects a malformed (non-UUID) GUID before creating a record', async () => {
    const facilityId = 'bound-fac-B';
    const { ws, reply } = await auth(port, facilityId, 'not-a-uuid');

    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_BAD_REQUEST');
    expect(mockCreateUnbound).not.toHaveBeenCalled();

    try { ws.close(); } catch { /* already closed */ }
  });

  it('rejects a GUID that belongs to another facility', async () => {
    const facilityId = 'bound-fac-C';
    const { ws, reply } = await auth(port, facilityId, OTHER_FACILITY_GUID);

    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_FORBIDDEN');
    expect(mockCreateUnbound).not.toHaveBeenCalled();

    try { ws.close(); } catch { /* already closed */ }
  });

  it('enforces the per-facility swap candidate cap', async () => {
    const facilityId = 'bound-fac-D';
    const guids = [
      '33333333-3333-4333-8333-333333333331',
      '33333333-3333-4333-8333-333333333332',
      '33333333-3333-4333-8333-333333333333',
    ];
    const live = await auth(port, facilityId, BOUND_GATEWAY_ID);
    const parked: WebSocket[] = [];
    for (const guid of guids) {
      const { ws, reply } = await auth(port, facilityId, guid);
      expect(reply.sessionRole).toBe('swap_candidate');
      parked.push(ws);
    }

    const overflow = await auth(port, facilityId, '33333333-3333-4333-8333-333333333334');
    expect(overflow.reply.type).toBe('ERROR');
    expect(overflow.reply.code).toBe('AUTH_FORBIDDEN');
    expect(String(overflow.reply.message)).toMatch(/limit/i);

    live.ws.close();
    parked.forEach((ws) => { try { ws.close(); } catch { /* ignore */ } });
    try { overflow.ws.close(); } catch { /* ignore */ }
  });

  it('returns AUTH_FAILED when auto-register persistence throws', async () => {
    mockCreateUnbound.mockRejectedValueOnce(new Error('db unavailable'));
    const { ws, reply } = await auth(port, 'bound-fac-err', '55555555-5555-4555-8555-555555555555');

    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_FAILED');
    expect(String(reply.message)).toMatch(/registration failed/i);

    try { ws.close(); } catch { /* already closed */ }
  });
});
