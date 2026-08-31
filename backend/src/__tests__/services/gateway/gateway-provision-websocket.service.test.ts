import { EventEmitter } from 'events';
import {
  generateP256KeyPair,
  buildZtpSignPayload,
  signZtpPayload,
  ZTP_PROVISION_PREFIX,
} from '@/services/gateway/ztp/gateway-ztp-crypto.utils';
import { ZtpPendingStore } from '@/services/gateway/ztp/ztp-pending.store';

const mockWssInstances: MockWss[] = [];

class MockWss extends EventEmitter {
  path: string;
  handleUpgrade = jest.fn(
    (
      _request: unknown,
      _socket: unknown,
      _head: unknown,
      cb: (ws: EventEmitter) => void,
    ) => {
      const ws = new EventEmitter();
      cb(ws);
    },
  );
  close = jest.fn();

  constructor(opts: { path?: string }) {
    super();
    this.path = opts.path || '';
    mockWssInstances.push(this);
  }
}

jest.mock('ws', () => {
  const OPEN = 1;
  const WebSocket = Object.assign(
    jest.fn(),
    { OPEN },
  );
  return {
    __esModule: true,
    default: WebSocket,
    WebSocket,
    WebSocketServer: jest.fn().mockImplementation((opts: { path?: string }) => new MockWss(opts)),
  };
});

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { GatewayProvisionWebSocketService } from '@/services/gateway/ztp/gateway-provision-websocket.service';

const DEVICE_ID = '123e4567-e89b-12d3-a456-426614174000';

function createMockWs() {
  const ws = new EventEmitter() as EventEmitter & {
    readyState: number;
    send: jest.Mock;
    close: jest.Mock;
  };
  ws.readyState = 1;
  ws.send = jest.fn();
  ws.close = jest.fn();
  return ws;
}

describe('GatewayProvisionWebSocketService', () => {
  let service: GatewayProvisionWebSocketService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWssInstances.length = 0;
    ZtpPendingStore.resetInstanceForTests();
    (GatewayProvisionWebSocketService as any).instance = undefined;
    service = GatewayProvisionWebSocketService.getInstance();
  });

  afterEach(() => {
    service.destroy();
    ZtpPendingStore.resetInstanceForTests();
  });

  describe('singleton & lifecycle', () => {
    it('returns the same instance', () => {
      expect(GatewayProvisionWebSocketService.getInstance()).toBe(service);
    });

    it('initializes WebSocketServer once and registers upgrade handler', () => {
      const on = jest.fn();
      service.initialize({ on });
      service.initialize({ on }); // idempotent

      expect(mockWssInstances).toHaveLength(1);
      expect(on).toHaveBeenCalledTimes(1);
      expect(on).toHaveBeenCalledWith('upgrade', expect.any(Function));
    });

    it('handles matching upgrade path and emits connection', () => {
      const on = jest.fn();
      service.initialize({ on });
      const upgradeHandler = on.mock.calls[0][1];
      const wss = mockWssInstances[0];
      const connectionSpy = jest.fn();
      wss.on('connection', connectionSpy);

      const socket = { destroy: jest.fn() };
      upgradeHandler(
        { url: '/ws/gateway-provision', headers: { host: 'localhost' } },
        socket,
        Buffer.alloc(0),
      );

      expect(wss.handleUpgrade).toHaveBeenCalled();
      expect(connectionSpy).toHaveBeenCalled();
    });

    it('ignores non-matching upgrade paths', () => {
      const on = jest.fn();
      service.initialize({ on });
      const upgradeHandler = on.mock.calls[0][1];
      const wss = mockWssInstances[0];

      upgradeHandler(
        { url: '/ws/other', headers: { host: 'localhost' } },
        { destroy: jest.fn() },
        Buffer.alloc(0),
      );

      expect(wss.handleUpgrade).not.toHaveBeenCalled();
    });

    it('destroys socket when upgrade URL parsing fails', () => {
      const on = jest.fn();
      service.initialize({ on });
      const upgradeHandler = on.mock.calls[0][1];
      const socket = { destroy: jest.fn() };

      // Missing host + malformed relative URL → URL constructor throws
      upgradeHandler({ url: 'http://[', headers: { host: 'localhost' } }, socket, Buffer.alloc(0));

      expect(socket.destroy).toHaveBeenCalled();
    });

    it('destroy closes server and resets singleton', () => {
      const on = jest.fn();
      service.initialize({ on });
      const wss = mockWssInstances[0];
      service.destroy();

      expect(wss.close).toHaveBeenCalled();
      expect(GatewayProvisionWebSocketService.getInstance()).not.toBe(service);
    });
  });

  describe('provision handshake', () => {
    let ws: ReturnType<typeof createMockWs>;
    let keyPair: ReturnType<typeof generateP256KeyPair>;

    beforeEach(() => {
      const on = jest.fn();
      service.initialize({ on });
      const wss = mockWssInstances[0];
      ws = createMockWs();
      keyPair = generateP256KeyPair();
      wss.emit('connection', ws);
    });

    async function send(msg: unknown) {
      const handlers = (ws as any)._events?.message;
      const handler = Array.isArray(handlers) ? handlers[0] : handlers;
      await handler(Buffer.from(JSON.stringify(msg)));
    }

    function lastSent(): any {
      const raw = ws.send.mock.calls.at(-1)?.[0];
      return JSON.parse(String(raw));
    }

    it('rejects invalid JSON', async () => {
      const handlers = (ws as any)._events?.message;
      const handler = Array.isArray(handlers) ? handlers[0] : handlers;
      await handler(Buffer.from('not-json'));
      expect(lastSent()).toMatchObject({ type: 'PROVISION_ERROR', code: 'BAD_JSON' });
    });

    it('rejects HELLO without valid device_id / public_key', async () => {
      await send({ type: 'PROVISION_HELLO', device_id: 'bad', public_key: '' });
      expect(lastSent()).toMatchObject({ type: 'PROVISION_ERROR', code: 'BAD_REQUEST' });
    });

    it('rejects HELLO with invalid compressed public key', async () => {
      await send({
        type: 'HELLO',
        deviceId: DEVICE_ID,
        publicKey: 'not-a-valid-key',
      });
      expect(lastSent()).toMatchObject({
        type: 'PROVISION_ERROR',
        code: 'BAD_REQUEST',
        message: expect.stringMatching(/compressed P-256/),
      });
    });

    it('issues PROVISION_CHALLENGE on valid HELLO', async () => {
      await send({
        type: 'PROVISION_HELLO',
        device_id: DEVICE_ID,
        public_key: keyPair.publicKeyCompressedB64url,
      });
      expect(lastSent()).toMatchObject({
        type: 'PROVISION_CHALLENGE',
        expires_in_seconds: 60,
      });
      expect(typeof lastSent().nonce).toBe('string');
      expect(lastSent().nonce.length).toBeGreaterThan(10);
    });

    it('rejects AUTH without challenge', async () => {
      await send({ type: 'PROVISION_AUTH', signature: 'x' });
      expect(lastSent()).toMatchObject({ type: 'PROVISION_ERROR', code: 'CHALLENGE_EXPIRED' });
    });

    it('rejects AUTH with invalid signature and closes socket', async () => {
      await send({
        type: 'PROVISION_HELLO',
        device_id: DEVICE_ID,
        public_key: keyPair.publicKeyCompressedB64url,
      });
      await send({ type: 'AUTH', signature: 'bad-sig' });
      expect(lastSent()).toMatchObject({ type: 'PROVISION_ERROR', code: 'AUTH_FAILED' });
      expect(ws.close).toHaveBeenCalledWith(4001, 'auth_failed');
    });

    it('accepts valid AUTH and registers pending session', async () => {
      await send({
        type: 'PROVISION_HELLO',
        device_id: DEVICE_ID,
        public_key: keyPair.publicKeyCompressedB64url,
      });
      const nonce = lastSent().nonce;
      const payload = buildZtpSignPayload(ZTP_PROVISION_PREFIX, nonce, DEVICE_ID);
      const signature = signZtpPayload(keyPair.privateKeyPem, payload);

      await send({ type: 'PROVISION_AUTH', signature });

      expect(lastSent()).toMatchObject({
        type: 'PROVISION_WAITING',
        device_id: DEVICE_ID,
      });
      expect(ZtpPendingStore.getInstance().get(DEVICE_ID)?.deviceId).toBe(DEVICE_ID);
    });

    it('rejects AUTH after challenge expiry', async () => {
      jest.useFakeTimers();
      await send({
        type: 'PROVISION_HELLO',
        device_id: DEVICE_ID,
        public_key: keyPair.publicKeyCompressedB64url,
      });
      jest.advanceTimersByTime(61_000);
      await send({ type: 'PROVISION_AUTH', signature: 'x' });
      expect(lastSent()).toMatchObject({ type: 'PROVISION_ERROR', code: 'CHALLENGE_EXPIRED' });
      jest.useRealTimers();
    });

    it('ignores PROVISION_ACK', async () => {
      const before = ws.send.mock.calls.length;
      await send({ type: 'PROVISION_ACK' });
      expect(ws.send.mock.calls.length).toBe(before);
    });

    it('cleans pending session on close', async () => {
      await send({
        type: 'PROVISION_HELLO',
        device_id: DEVICE_ID,
        public_key: keyPair.publicKeyCompressedB64url,
      });
      const nonce = lastSent().nonce;
      const signature = signZtpPayload(
        keyPair.privateKeyPem,
        buildZtpSignPayload(ZTP_PROVISION_PREFIX, nonce, DEVICE_ID),
      );
      await send({ type: 'PROVISION_AUTH', signature });
      expect(ZtpPendingStore.getInstance().get(DEVICE_ID)).toBeTruthy();

      ws.emit('close');
      expect(ZtpPendingStore.getInstance().get(DEVICE_ID)).toBeNull();
    });

    it('does not send when socket is not open', async () => {
      ws.readyState = 3; // CLOSED
      await send({ type: 'PROVISION_HELLO', device_id: 'bad', public_key: '' });
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});
