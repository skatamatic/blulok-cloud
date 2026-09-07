import { GatewayRecoveryStatusSubscriptionManager } from '@/services/subscriptions/gateway-recovery-status-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

jest.mock('@/services/gateway/gateway-recovery.service', () => ({
  GatewayRecoveryService: {
    getRecoveryCandidatesPayload: jest.fn().mockResolvedValue({
      candidates: [{ gatewayId: 'gw-new', connected: true }],
      recovery: { id: 'rec-1', status: 'detected', facility_id: 'fac-1', gateway_id: 'gw-new' },
      sessions: [{ gatewayId: 'gw-new', sessionRole: 'swap_candidate', connected: true }],
      demotedPreviousGateway: null,
    }),
  },
}));

describe('GatewayRecoveryStatusSubscriptionManager', () => {
  const facilityId = '11111111-1111-4111-8111-111111111111';

  function mockWs(): jest.Mocked<WebSocket> {
    return {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;
  }

  it('rejects subscribe without facility_id', async () => {
    const manager = new GatewayRecoveryStatusSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscription', subscriptionType: 'gateway_recovery_status' },
      { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
    );
    expect(ok).toBe(false);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('facility_id is required'));
  });

  it('rejects facility_admin for unassigned facility', async () => {
    const manager = new GatewayRecoveryStatusSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'gateway_recovery_status',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.FACILITY_ADMIN, facilityIds: ['other'] },
    );
    expect(ok).toBe(false);
  });

  it('sends initial status snapshot for admin', async () => {
    const manager = new GatewayRecoveryStatusSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'gateway_recovery_status',
        subscriptionId: 'sub-1',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
    );
    expect(ok).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('gateway_recovery_status_update'));
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining(facilityId));
  });

  it('broadcastStatus fans out only to matching facility subscribers', async () => {
    const manager = new GatewayRecoveryStatusSubscriptionManager();
    const wsMatch = mockWs();
    const wsOther = mockWs();
    const otherFacility = '22222222-2222-4222-8222-222222222222';

    await manager.handleSubscription(
      wsMatch,
      {
        type: 'subscription',
        subscriptionType: 'gateway_recovery_status',
        subscriptionId: 'sub-match',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
    );
    await manager.handleSubscription(
      wsOther,
      {
        type: 'subscription',
        subscriptionType: 'gateway_recovery_status',
        subscriptionId: 'sub-other',
        data: { facility_id: otherFacility },
      },
      { userId: 'u2', userRole: UserRole.ADMIN, facilityIds: [] },
    );

    (wsMatch.send as jest.Mock).mockClear();
    (wsOther.send as jest.Mock).mockClear();

    await manager.broadcastStatus(facilityId);

    expect(wsMatch.send).toHaveBeenCalled();
    expect(wsOther.send).not.toHaveBeenCalled();
  });
});
