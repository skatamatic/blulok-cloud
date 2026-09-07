import { GatewayDebugService } from '@/services/gateway/gateway-debug.service';

describe('GatewayDebugService', () => {
  beforeEach(() => {
    (GatewayDebugService as unknown as { instance?: GatewayDebugService }).instance = undefined;
  });

  it('delivers published events to subscribers', () => {
    const svc = GatewayDebugService.getInstance();
    const received: unknown[] = [];
    const unsubscribe = svc.subscribe((event) => {
      received.push(event);
    });

    svc.publish({ kind: 'ping_sent', ts: Date.now(), facilityId: 'fac-1' });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'ping_sent', facilityId: 'fac-1' });

    unsubscribe();
    svc.publish({ kind: 'pong_received', ts: Date.now() });
    expect(received).toHaveLength(1);
  });

  it('isolates subscriber errors so publish never throws', () => {
    const svc = GatewayDebugService.getInstance();
    svc.subscribe(() => {
      throw new Error('subscriber blew up');
    });
    const ok: unknown[] = [];
    svc.subscribe((event) => ok.push(event));

    expect(() =>
      svc.publish({ kind: 'message_inbound', ts: Date.now(), type: 'AUTH' }),
    ).not.toThrow();
    expect(ok).toHaveLength(1);
  });
});
