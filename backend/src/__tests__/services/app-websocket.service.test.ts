import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { AppWebSocketService } from '@/services/app-websocket.service';
import { FacilityAccessService } from '@/services/facility-access.service';
import { AppRealtimeHub } from '@/services/app-realtime.hub';

jest.mock('ws');
jest.mock('@/services/facility-access.service', () => ({
  FacilityAccessService: {
    hasAccessToFacility: jest.fn(),
    getUserFacilityIds: jest.fn().mockResolvedValue(['facility-1']),
  },
}));
jest.mock('@/services/app-realtime.hub', () => ({
  AppRealtimeHub: {
    getInstance: jest.fn(),
  },
}));

describe('AppWebSocketService', () => {
  let service: AppWebSocketService;
  let mockWs: jest.Mocked<WebSocket>;
  let mockHub: {
    ensureListeners: jest.Mock;
    destroy: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
    removeSubscriber: jest.Mock;
  };

  const createMockReq = (url: string) =>
    ({
      url,
      headers: { host: 'localhost' },
    }) as any;

  beforeEach(() => {
    process.env.APP_WS_IDLE_MS = '50';
    process.env.APP_WS_HEARTBEAT_MS = '10000';

    const existing = (AppWebSocketService as any).instance;
    if (existing?.destroy) existing.destroy();
    (AppWebSocketService as any).instance = undefined;

    mockHub = {
      ensureListeners: jest.fn(),
      destroy: jest.fn(),
      subscribe: jest.fn().mockResolvedValue({ ok: true }),
      unsubscribe: jest.fn(),
      removeSubscriber: jest.fn(),
    };
    (AppRealtimeHub.getInstance as jest.Mock).mockReturnValue(mockHub);

    service = AppWebSocketService.getInstance();
    service.initialize({ on: jest.fn() });

    mockWs = {
      readyState: 1, // WebSocket.OPEN
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    } as any;
  });

  afterEach(() => {
    service.destroy();
    (AppWebSocketService as any).instance = undefined;
    delete process.env.APP_WS_IDLE_MS;
    delete process.env.APP_WS_HEARTBEAT_MS;
    jest.clearAllMocks();
  });

  it('rejects connections without a token', async () => {
    await service['handleConnection'](mockWs, createMockReq('/ws/app'));
    expect(mockWs.close).toHaveBeenCalledWith(1008, 'No authentication token provided');
  });

  it('rejects invalid JWT', async () => {
    await service['handleConnection'](mockWs, createMockReq('/ws/app?token=bad'));
    expect(mockWs.close).toHaveBeenCalledWith(1008, 'Authentication failed');
  });

  it('subscribes after auth and returns facility ack', async () => {
    const jwt = require('jsonwebtoken');
    jest.spyOn(jwt, 'verify').mockReturnValue({
      userId: 'tenant-1',
      role: UserRole.TENANT,
    });
    (FacilityAccessService.hasAccessToFacility as jest.Mock).mockResolvedValue(true);

    await service['handleConnection'](mockWs, createMockReq('/ws/app?token=ok'));

    await service['handleMessage'](
      mockWs,
      Buffer.from(
        JSON.stringify({
          type: 'subscription',
          subscriptionType: 'app',
          data: { facility_id: 'facility-1' },
        }),
      ),
    );

    expect(mockHub.subscribe).toHaveBeenCalled();
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"subscription"'));
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('facility_id'));
  });

  it('returns access denied when hub rejects facility', async () => {
    const jwt = require('jsonwebtoken');
    jest.spyOn(jwt, 'verify').mockReturnValue({
      userId: 'tenant-1',
      role: UserRole.TENANT,
    });
    mockHub.subscribe.mockResolvedValue({ ok: false, error: 'Access denied to facility' });

    await service['handleConnection'](mockWs, createMockReq('/ws/app?token=ok'));
    await service['handleMessage'](
      mockWs,
      Buffer.from(
        JSON.stringify({
          type: 'subscription',
          subscriptionType: 'app',
          data: { facility_id: 'foreign' },
        }),
      ),
    );

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining('Access denied to facility'),
    );
  });

  it('closes idle connections when client heartbeats stop', async () => {
    const jwt = require('jsonwebtoken');
    jest.spyOn(jwt, 'verify').mockReturnValue({
      userId: 'tenant-1',
      role: UserRole.TENANT,
    });

    await service['handleConnection'](mockWs, createMockReq('/ws/app?token=ok'));
    const client = service['clients'].get(mockWs);
    expect(client).toBeDefined();
    client!.lastClientHeartbeat = new Date(Date.now() - 200);

    await new Promise((r) => setTimeout(r, 250));

    expect(mockWs.close).toHaveBeenCalledWith(1001, 'Idle timeout');
  });
});
