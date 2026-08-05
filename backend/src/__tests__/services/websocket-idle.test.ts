import { WebSocket } from 'ws';

jest.mock('@/config/environment', () => ({
  config: {
    jwt: { secret: 'test-secret' },
  },
}));

jest.mock('@/services/subscriptions/subscription-registry', () => ({
  SubscriptionRegistry: jest.fn().mockImplementation(() => ({
    cleanup: jest.fn(),
    getLogsManager: jest.fn().mockReturnValue(null),
    getManager: jest.fn(),
  })),
}));

jest.mock('@/services/gateway-telemetry-log.service', () => ({
  GatewayTelemetryLogService: {
    getInstance: () => ({ setSubscriptionRegistry: jest.fn() }),
  },
}));

jest.mock('@/services/gateway-device-sync-log.service', () => ({
  GatewayDeviceSyncLogService: {
    getInstance: () => ({ setSubscriptionRegistry: jest.fn() }),
  },
}));

describe('WebSocketService idle sever', () => {
  const originalHeartbeat = process.env.DASHBOARD_WS_HEARTBEAT_MS;
  const originalIdle = process.env.DASHBOARD_WS_IDLE_MS;

  beforeEach(() => {
    jest.resetModules();
    process.env.DASHBOARD_WS_HEARTBEAT_MS = '10000';
    process.env.DASHBOARD_WS_IDLE_MS = '50';
  });

  afterEach(() => {
    if (originalHeartbeat === undefined) delete process.env.DASHBOARD_WS_HEARTBEAT_MS;
    else process.env.DASHBOARD_WS_HEARTBEAT_MS = originalHeartbeat;
    if (originalIdle === undefined) delete process.env.DASHBOARD_WS_IDLE_MS;
    else process.env.DASHBOARD_WS_IDLE_MS = originalIdle;
  });

  it('closes open clients that miss heartbeats', async () => {
    const { WebSocketService } = await import('@/services/websocket.service');
    const service = WebSocketService.getInstance();

    const close = jest.fn();
    const ws = {
      readyState: WebSocket.OPEN,
      close,
      send: jest.fn(),
    } as unknown as WebSocket;

    const clients = (service as unknown as { clients: Map<WebSocket, unknown> }).clients;
    clients.set(ws, {
      userId: 'u1',
      userRole: 'admin',
      subscriptions: new Map(),
      pendingSubscriptionKeys: new Set(),
      heartbeatCount: 0,
      lastClientHeartbeat: new Date(Date.now() - 5_000),
    });

    await new Promise((r) => setTimeout(r, 700));

    expect(close).toHaveBeenCalledWith(1001, 'Idle timeout');
    service.destroy();
  });

  it('does not close clients that recently heartbeated', async () => {
    const { WebSocketService } = await import('@/services/websocket.service');
    const service = WebSocketService.getInstance();

    const close = jest.fn();
    const ws = {
      readyState: WebSocket.OPEN,
      close,
      send: jest.fn(),
    } as unknown as WebSocket;

    const clients = (service as unknown as { clients: Map<WebSocket, unknown> }).clients;
    clients.set(ws, {
      userId: 'u2',
      userRole: 'admin',
      subscriptions: new Map(),
      pendingSubscriptionKeys: new Set(),
      heartbeatCount: 1,
      lastClientHeartbeat: new Date(),
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(close).not.toHaveBeenCalled();
    service.destroy();
  });

  it('ignores close errors during idle sever', async () => {
    const { WebSocketService } = await import('@/services/websocket.service');
    const service = WebSocketService.getInstance();

    const ws = {
      readyState: WebSocket.OPEN,
      close: jest.fn(() => {
        throw new Error('already closed');
      }),
      send: jest.fn(),
    } as unknown as WebSocket;

    const clients = (service as unknown as { clients: Map<WebSocket, unknown> }).clients;
    clients.set(ws, {
      userId: 'u3',
      userRole: 'admin',
      subscriptions: new Map(),
      pendingSubscriptionKeys: new Set(),
      heartbeatCount: 0,
      lastClientHeartbeat: new Date(Date.now() - 5_000),
    });

    await new Promise((r) => setTimeout(r, 700));
    expect(ws.close).toHaveBeenCalled();
    service.destroy();
  });
});
