import { GatewayTelemetryLogSubscriptionManager } from '@/services/subscriptions/gateway-telemetry-log-subscription-manager';
import { UserRole } from '@/types/auth.types';

jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findById: jest.fn().mockImplementation(async (id: string) => {
      if (id === 'gw-fac-1') return { id: 'gw-fac-1', facility_id: 'facility-1' };
      if (id === 'gw-other') return { id: 'gw-other', facility_id: 'facility-other' };
      return null;
    }),
  })),
}));

describe('GatewayTelemetryLogSubscriptionManager', () => {
  let manager: GatewayTelemetryLogSubscriptionManager;
  let ws: { send: jest.Mock; readyState: number };

  beforeEach(() => {
    manager = new GatewayTelemetryLogSubscriptionManager();
    ws = { send: jest.fn(), readyState: 1 };
  });

  it('rejects facility admin subscribing to gateway outside assigned facilities', async () => {
    const ok = await manager.handleSubscription(
      ws as any,
      {
        type: 'subscription',
        subscriptionType: 'gateway_telemetry_logs',
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
    expect(ws.send).toHaveBeenCalled();
    const payload = JSON.parse(ws.send.mock.calls[0][0]);
    expect(payload.error).toMatch(/Access denied/i);
  });

  it('allows facility admin for gateway in assigned facility', async () => {
    const sendInitialSpy = jest.spyOn(manager as any, 'sendInitialData').mockResolvedValue(undefined);

    const ok = await manager.handleSubscription(
      ws as any,
      {
        type: 'subscription',
        subscriptionType: 'gateway_telemetry_logs',
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
    sendInitialSpy.mockRestore();
  });
});
