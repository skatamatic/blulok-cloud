import { AccessCodePushStateSubscriptionManager } from '@/services/subscriptions/access-code-push-state-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

jest.mock('@/services/access-code.service', () => ({
  AccessCodeService: {
    getInstance: jest.fn(() => ({
      getPushState: jest.fn((facilityId: string) => ({
        facility_id: facilityId,
        status: 'active',
        last_error: null,
        last_nonce: null,
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
      })),
    })),
  },
}));

describe('AccessCodePushStateSubscriptionManager', () => {
  const facilityId = '11111111-1111-4111-8111-111111111111';

  function mockWs(): jest.Mocked<WebSocket> {
    return {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as unknown as jest.Mocked<WebSocket>;
  }

  it('rejects subscribe without facility_id', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscription', subscriptionType: 'access_code_push_state' },
      { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
    );
    expect(ok).toBe(false);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('facility_id is required'));
  });

  it('rejects tenant role', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.TENANT, facilityIds: [facilityId] },
    );
    expect(ok).toBe(false);
  });

  it('rejects maintenance role', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.MAINTENANCE, facilityIds: [facilityId] },
    );
    expect(ok).toBe(false);
  });

  it('rejects invalid facility_id uuid', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        data: { facility_id: 'not-a-uuid' },
      },
      { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
    );
    expect(ok).toBe(false);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('facility_id is required'));
  });

  it('rejects facility_admin for unassigned facility', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.FACILITY_ADMIN, facilityIds: ['other'] },
    );
    expect(ok).toBe(false);
  });

  it('allows facility_admin for assigned facility and sends initial snapshot without refresh nudge', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        subscriptionId: 'sub-1',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.FACILITY_ADMIN, facilityIds: [facilityId] },
    );
    expect(ok).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('access_code_push_state_update'));
    const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(payload.data.facility_id).toBe(facilityId);
    expect(payload.data.refresh_effective_codes).toBeUndefined();
  });

  it('broadcastPushState fans out only to matching facility subscribers', () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const wsMatch = mockWs();
    const wsOther = mockWs();
    const otherFacility = '22222222-2222-4222-8222-222222222222';

    return Promise.all([
      manager.handleSubscription(
        wsMatch,
        {
          type: 'subscription',
          subscriptionType: 'access_code_push_state',
          subscriptionId: 'sub-match',
          data: { facility_id: facilityId },
        },
        { userId: 'u1', userRole: UserRole.ADMIN, facilityIds: [] },
      ),
      manager.handleSubscription(
        wsOther,
        {
          type: 'subscription',
          subscriptionType: 'access_code_push_state',
          subscriptionId: 'sub-other',
          data: { facility_id: otherFacility },
        },
        { userId: 'u2', userRole: UserRole.ADMIN, facilityIds: [] },
      ),
    ]).then(() => {
      (wsMatch.send as jest.Mock).mockClear();
      (wsOther.send as jest.Mock).mockClear();

      manager.broadcastPushState(facilityId, {
        refreshEffectiveCodes: true,
        state: {
          facility_id: facilityId,
          status: 'pending',
          last_error: null,
          last_nonce: 'n1',
          updated_at: new Date('2026-01-02T00:00:00.000Z'),
        },
      });

      expect(wsMatch.send).toHaveBeenCalled();
      expect(wsOther.send).not.toHaveBeenCalled();
      const payload = JSON.parse((wsMatch.send as jest.Mock).mock.calls[0][0]);
      expect(payload.data.refresh_effective_codes).toBe(true);
      expect(payload.data.status).toBe('pending');
    });
  });

  it('broadcast without refresh flag omits refresh_effective_codes', async () => {
    const manager = new AccessCodePushStateSubscriptionManager();
    const ws = mockWs();
    await manager.handleSubscription(
      ws,
      {
        type: 'subscription',
        subscriptionType: 'access_code_push_state',
        subscriptionId: 'sub-1',
        data: { facility_id: facilityId },
      },
      { userId: 'u1', userRole: UserRole.DEV_ADMIN, facilityIds: [] },
    );
    (ws.send as jest.Mock).mockClear();

    manager.broadcastPushState(facilityId, {
      state: {
        facility_id: facilityId,
        status: 'error',
        last_error: 'boom',
        last_nonce: 'n2',
        updated_at: new Date('2026-01-03T00:00:00.000Z'),
      },
    });

    const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(payload.data.status).toBe('error');
    expect(payload.data.last_error).toBe('boom');
    expect(payload.data.refresh_effective_codes).toBeUndefined();
  });
});
