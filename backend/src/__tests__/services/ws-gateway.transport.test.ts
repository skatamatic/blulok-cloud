import http from 'http';
import WebSocket from 'ws';
import { createIntegrationTestApp } from '../utils/integration-test-server';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

const TEST_BOUND_GATEWAY_ID = '11111111-1111-4111-8111-111111111111';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findByFacilityId: jest.fn().mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' }),
    findById: jest.fn().mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      facility_id: 'facility-1',
    }),
    createUnboundSwapCandidateIfAbsent: jest.fn(),
    createOrBindAsFirstGateway: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
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

function authPayload(facilityId: string) {
  return {
    type: 'AUTH',
    token: 'mock-jwt-token',
    facilityId,
    gatewayId: TEST_BOUND_GATEWAY_ID,
  };
}

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
    // Shutdown gateway transport to stop heartbeat timer
    GatewayEventsService.getInstance().shutdown();
    server.close(() => done());
  });

  it('authenticates and proxies a simple request', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);

    await new Promise<void>((resolve) => ws.once('open', () => resolve()));

    // Send AUTH (admin role is accepted by mocked AuthService)
    ws.send(JSON.stringify(authPayload('facility-1')));
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
    ws.send(JSON.stringify(authPayload('facility-1')));
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
    ws.send(JSON.stringify(authPayload('facility-1')));
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

    ws.send(JSON.stringify(authPayload('facility-1')));
    await waitForMessage(ws); // AUTH_OK

    // Wait long enough for at least one heartbeat cycle
    await new Promise(resolve => setTimeout(resolve, 2_000));

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  describe('tid passthrough', () => {
    it('PROXY_REQUEST with tid in body returns tid in PROXY_RESPONSE body', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const reqId = 'test-tid-1';
      const tid = 12345;
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId,
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid },
      }));
      const resp = await waitForMessage(ws);
      expect(resp?.type).toBe('PROXY_RESPONSE');
      expect(resp?.id).toBe(reqId);
      expect(resp?.status).toBe(200);
      expect(resp?.body?.tid).toBe(tid);
      expect(resp?.body?.success).toBe(true);
      ws.close();
    });

    it('PROXY_REQUEST without tid does not add tid to response (backward compatibility)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const reqId = 'test-tid-2';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId,
        method: 'GET',
        path: '/auth/verify-token',
      }));
      const resp = await waitForMessage(ws);
      expect(resp?.type).toBe('PROXY_RESPONSE');
      expect(resp?.id).toBe(reqId);
      expect(resp?.status).toBe(200);
      expect(resp?.body?.tid).toBeUndefined();
      expect(resp?.body?.success).toBe(true);
      ws.close();
    });

    it('tid passthrough works with successful responses (200 status)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const reqId = 'test-tid-3';
      const tid = 'abc-123';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId,
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid },
      }));
      const resp = await waitForMessage(ws);
      expect(resp?.status).toBe(200);
      expect(resp?.body?.tid).toBe(tid);
      ws.close();
    });

    it('tid passthrough works with error responses (4xx/5xx status)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const reqId = 'test-tid-4';
      const tid = 999;
      // Request a non-existent endpoint to trigger an error
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId,
        method: 'GET',
        path: '/nonexistent-endpoint-xyz',
        body: { tid },
      }));
      const resp = await waitForMessage(ws);
      expect(resp?.type).toBe('PROXY_RESPONSE');
      expect(resp?.id).toBe(reqId);
      expect(resp?.status).toBeGreaterThanOrEqual(400);
      expect(resp?.body?.tid).toBe(tid);
      ws.close();
    });

    it('tid preserves type (number or string) from request', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      // Test with number tid
      const reqId1 = 'test-tid-5';
      const tidNumber = 12345;
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId1,
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid: tidNumber },
      }));
      const resp1 = await waitForMessage(ws);
      expect(resp1?.body?.tid).toBe(tidNumber);
      expect(typeof resp1?.body?.tid).toBe('number');

      // Test with string tid
      const reqId2 = 'test-tid-6';
      const tidString = 'transaction-abc';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId2,
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid: tidString },
      }));
      const resp2 = await waitForMessage(ws);
      expect(resp2?.body?.tid).toBe(tidString);
      expect(typeof resp2?.body?.tid).toBe('string');
      ws.close();
    });

    it('tid works with different endpoint types (GET, POST, PUT)', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const tid = 'multi-method-test';

      // GET request
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: 'test-get',
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid },
      }));
      const respGet = await waitForMessage(ws);
      expect(respGet?.body?.tid).toBe(tid);

      // POST request
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: 'test-post',
        method: 'POST',
        path: '/auth/verify-token',
        body: { tid, someData: 'test' },
      }));
      const respPost = await waitForMessage(ws);
      expect(respPost?.body?.tid).toBe(tid);

      // PUT request
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: 'test-put',
        method: 'PUT',
        path: '/auth/verify-token',
        body: { tid, updateData: 'test' },
      }));
      const respPut = await waitForMessage(ws);
      expect(respPut?.body?.tid).toBe(tid);
      ws.close();
    });

    it('tid is merged into response body alongside existing data', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      const reqId = 'test-tid-7';
      const tid = 'merge-test';
      ws.send(JSON.stringify({
        type: 'PROXY_REQUEST',
        id: reqId,
        method: 'GET',
        path: '/auth/verify-token',
        body: { tid },
      }));
      const resp = await waitForMessage(ws);
      expect(resp?.body?.tid).toBe(tid);
      expect(resp?.body?.success).toBe(true);
      // Verify that existing response fields are preserved
      expect(resp?.body).toHaveProperty('success');
      expect(resp?.body).toHaveProperty('tid');
      ws.close();
    });
  });

  describe('Firmware Messages', () => {
    it('AUTH_OK response includes ops_public_key', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      const authOk = await waitForMessage(ws);
      expect(authOk.type).toBe('AUTH_OK');
      expect(authOk).toHaveProperty('ops_public_key');
      expect(typeof authOk.ops_public_key).toBe('string');
      ws.close();
    });

    it('FIRMWARE_CHUNK_ACK is handled without error', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      ws.send(JSON.stringify({
        type: 'FIRMWARE_CHUNK_ACK',
        nonce: 'test-nonce',
        chunkIndex: 0,
        status: 'ok',
      }));

      // No error response expected; give the server a moment to process
      await new Promise((resolve) => setTimeout(resolve, 200));
      ws.close();
    });

    it('FIRMWARE_UPDATE_STATUS is handled and ACK is returned', async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/gateway`);
      await new Promise<void>((resolve) => ws.once('open', () => resolve()));
      ws.send(JSON.stringify(authPayload('facility-1')));
      await waitForMessage(ws); // AUTH_OK

      ws.send(JSON.stringify({
        type: 'FIRMWARE_UPDATE_STATUS',
        push_id: 'test-push-id',
        status: 'installed',
        message: 'Firmware installed successfully',
      }));

      const ack = await waitForMessage(ws);
      expect(ack.type).toBe('FIRMWARE_UPDATE_STATUS_ACK');
      expect(ack.push_id).toBe('test-push-id');
      expect(typeof ack.accepted).toBe('boolean');
      ws.close();
    });
  });
});


