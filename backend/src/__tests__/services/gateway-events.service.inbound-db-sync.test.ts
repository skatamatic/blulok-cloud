/** Real GatewayModel (setup-mocks replaces it globally; we need prototype spies here). */
jest.unmock('@/models/gateway.model');

import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayModel } from '@/models/gateway.model';
import { WebSocketService } from '@/services/websocket.service';

/**
 * Covers syncGatewayDbWithInboundConnection (private) via the transport connection-change callback.
 */
describe('GatewayEventsService inbound WebSocket → gateways.status sync', () => {
  let connectionCallback: (event: {
    facilityId: string;
    connected: boolean;
    timestamp: number;
    reason?: string;
    lastActivityAt?: number;
  }) => void;

  const flushMicrotasks = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    const svc = GatewayEventsService.getInstance();
    svc.setTransport({
      initialize: jest.fn(),
      broadcast: jest.fn(),
      unicastToFacility: jest.fn(),
      setConnectionChangeListener: jest.fn((cb: typeof connectionCallback) => {
        connectionCallback = cb;
        return jest.fn();
      }),
    });
  });

  afterEach(() => {
    GatewayEventsService.getInstance().setTransport({
      initialize: jest.fn(),
      broadcast: jest.fn(),
      unicastToFacility: jest.fn(),
    });
  });

  it('updates physical gateway to online and broadcasts on connect', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-physical-1',
      gateway_type: 'physical',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);
    const offlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatus').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    const broadcastSpy = jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-1',
      connected: true,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(GatewayModel.prototype.findByFacilityId).toHaveBeenCalledWith('fac-1');
    expect(onlineSpy).toHaveBeenCalledWith('gw-physical-1', 'online');
    expect(offlineSpy).not.toHaveBeenCalled();
    expect(broadcastSpy).toHaveBeenCalledWith('fac-1', 'gw-physical-1');
  });

  it('updates physical gateway to offline on disconnect', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-physical-1',
      gateway_type: 'physical',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);
    const offlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatus').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-1',
      connected: false,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(offlineSpy).toHaveBeenCalledWith('gw-physical-1', 'offline');
    expect(onlineSpy).not.toHaveBeenCalled();
  });

  it('drives http gateway DB status from inbound WS (outbound polling is deprecated)', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-http-1',
      gateway_type: 'http',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);
    const offlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatus').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    const broadcastSpy = jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-1',
      connected: true,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(onlineSpy).toHaveBeenCalledWith('gw-http-1', 'online');
    expect(offlineSpy).not.toHaveBeenCalled();
    expect(broadcastSpy).toHaveBeenCalledWith('fac-1', 'gw-http-1');
  });

  it('syncs gateways with no explicit gateway_type from inbound WS', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-untyped-1',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    const broadcastSpy = jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-untyped',
      connected: true,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(onlineSpy).toHaveBeenCalledWith('gw-untyped-1', 'online');
    expect(broadcastSpy).toHaveBeenCalledWith('fac-untyped', 'gw-untyped-1');
  });

  it('no-ops when no gateway row exists for facility', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue(null);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    const broadcastSpy = jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'brand-new-facility',
      connected: true,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(onlineSpy).not.toHaveBeenCalled();
    expect(broadcastSpy).not.toHaveBeenCalled();
  });

  it('syncs simulated gateway type like physical', async () => {
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-sim-1',
      gateway_type: 'simulated',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-sim',
      connected: true,
      timestamp: Date.now(),
    });
    await flushMicrotasks();

    expect(onlineSpy).toHaveBeenCalledWith('gw-sim-1', 'online');
  });
});
