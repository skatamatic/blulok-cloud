import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

describe('GatewayEventsService.getFacilityConnectionStatus', () => {
  it('returns connected=true when a client is registered for the facility', () => {
    const svc = GatewayEventsService.getInstance() as any;
    // Inject a fake transport with facilityToClient map
    svc.setTransport?.call(svc, {
      initialize() {},
      broadcast() {},
      unicastToFacility() {},
      facilityToClient: new Map([['fac-1', { lastPongAt: 1234567890 }]])
    });

    const status = svc.getFacilityConnectionStatus('fac-1');
    expect(status.connected).toBe(true);
    expect(status.lastPongAt).toBe(1234567890);
  });

  it('returns connected=false when no client is registered', () => {
    const svc = GatewayEventsService.getInstance() as any;
    svc.setTransport?.call(svc, {
      initialize() {},
      broadcast() {},
      unicastToFacility() {},
      facilityToClient: new Map()
    });

    const status = svc.getFacilityConnectionStatus('fac-2');
    expect(status.connected).toBe(false);
    expect((status as any).lastPongAt).toBeUndefined();
  });
});


