import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { WebsocketGatewayTransport } from '@/services/gateway/websocket-gateway.transport';

const mockDetect = jest.fn().mockResolvedValue({ id: 'rec-1' });
const BOUND_GATEWAY_ID = '10000000-0000-4000-8000-000000000001';
const SWAP_GATEWAY_ID = '20000000-0000-4000-8000-000000000002';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: '10000000-0000-4000-8000-000000000001' }),
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === '20000000-0000-4000-8000-000000000002') return { id: '20000000-0000-4000-8000-000000000002', facility_id: null };
      if (id === '10000000-0000-4000-8000-000000000001') return { id: '10000000-0000-4000-8000-000000000001', facility_id: 'facility-1' };
      return null;
    }),
  })),
}));

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    detect: (...args: unknown[]) => mockDetect(...args),
    isBlockingActiveForFacilitySync: jest.fn().mockReturnValue(false),
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

function waitForClose(ws: WebSocket, timeoutMs = 3000): Promise<void> {
  if (ws.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for ws close')), timeoutMs);
    ws.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function authGatewayWs(
  port: number,
  facilityId: string,
  gatewayId: string,
): Promise<WebSocket> {
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
  const authPayload: Record<string, string> = { type: 'AUTH', token: 'mock-jwt-token', facilityId, gatewayId };
  ws.send(JSON.stringify(authPayload));
  const authOk = await waitForMessage(ws);
  if (authOk?.type !== 'AUTH_OK') {
    throw new Error(`AUTH failed: ${JSON.stringify(authOk)}`);
  }
  return ws;
}

describe('WebsocketGatewayTransport recovery routing', () => {
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
    for (const facilityId of transport.getConnectedFacilityIds()) {
      transport.forceDisconnectFacility(facilityId, 'test_cleanup');
    }
    transport.forceDisconnectGatewayById(BOUND_GATEWAY_ID, 'test_cleanup');
    transport.forceDisconnectGatewayById(SWAP_GATEWAY_ID, 'test_cleanup');
    // Let in-flight close handlers settle before tearing down the Jest environment.
    setTimeout(() => {
      GatewayEventsService.getInstance().shutdown();
      server.close(() => done());
    }, 50);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    for (const facilityId of transport.getConnectedFacilityIds()) {
      transport.forceDisconnectFacility(facilityId, 'test_cleanup');
    }
    transport.forceDisconnectGatewayById(BOUND_GATEWAY_ID, 'test_cleanup');
    transport.forceDisconnectGatewayById(SWAP_GATEWAY_ID, 'test_cleanup');
  });

  it('parks swap candidate without replacing the bound gateway session', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);
    const swapWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);

    expect(primaryWs.readyState).toBe(WebSocket.OPEN);
    expect(swapWs.readyState).toBe(WebSocket.OPEN);
    expect(mockDetect).toHaveBeenCalledWith('facility-1', SWAP_GATEWAY_ID, BOUND_GATEWAY_ID);

    const candidates = transport.getSwapCandidatesForFacility('facility-1');
    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ gatewayId: SWAP_GATEWAY_ID, connected: true }),
    ]));

    primaryWs.close();
    swapWs.close();
  });

  it('routes recovery push messages to swap candidate when armed', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);
    const swapWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);

    transport.setRecoveryPushTarget('facility-1', SWAP_GATEWAY_ID);

    const primaryMessages: unknown[] = [];
    const swapMessages: unknown[] = [];
    primaryWs.on('message', (data) => {
      try { primaryMessages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });
    swapWs.on('message', (data) => {
      try { swapMessages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });

    GatewayEventsService.getInstance().unicastToFacility('facility-1', { type: 'FIRMWARE_MANIFEST', nonce: 'n-1' });
    GatewayEventsService.getInstance().unicastToFacility('facility-1', { cmd_type: 'DENYLIST_ADD', entries: [] });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(swapMessages.some((msg) => (msg as { type?: string }).type === 'FIRMWARE_MANIFEST')).toBe(true);
    expect(primaryMessages.some((msg) => (msg as { cmd_type?: string }).cmd_type === 'DENYLIST_ADD')).toBe(true);

    primaryWs.close();
    swapWs.close();
  });

  it('promotes swap candidate to active on finalizeRecoverySession', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);
    const swapWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);

    const swapMessages: unknown[] = [];
    swapWs.on('message', (data) => {
      try { swapMessages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });

    const primaryClosed = waitForClose(primaryWs);
    transport.finalizeRecoverySession('facility-1', SWAP_GATEWAY_ID, BOUND_GATEWAY_ID);
    await primaryClosed;

    expect(swapWs.readyState).toBe(WebSocket.OPEN);
    expect(primaryWs.readyState).not.toBe(WebSocket.OPEN);
    expect(transport.getSwapCandidatesForFacility('facility-1')).toEqual([]);

    const roleUpdateDeadline = Date.now() + 2000;
    let roleUpdate: unknown;
    while (Date.now() < roleUpdateDeadline) {
      roleUpdate = swapMessages.find(
        (msg) => (msg as { type?: string; sessionRole?: string }).type === 'AUTH_OK'
          && (msg as { sessionRole?: string }).sessionRole === 'active',
      );
      if (roleUpdate) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(roleUpdate).toBeTruthy();

    const routed: unknown[] = [];
    swapWs.on('message', (data) => {
      try { routed.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });
    GatewayEventsService.getInstance().unicastToFacility('facility-1', { cmd_type: 'LOCK', lock_id: 'dev-1' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(routed.some((msg) => (msg as { cmd_type?: string }).cmd_type === 'LOCK')).toBe(true);

    swapWs.close();
    await waitForClose(swapWs);
  });

  it('drops recovery push messages when swap candidate is offline', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);
    const swapWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);

    transport.setRecoveryPushTarget('facility-1', SWAP_GATEWAY_ID);
    swapWs.close();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const primaryMessages: unknown[] = [];
    primaryWs.on('message', (data) => {
      try { primaryMessages.push(JSON.parse(data.toString())); } catch { /* ignore */ }
    });

    GatewayEventsService.getInstance().unicastToFacility('facility-1', { type: 'FIRMWARE_MANIFEST', nonce: 'n-drop' });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(primaryMessages.some((msg) => (msg as { type?: string }).type === 'FIRMWARE_MANIFEST')).toBe(false);

    primaryWs.close();
  });

  it('enrichSessionsForCompletedRecovery omits offline previous gateway', () => {
    const sessions = transport.enrichSessionsForCompletedRecovery(
      'facility-clean',
      [{ gatewayId: SWAP_GATEWAY_ID, sessionRole: 'active', connected: true }],
      SWAP_GATEWAY_ID,
      BOUND_GATEWAY_ID,
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual(
      expect.objectContaining({ gatewayId: SWAP_GATEWAY_ID, sessionRole: 'active' }),
    );
    expect(sessions.some((s) => s.gatewayId === BOUND_GATEWAY_ID)).toBe(false);
  });

  it('enrichSessionsForCompletedRecovery includes previous gateway only when WS connected', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);
    const previousWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);

    const sessions = transport.enrichSessionsForCompletedRecovery(
      'facility-1',
      transport.getFacilityGatewaySessions('facility-1'),
      SWAP_GATEWAY_ID,
      BOUND_GATEWAY_ID,
    );
    expect(sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ gatewayId: SWAP_GATEWAY_ID, sessionRole: 'active', connected: true }),
        expect.objectContaining({ gatewayId: BOUND_GATEWAY_ID, sessionRole: 'swap_candidate', connected: true }),
      ]),
    );

    previousWs.close();
    primaryWs.close();
  });

  it('rejects inventory snapshot status from bound gateway when recovery push is armed', async () => {
    const primaryWs = await authGatewayWs(port, 'facility-1', BOUND_GATEWAY_ID);
    const swapWs = await authGatewayWs(port, 'facility-1', SWAP_GATEWAY_ID);

    transport.setRecoveryPushTarget('facility-1', SWAP_GATEWAY_ID);

    primaryWs.send(JSON.stringify({
      type: 'INVENTORY_SNAPSHOT_STATUS',
      recovery_id: 'rec-1',
      status: 'failed',
      error: 'spoofed',
    }));

    const ack = await waitForMessage(primaryWs);
    expect(ack.type).toBe('INVENTORY_SNAPSHOT_STATUS_ACK');
    expect(ack.accepted).toBe(false);
    expect(String(ack.reason)).toMatch(/swap candidate/i);

    primaryWs.close();
    swapWs.close();
  });
});
