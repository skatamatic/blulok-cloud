/** Real GatewayModel (setup-mocks replaces it globally; we need prototype spies here). */
jest.unmock('@/models/gateway.model');

import { GATEWAY_OFFLINE_GRACE_MS } from '@/constants/gateway-liveness.constants';
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

  const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  const flushMicrotasks = async () => {
    await flushPromises();
    await new Promise<void>((resolve) => setImmediate(resolve));
  };

  beforeEach(() => {
    jest.useRealTimers();
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
      getConnectionStatusForFacility: jest.fn().mockReturnValue({ connected: false }),
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    GatewayEventsService.getInstance().setOfflineGraceMsOverride(null);
    GatewayEventsService.getInstance().setTransport({
      initialize: jest.fn(),
      broadcast: jest.fn(),
      unicastToFacility: jest.fn(),
    });
    GatewayEventsService.getInstance().shutdown();
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

  it('defers physical gateway offline until grace period elapses', async () => {
    jest.useFakeTimers();
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-physical-1',
      name: 'Max Gateway',
      status: 'online',
      gateway_type: 'physical',
    } as any);
    const onlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatusAndLastSeen').mockResolvedValue(undefined as any);
    const offlineSpy = jest.spyOn(GatewayModel.prototype, 'updateStatus').mockResolvedValue(undefined as any);

    const ws = WebSocketService.getInstance();
    const broadcastSpy = jest.spyOn(ws, 'broadcastGatewayStatusUpdate').mockResolvedValue(undefined);

    connectionCallback({
      facilityId: 'fac-1',
      connected: false,
      timestamp: Date.now(),
      reason: 'close_event',
    });
    await flushPromises();

    expect(offlineSpy).not.toHaveBeenCalled();
    expect(broadcastSpy).toHaveBeenCalledWith('fac-1', 'gw-physical-1');
    expect(GatewayEventsService.getInstance().getFacilityConnectionStatus('fac-1').connected).toBe(false);
    expect(GatewayEventsService.getInstance().getFacilityProductLiveness('fac-1').connected).toBe(true);

    await jest.advanceTimersByTimeAsync(GATEWAY_OFFLINE_GRACE_MS - 1);
    await flushPromises();
    expect(offlineSpy).not.toHaveBeenCalled();
    expect(GatewayEventsService.getInstance().getFacilityProductLiveness('fac-1').connected).toBe(true);

    await jest.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(offlineSpy).toHaveBeenCalledWith('gw-physical-1', 'offline');
    expect(onlineSpy).not.toHaveBeenCalled();
    expect(GatewayEventsService.getInstance().getFacilityProductLiveness('fac-1').connected).toBe(false);
  });

  it('cancels pending offline when gateway reconnects within grace period', async () => {
    jest.useFakeTimers();
    jest.spyOn(GatewayModel.prototype, 'findByFacilityId').mockResolvedValue({
      id: 'gw-physical-1',
      name: 'Max Gateway',
      status: 'online',
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
    await flushPromises();
    expect(offlineSpy).not.toHaveBeenCalled();
    expect(GatewayEventsService.getInstance().isFacilityPendingOffline('fac-1')).toBe(true);

    connectionCallback({
      facilityId: 'fac-1',
      connected: true,
      timestamp: Date.now(),
    });
    await flushPromises();
    expect(onlineSpy).toHaveBeenCalledWith('gw-physical-1', 'online');
    expect(GatewayEventsService.getInstance().isFacilityPendingOffline('fac-1')).toBe(false);

    await jest.advanceTimersByTimeAsync(GATEWAY_OFFLINE_GRACE_MS);
    await flushPromises();
    expect(offlineSpy).not.toHaveBeenCalled();
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
