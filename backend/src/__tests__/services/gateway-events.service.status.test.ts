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
    expect((status).lastPongAt).toBeUndefined();
  });

  it('getFacilityProductLiveness mirrors transport when not pending offline', () => {
    const svc = GatewayEventsService.getInstance() as any;
    svc.setTransport?.call(svc, {
      initialize() {},
      broadcast() {},
      unicastToFacility() {},
      facilityToClient: new Map([['fac-1', { lastPongAt: 42 }]]),
    });
    svc.pendingOfflineByFacility?.clear?.();

    expect(svc.getFacilityProductLiveness('fac-1')).toEqual({ connected: true, lastPongAt: 42 });
    expect(svc.getFacilityProductLiveness('fac-missing')).toEqual({ connected: false });
  });

  it('getFacilityProductLiveness stays connected during pending offline grace', () => {
    const svc = GatewayEventsService.getInstance() as any;
    svc.setTransport?.call(svc, {
      initialize() {},
      broadcast() {},
      unicastToFacility() {},
      getConnectionStatusForFacility: () => ({ connected: false }),
    });
    const timer = setTimeout(() => undefined, 60_000);
    svc.pendingOfflineByFacility = new Map([
      ['fac-grace', { timer, gatewayId: 'g1', gatewayName: 'G', previousStatus: 'online' }],
    ]);

    expect(svc.getFacilityConnectionStatus('fac-grace').connected).toBe(false);
    expect(svc.getFacilityProductLiveness('fac-grace').connected).toBe(true);
    expect(svc.isFacilityPendingOffline('fac-grace')).toBe(true);

    clearTimeout(timer);
    svc.pendingOfflineByFacility.clear();
  });

  it('setOfflineGraceMsOverride changes getOfflineGraceMs until cleared', () => {
    const svc = GatewayEventsService.getInstance();
    svc.setOfflineGraceMsOverride(null);
    const defaultMs = svc.getOfflineGraceMs();

    expect(svc.setOfflineGraceMsOverride(750)).toBe(750);
    expect(svc.getOfflineGraceMs()).toBe(750);
    expect(svc.isOfflineGraceOverrideActive()).toBe(true);

    expect(svc.setOfflineGraceMsOverride(null)).toBe(defaultMs);
    expect(svc.isOfflineGraceOverrideActive()).toBe(false);
  });
});
