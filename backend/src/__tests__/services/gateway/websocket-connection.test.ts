import { EventEmitter } from 'events';
import { GatewayConnectionState } from '../../../types/gateway.types';

type MockWsInstance = EventEmitter & {
  readyState: number;
  terminate: jest.Mock;
  close: jest.Mock;
  send: jest.Mock;
  ping: jest.Mock;
};

const mockWsInstances: MockWsInstance[] = [];

jest.mock('ws', () => {
  const OPEN = 1;
  function MockWebSocket(this: MockWsInstance) {
    EventEmitter.call(this);
    this.readyState = OPEN;
    this.terminate = jest.fn();
    this.close = jest.fn();
    this.send = jest.fn((_data: Buffer, cb?: (err?: Error) => void) => {
      if (cb) cb();
    });
    this.ping = jest.fn();
    mockWsInstances.push(this);
  }
  Object.setPrototypeOf(MockWebSocket.prototype, EventEmitter.prototype);
  (MockWebSocket as any).OPEN = OPEN;
  return {
    __esModule: true,
    default: MockWebSocket,
    WebSocket: MockWebSocket,
  };
});

import { WebSocketConnection } from '../../../services/gateway/connections/websocket.connection';

describe('WebSocketConnection', () => {
  let connection: WebSocketConnection;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWsInstances.length = 0;
    jest.useFakeTimers();
    connection = new WebSocketConnection(
      'gw-1',
      'wss://gateway.example/ws',
      1000, // heartbeat
      500, // connection timeout
    );
    // Absorb connection 'error' emits — Node treats unhandled EventEmitter errors as fatal.
    connection.on('error', () => undefined);
  });

  afterEach(async () => {
    await connection.disconnect().catch(() => undefined);
    jest.useRealTimers();
  });

  function lastWs(): MockWsInstance {
    return mockWsInstances[mockWsInstances.length - 1];
  }

  async function connectOpen(): Promise<void> {
    const p = connection.connect();
    await Promise.resolve();
    lastWs().emit('open');
    await p;
  }

  describe('constructor', () => {
    it('starts disconnected with gateway id', () => {
      expect(connection.gatewayId).toBe('gw-1');
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);
      expect(connection.isConnected()).toBe(false);
    });
  });

  describe('connect', () => {
    it('resolves on open and starts heartbeat', async () => {
      await connectOpen();
      expect(connection.state).toBe(GatewayConnectionState.CONNECTED);
      expect(mockWsInstances.length).toBe(1);

      jest.advanceTimersByTime(1000);
      expect(lastWs().ping).toHaveBeenCalled();
    });

    it('is a no-op when already connected', async () => {
      await connectOpen();
      const count = mockWsInstances.length;
      await connection.connect();
      expect(mockWsInstances.length).toBe(count);
    });

    it('rejects on connection timeout', async () => {
      const p = connection.connect();
      await Promise.resolve();
      jest.advanceTimersByTime(500);
      await expect(p).rejects.toThrow(/Connection timeout/);
      expect(lastWs().terminate).toHaveBeenCalled();
    });

    it('rejects on websocket error', async () => {
      const p = connection.connect();
      await Promise.resolve();
      const err = new Error('handshake failed');
      lastWs().emit('error', err);
      await expect(p).rejects.toThrow('handshake failed');
      expect(connection.state).toBe(GatewayConnectionState.ERROR);
    });

    it('emits data on message', async () => {
      await connectOpen();
      const dataHandler = jest.fn();
      connection.on('data', dataHandler);
      lastWs().emit('message', Buffer.from('hello'));
      expect(dataHandler).toHaveBeenCalledWith(Buffer.from('hello'));
      expect(connection.getStats().bytesReceived).toBe(5);
    });
  });

  describe('disconnect', () => {
    it('closes socket and stops heartbeat', async () => {
      await connectOpen();
      const ws = lastWs();
      await connection.disconnect();
      expect(ws.close).toHaveBeenCalled();
      expect(connection.state).toBe(GatewayConnectionState.DISCONNECTED);

      jest.advanceTimersByTime(5000);
      expect(ws.ping).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('throws when not connected', async () => {
      await expect(connection.send(Buffer.from('x'))).rejects.toThrow('Connection not established');
    });

    it('records bytes on successful send', async () => {
      await connectOpen();
      await connection.send(Buffer.from('abc'));
      expect(lastWs().send).toHaveBeenCalled();
      expect(connection.getStats().bytesSent).toBe(3);
      expect(connection.getStats().messagesSent).toBe(1);
    });

    it('rejects when send callback reports error', async () => {
      await connectOpen();
      lastWs().send.mockImplementation((_data: Buffer, cb?: (err?: Error) => void) => {
        cb?.(new Error('send failed'));
      });
      await expect(connection.send(Buffer.from('x'))).rejects.toThrow('send failed');
    });
  });

  describe('reconnection', () => {
    it('schedules reconnect after close', async () => {
      await connectOpen();
      lastWs().emit('close', 1000, Buffer.from('bye'));

      expect(connection.state).toBe(GatewayConnectionState.RECONNECTING);

      // First reconnect attempt after 1000ms * 1
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      expect(mockWsInstances.length).toBeGreaterThan(1);
    });

    it('enters ERROR after max reconnect attempts', async () => {
      await connectOpen();

      // Exhaust reconnect budget with closes only (no timer-driven connect races).
      for (let i = 0; i < 6; i++) {
        lastWs().emit('close', 1000, Buffer.from('bye'));
        await Promise.resolve();
      }

      expect(connection.state).toBe(GatewayConnectionState.ERROR);
    });
  });
});
