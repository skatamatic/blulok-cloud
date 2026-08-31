import { GatewayStatusSubscriptionManager } from '@/services/subscriptions/gateway-status-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';

const mockFindAll = jest.fn();
jest.mock('@/models/gateway.model', () => ({
  GatewayModel: jest.fn().mockImplementation(() => ({
    findAll: (...args: unknown[]) => mockFindAll(...args),
  })),
}));

const mockGetFacilityProductLiveness = jest.fn(() => ({
  connected: true,
  lastPongAt: 123456,
}));

jest.mock('@/services/gateway/gateway-events.service', () => ({
  GatewayEventsService: {
    getInstance: jest.fn(() => ({
      getFacilityProductLiveness: mockGetFacilityProductLiveness,
    })),
  },
}));

const FACILITY_A = '550e8400-e29b-41d4-a716-446655440001';
const FACILITY_B = '550e8400-e29b-41d4-a716-446655440002';

function mockWs(): WebSocket {
  return {
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket;
}

describe('GatewayStatusSubscriptionManager', () => {
  let manager: GatewayStatusSubscriptionManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new GatewayStatusSubscriptionManager();
    mockFindAll.mockResolvedValue([
      {
        id: 'gw-1',
        facility_id: FACILITY_A,
        name: 'GW A',
        status: 'online',
        last_seen: new Date().toISOString(),
      },
      {
        id: 'gw-2',
        facility_id: FACILITY_B,
        name: 'GW B',
        status: 'offline',
        last_seen: new Date().toISOString(),
      },
    ]);
  });

  it('reports subscription type', () => {
    expect(manager.getSubscriptionType()).toBe('gateway_status');
  });

  it('allows facility-scoped subscribe only for admin roles', () => {
    expect(manager.canSubscribe(UserRole.ADMIN, { facilityScoped: true })).toBe(true);
    expect(manager.canSubscribe(UserRole.FACILITY_ADMIN, { facilityScoped: true })).toBe(true);
    expect(manager.canSubscribe(UserRole.TENANT, { facilityScoped: true })).toBe(false);
    expect(manager.canSubscribe(UserRole.TENANT)).toBe(true);
  });

  it('rejects invalid facility UUID', async () => {
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: 'not-a-uuid' } } as any,
      { userId: 'u1', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    expect(ok).toBe(false);
    expect(ws.send).toHaveBeenCalled();
  });

  it('rejects facility-scoped subscribe for tenant', async () => {
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: FACILITY_A }, subscriptionId: 'sub-1' } as any,
      { userId: 't1', userRole: UserRole.TENANT, facilityIds: [FACILITY_A], subscriptions: new Map() },
    );
    expect(ok).toBe(false);
  });

  it('rejects facility the FA cannot access', async () => {
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: FACILITY_B }, subscriptionId: 'sub-2' } as any,
      {
        userId: 'fa1',
        userRole: UserRole.FACILITY_ADMIN,
        facilityIds: [FACILITY_A],
        subscriptions: new Map(),
      },
    );
    expect(ok).toBe(false);
  });

  it('subscribes admin facility-scoped and sends initial payload', async () => {
    const ws = mockWs();
    const ok = await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: FACILITY_A }, subscriptionId: 'sub-a' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    expect(ok).toBe(true);
    expect(mockFindAll).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalled();
    const payload = JSON.parse((ws.send as jest.Mock).mock.calls[0][0]);
    expect(payload.type).toBe('gateway_status_update');
    expect(payload.data.gateways).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gw-1', facilityId: FACILITY_A, connected: true }),
      ]),
    );
  });

  it('broadcastUpdate skips unrelated facility scopes and delivers to matching watchers', async () => {
    const ws = mockWs();
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: FACILITY_A }, subscriptionId: 'sub-a' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    (ws.send as jest.Mock).mockClear();

    await manager.broadcastUpdate(FACILITY_B);
    expect(ws.send).not.toHaveBeenCalled();

    await manager.broadcastUpdate(FACILITY_A, 'gw-1');
    expect(ws.send).toHaveBeenCalled();
  });

  it('broadcastUpdate no-ops when there are no watchers', async () => {
    await manager.broadcastUpdate(FACILITY_A);
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('unsubscription clears facility map entry', async () => {
    const ws = mockWs();
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', data: { facility_id: FACILITY_A }, subscriptionId: 'sub-x' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    manager.handleUnsubscription(
      ws,
      { type: 'unsubscribe', subscriptionId: 'sub-x' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    (ws.send as jest.Mock).mockClear();
    await manager.broadcastUpdate(FACILITY_A);
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('returns cached gateways within TTL', async () => {
    const ws = mockWs();
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', subscriptionId: 'sub-cache' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    const calls = mockFindAll.mock.calls.length;
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', subscriptionId: 'sub-cache-2' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    expect(mockFindAll.mock.calls.length).toBe(calls);
  });

  it('invalidateCache forces a fresh findAll', async () => {
    const ws = mockWs();
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', subscriptionId: 'sub-1' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    manager.invalidateCache();
    await manager.handleSubscription(
      ws,
      { type: 'subscribe', subscriptionId: 'sub-2' } as any,
      { userId: 'admin', userRole: UserRole.ADMIN, subscriptions: new Map() },
    );
    expect(mockFindAll.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
