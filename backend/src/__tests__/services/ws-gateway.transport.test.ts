import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<any> {
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

describe('WebsocketGatewayTransport', () => {
  let server: http.Server;
  let port: number;

  beforeAll((done) => {
    const app = createIntegrationTestApp();
    server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === 'object' && address) {
        port = address.port;
      } else {
        port = 0;
      }
      // Ensure proxy targets this ephemeral server
      process.env.GATEWAY_PROXY_BASE_URL = `http://127.0.0.1:${port}/api/v1`;
      // initialize gateway transport
      GatewayEventsService.getInstance().initialize(server);
      done();
    });
  });

  afterAll((done) => {
    server.close(() => done());
  });

  it('authenticates and proxies a simple request', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);

    await new Promise<void>((resolve) => ws.once('open', () => resolve()));

    // Send AUTH (admin role is accepted by mocked AuthService)
    ws.send(JSON.stringify({ type: 'AUTH', token: 'mock-jwt-token', facilityId: 'facility-1' }));
    const authOk = await waitForMessage(ws);
    expect(authOk?.type).toBe('AUTH_OK');
    expect(authOk?.facilityId).toBe('facility-1');

    // Proxy GET /auth/verify-token
    const reqId = 'test-1';
    ws.send(JSON.stringify({ type: 'PROXY_REQUEST', id: reqId, method: 'GET', path: '/auth/verify-token' }));
    const resp = await waitForMessage(ws);
    expect(resp?.type).toBe('PROXY_RESPONSE');
    expect(resp?.id).toBe(reqId);
    expect(resp?.status).toBe(200);
    expect(resp?.body?.success).toBe(true);

    ws.close();
  });

  it('receives unicast commands for its facility (JWT format)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.send(JSON.stringify({ type: 'AUTH', token: 'mock-jwt-token', facilityId: 'facility-1' }));
    await waitForMessage(ws); // AUTH_OK

    // Mock JWT string (header.payload.signature format)
    const mockJwt = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJCbHVDbG91ZDpSb290IiwiY21kX3R5cGUiOiJERU5ZTElTVF9BREQiLCJkZW55bGlzdF9hZGQiOlt7InN1YiI6InVzZXItMSIsImV4cCI6MTIzfV19.mock-sig';
    GatewayEventsService.getInstance().unicastToFacility('facility-1', mockJwt);
    const msg = await waitForMessage(ws);
    // JWT strings are wrapped in a COMMAND envelope
    expect(msg.type).toBe('COMMAND');
    expect(msg.jwt).toBe(mockJwt);
    ws.close();
  });

  it('receives unicast commands for its facility (legacy object format)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.send(JSON.stringify({ type: 'AUTH', token: 'mock-jwt-token', facilityId: 'facility-1' }));
    await waitForMessage(ws); // AUTH_OK

    // Legacy object format (still supported for backward compatibility)
    const payload = { cmd_type: 'DENYLIST_ADD', entries: [{ sub: 'user-1', exp: 123 }] };
    GatewayEventsService.getInstance().unicastToFacility('facility-1', payload);
    const msg = await waitForMessage(ws);
    expect(msg).toEqual(payload);
    ws.close();
  });

  it('maintains connection with heartbeat PING/PONG', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
    await new Promise<void>((resolve) => ws.once('open', () => resolve()));
    ws.on('message', (data) => {
      const msg = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    });

    ws.send(JSON.stringify({ type: 'AUTH', token: 'mock-jwt-token', facilityId: 'facility-1' }));
    await waitForMessage(ws); // AUTH_OK

    // Wait long enough for at least one heartbeat cycle
    await new Promise(resolve => setTimeout(resolve, 2_000));

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });
});


