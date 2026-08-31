import { GatewayDebugSubscriptionManager } from '@/services/subscriptions/gateway-debug-subscription-manager';
import { UserRole } from '@/types/auth.types';
import type { GatewayDebugEvent } from '@/services/gateway/gateway-debug.service';
import type { SubscriptionClient } from '@/services/subscriptions/base-subscription-manager';

type WsMock = { send: jest.Mock; readyState: number };

const makeWs = (): WsMock => ({ send: jest.fn(), readyState: 1 });

const devAdmin = (userId = 'dev-1'): SubscriptionClient => ({
  userId,
  userRole: UserRole.DEV_ADMIN,
  subscriptions: new Map(),
});

const dataEventsSentTo = (ws: WsMock): GatewayDebugEvent[] =>
  ws.send.mock.calls
    .map((call) => JSON.parse(call[0] as string))
    .filter((msg) => msg.type === 'data')
    .map((msg) => msg.data as GatewayDebugEvent);

const event = (facilityId?: string): GatewayDebugEvent => ({
  kind: 'message_inbound',
  facilityId,
  type: 'PROXY_REQUEST',
  remote: '203.0.113.7',
  ts: Date.now(),
});

describe('GatewayDebugSubscriptionManager', () => {
  let manager: GatewayDebugSubscriptionManager;

  beforeEach(() => {
    manager = new GatewayDebugSubscriptionManager();
  });

  const subscribe = async (ws: WsMock, subscriptionId: string, facilityId?: string, client = devAdmin()) => {
    jest.spyOn(manager as any, 'sendInitialData').mockResolvedValue(undefined);
    return manager.handleSubscription(
      ws as any,
      {
        type: 'subscription',
        subscriptionType: 'gateway_debug',
        subscriptionId,
        data: facilityId ? { filters: { facility_id: facilityId } } : {},
      },
      client,
    );
  };

  it('only allows DEV_ADMIN to subscribe', () => {
    expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.ADMIN)).toBe(false);
    expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(false);
    expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
  });

  it('does NOT leak another facility’s traffic to a facility-scoped subscription', async () => {
    const wsA = makeWs();
    const wsB = makeWs();
    await subscribe(wsA, 'sub-a', 'facility-A');
    await subscribe(wsB, 'sub-b', 'facility-B');

    manager.broadcastUpdate(event('facility-A'));

    // Only the facility-A watcher receives the facility-A event.
    expect(dataEventsSentTo(wsA)).toHaveLength(1);
    expect(dataEventsSentTo(wsA)[0].facilityId).toBe('facility-A');
    // facility-B watcher must NOT receive facility-A traffic (the leak being fixed).
    expect(dataEventsSentTo(wsB)).toHaveLength(0);
  });

  it('delivers each facility’s events only to its own subscription', async () => {
    const wsA = makeWs();
    const wsB = makeWs();
    await subscribe(wsA, 'sub-a', 'facility-A');
    await subscribe(wsB, 'sub-b', 'facility-B');

    manager.broadcastUpdate(event('facility-A'));
    manager.broadcastUpdate(event('facility-B'));

    expect(dataEventsSentTo(wsA).map((e) => e.facilityId)).toEqual(['facility-A']);
    expect(dataEventsSentTo(wsB).map((e) => e.facilityId)).toEqual(['facility-B']);
  });

  it('never delivers an event without a facilityId to a facility-scoped subscription', async () => {
    const wsA = makeWs();
    await subscribe(wsA, 'sub-a', 'facility-A');

    manager.broadcastUpdate(event(undefined));

    expect(dataEventsSentTo(wsA)).toHaveLength(0);
  });

  it('stops delivering after unsubscribe (filter is cleared)', async () => {
    const wsA = makeWs();
    await subscribe(wsA, 'sub-a', 'facility-A');

    manager.handleUnsubscription(
      wsA as any,
      { type: 'unsubscription', subscriptionType: 'gateway_debug', subscriptionId: 'sub-a' },
      devAdmin(),
    );

    manager.broadcastUpdate(event('facility-A'));
    expect(dataEventsSentTo(wsA)).toHaveLength(0);
  });

  it('does not retain a filter entry when the subscription is rejected (non dev-admin)', async () => {
    const ws = makeWs();
    const ok = await subscribe(ws, 'sub-reject', 'facility-A', {
      userId: 'fac-1',
      userRole: UserRole.FACILITY_ADMIN,
      subscriptions: new Map(),
      facilityIds: ['facility-A'],
    });

    expect(ok).toBe(false);
    expect((manager as any).subscriptionFilters.size).toBe(0);
  });

  it('clears the facility filter on cleanup so a disconnected socket receives nothing', async () => {
    const wsA = makeWs();
    await subscribe(wsA, 'sub-a', 'facility-A');

    manager.cleanup(wsA as any, devAdmin());

    manager.broadcastUpdate(event('facility-A'));
    expect(dataEventsSentTo(wsA)).toHaveLength(0);
    expect((manager as any).subscriptionFilters.size).toBe(0);
  });
});
