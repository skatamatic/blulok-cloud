import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { WebsocketGatewayTransport } from '@/services/gateway/websocket-gateway.transport';
import {
  generateP256KeyPair,
  buildZtpSignPayload,
  signZtpPayload,
  ZTP_GW_AUTH_PREFIX,
} from '@/services/gateway/ztp/gateway-ztp-crypto.utils';

const BOUND_GATEWAY_ID = '11111111-1111-4111-8111-111111111111';
const ZTP_GATEWAY_ID = '22222222-2222-4222-8222-222222222222';
const FACILITY_ID = 'facility-ztp-1';

const mockFindById = jest.fn();
const mockFindByFacilityId = jest.fn();
const mockCreateOrBind = jest.fn();
const mockDetect = jest.fn().mockResolvedValue(undefined);

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: (...args: unknown[]) => mockFindByFacilityId(...args),
    findById: (...args: unknown[]) => mockFindById(...args),
    createOrBindAsFirstGateway: (...args: unknown[]) => mockCreateOrBind(...args),
    createUnboundSwapCandidateIfAbsent: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    updateStatusAndLastSeen: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    detect: (...args: unknown[]) => mockDetect(...args),
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
    resumePendingForFacility: jest.fn().mockResolvedValue(undefined),
  },
}));

function waitForMessage(ws: WebSocket, timeoutMs = 4000): Promise<Record<string, unknown>> {
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
    } catch {
      /* ignore */
    }
  });
  return ws;
}

async function ztpAuth(
  port: number,
  params: {
    gatewayId: string;
    privateKeyPem: string;
    facilityId?: string;
  },
): Promise<{ ws: WebSocket; reply: Record<string, unknown> }> {
  const ws = await openWs(port);
  ws.send(
    JSON.stringify({
      type: 'AUTH_HELLO',
      gatewayId: params.gatewayId,
      facilityId: params.facilityId,
    }),
  );
  const challenge = await waitForMessage(ws);
  expect(challenge.type).toBe('AUTH_CHALLENGE');
  const nonce = String(challenge.nonce);
  const payload = buildZtpSignPayload(ZTP_GW_AUTH_PREFIX, nonce, params.gatewayId);
  const signature = signZtpPayload(params.privateKeyPem, payload);
  ws.send(JSON.stringify({ type: 'AUTH_PROOF', signature }));
  const reply = await waitForMessage(ws);
  return { ws, reply };
}

describe('WebsocketGatewayTransport ZTP AUTH', () => {
  let server: http.Server;
  let port: number;
  let transport: WebsocketGatewayTransport;
  let keys: ReturnType<typeof generateP256KeyPair>;

  beforeAll((done) => {
    keys = generateP256KeyPair();
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
    try {
      for (const facilityId of transport.getConnectedFacilityIds()) {
        transport.forceDisconnectFacility(facilityId, 'test_cleanup');
      }
    } catch {
      /* ignore */
    }
    GatewayEventsService.getInstance().shutdown();
    server.close(() => done());
  }, 20000);

  beforeEach(() => {
    jest.clearAllMocks();
    for (const facilityId of transport.getConnectedFacilityIds()) {
      transport.forceDisconnectFacility(facilityId, 'test_cleanup');
    }
  });

  it('AUTH_OK active for bound ZTP greenfield gateway', async () => {
    mockFindById.mockResolvedValue({
      id: ZTP_GATEWAY_ID,
      facility_id: FACILITY_ID,
      public_key: keys.publicKeyCompressedB64url,
      revoked_at: null,
    });
    mockFindByFacilityId.mockResolvedValue({ id: ZTP_GATEWAY_ID, facility_id: FACILITY_ID });

    const { ws, reply } = await ztpAuth(port, {
      gatewayId: ZTP_GATEWAY_ID,
      privateKeyPem: keys.privateKeyPem,
      facilityId: FACILITY_ID,
    });

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('active');
    expect(reply.facilityId).toBe(FACILITY_ID);
    expect(reply.gatewayId).toBe(ZTP_GATEWAY_ID);
    expect(transport.getConnectedFacilityIds()).toContain(FACILITY_ID);
    expect(transport.getSwapCandidatesForFacility(FACILITY_ID)).toEqual([]);
    ws.close();
  });

  it('parks swap_candidate without displacing the active JWT session', async () => {
    // Active production session via JWT
    mockFindById.mockImplementation(async (id: string) => {
      if (id === BOUND_GATEWAY_ID) {
        return { id: BOUND_GATEWAY_ID, facility_id: FACILITY_ID };
      }
      return {
        id: ZTP_GATEWAY_ID,
        facility_id: null,
        public_key: keys.publicKeyCompressedB64url,
        revoked_at: null,
        metadata: { ztpIntendedFacilityId: FACILITY_ID, provisionedVia: 'ztp_sticker' },
      };
    });
    mockFindByFacilityId.mockResolvedValue({ id: BOUND_GATEWAY_ID, facility_id: FACILITY_ID });

    const activeWs = await openWs(port);
    activeWs.send(
      JSON.stringify({
        type: 'AUTH',
        token: 'mock-jwt-token',
        facilityId: FACILITY_ID,
        gatewayId: BOUND_GATEWAY_ID,
      }),
    );
    const activeOk = await waitForMessage(activeWs);
    expect(activeOk.type).toBe('AUTH_OK');
    expect(activeOk.sessionRole).toBe('active');
    expect(activeOk.gatewayId).toBe(BOUND_GATEWAY_ID);

    const { ws: swapWs, reply } = await ztpAuth(port, {
      gatewayId: ZTP_GATEWAY_ID,
      privateKeyPem: keys.privateKeyPem,
      facilityId: FACILITY_ID,
    });

    expect(reply.type).toBe('AUTH_OK');
    expect(reply.sessionRole).toBe('swap_candidate');
    expect(activeWs.readyState).toBe(WebSocket.OPEN);
    expect(transport.getConnectedFacilityIds()).toContain(FACILITY_ID);
    expect(transport.getSwapCandidatesForFacility(FACILITY_ID)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gatewayId: ZTP_GATEWAY_ID, connected: true }),
      ]),
    );
    expect(mockDetect).toHaveBeenCalledWith(FACILITY_ID, ZTP_GATEWAY_ID, BOUND_GATEWAY_ID);

    activeWs.close();
    swapWs.close();
  });

  it('rejects human JWT AUTH for rows with public_key', async () => {
    mockFindById.mockResolvedValue({
      id: ZTP_GATEWAY_ID,
      facility_id: FACILITY_ID,
      public_key: keys.publicKeyCompressedB64url,
      revoked_at: null,
    });
    mockFindByFacilityId.mockResolvedValue({ id: ZTP_GATEWAY_ID });

    const ws = await openWs(port);
    ws.send(
      JSON.stringify({
        type: 'AUTH',
        token: 'mock-jwt-token',
        facilityId: FACILITY_ID,
        gatewayId: ZTP_GATEWAY_ID,
      }),
    );
    const reply = await waitForMessage(ws);
    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_FORBIDDEN');
    expect(String(reply.message)).toMatch(/AUTH_HELLO/);
    ws.close();
  });

  it('rejects ZTP AUTH after release (released_at set)', async () => {
    mockFindById.mockResolvedValue({
      id: ZTP_GATEWAY_ID,
      facility_id: null,
      public_key: keys.publicKeyCompressedB64url,
      revoked_at: null,
      released_at: new Date().toISOString(),
      metadata: { ztpIntendedFacilityId: FACILITY_ID },
    });

    const ws = await openWs(port);
    ws.send(
      JSON.stringify({
        type: 'AUTH_HELLO',
        gatewayId: ZTP_GATEWAY_ID,
        facilityId: FACILITY_ID,
      }),
    );
    const reply = await waitForMessage(ws);
    expect(reply.type).toBe('ERROR');
    expect(reply.code).toBe('AUTH_FAILED');
    expect(String(reply.message)).toMatch(/provision/);
    ws.close();
  });

  it('forceDisconnectGatewayById closes parked swap candidates', async () => {
    mockFindById.mockImplementation(async (id: string) => {
      if (id === BOUND_GATEWAY_ID) {
        return { id: BOUND_GATEWAY_ID, facility_id: FACILITY_ID };
      }
      return {
        id: ZTP_GATEWAY_ID,
        facility_id: null,
        public_key: keys.publicKeyCompressedB64url,
        revoked_at: null,
        metadata: { ztpIntendedFacilityId: FACILITY_ID },
      };
    });
    mockFindByFacilityId.mockResolvedValue({ id: BOUND_GATEWAY_ID, facility_id: FACILITY_ID });

    const activeWs = await openWs(port);
    activeWs.send(
      JSON.stringify({
        type: 'AUTH',
        token: 'mock-jwt-token',
        facilityId: FACILITY_ID,
        gatewayId: BOUND_GATEWAY_ID,
      }),
    );
    expect((await waitForMessage(activeWs)).type).toBe('AUTH_OK');

    const { ws: swapWs } = await ztpAuth(port, {
      gatewayId: ZTP_GATEWAY_ID,
      privateKeyPem: keys.privateKeyPem,
      facilityId: FACILITY_ID,
    });
    expect(transport.getSwapCandidatesForFacility(FACILITY_ID).length).toBeGreaterThan(0);

    const closed = new Promise<void>((resolve) => {
      swapWs.once('close', () => resolve());
    });
    transport.forceDisconnectGatewayById(ZTP_GATEWAY_ID, 'ztp_revoked');
    await closed;
    expect(activeWs.readyState).toBe(WebSocket.OPEN);
    expect(transport.getSwapCandidatesForFacility(FACILITY_ID)).toEqual([]);
    activeWs.close();
  });
});
