import { AccessSessionTraceSubscriptionManager } from '@/services/subscriptions/access-session-trace-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { ACCESS_SESSION_TRACE_MESSAGE_TYPE } from '@/constants/access-session-trace.constants';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gw-fac-1') return { id: 'gw-fac-1', facility_id: 'facility-1' };
      if (id === 'gw-other') return { id: 'gw-other', facility_id: 'facility-other' };
      return null;
    }),
  })),
}));

describe('AccessSessionTraceSubscriptionManager', () => {
  let manager: AccessSessionTraceSubscriptionManager;
  let ws: { send: jest.Mock; readyState: number };

  beforeEach(() => {
    manager = new AccessSessionTraceSubscriptionManager();
    ws = { send: jest.fn(), readyState: 1 };
  });

  it('rejects facility admin subscribing to gateway outside assigned facilities', async () => {
    const ok = await manager.handleSubscription(
      ws as any,
      {
        type: 'subscription',
        subscriptionType: 'access_session_trace',
        data: { filters: { gateway_id: 'gw-other' } },
      },
      {
        userId: 'user-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1'],
      },
    );

    expect(ok).toBe(false);
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.error).toMatch(/Access denied/i);
  });

  it('allows facility admin and broadcasts matching events', async () => {
    const sendInitialSpy = jest.spyOn(manager as any, 'sendInitialData').mockResolvedValue(undefined);

    const ok = await manager.handleSubscription(
      ws as any,
      {
        type: 'subscription',
        subscriptionType: 'access_session_trace',
        subscriptionId: 'sub-1',
        data: { filters: { gateway_id: 'gw-fac-1', facility_id: 'facility-1' } },
      },
      {
        userId: 'user-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1'],
      },
    );

    expect(ok).toBe(true);

    manager.broadcastUpdate({
      id: 'e1',
      kind: 'correlator_decision',
      at: new Date().toISOString(),
      facility_id: 'facility-1',
      gateway_id: 'gw-fac-1',
      device_id: 'dev-1',
      payload: { decision: 'create_on_site_pending' },
    });

    const update = ws.send.mock.calls
      .map((call) => JSON.parse(call[0]))
      .find((payload) => payload.type === ACCESS_SESSION_TRACE_MESSAGE_TYPE && payload.data?.event);
    expect(update?.data.event.id).toBe('e1');
    sendInitialSpy.mockRestore();
  });
});
