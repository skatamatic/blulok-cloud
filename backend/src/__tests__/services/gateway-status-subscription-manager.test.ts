jest.unmock('@/models/gateway.model');

import { GatewayStatusSubscriptionManager } from '@/services/subscriptions/gateway-status-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';
import { GatewayModel } from '@/models/gateway.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

const TEST_FACILITY_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TEST_FACILITY_ID_2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
const TEST_GATEWAY_ID = 'g47ac10b-58cc-4372-a567-0e02b2c3d479';

const openWs = () =>
  ({
    send: jest.fn(),
    readyState: WebSocket.OPEN,
  }) as any;

const sampleGateways = [
  {
    id: TEST_GATEWAY_ID,
    facility_id: TEST_FACILITY_ID,
    name: 'GW-A',
    status: 'online',
    last_seen: new Date('2025-01-01T00:00:00Z'),
  },
  {
    id: 'g47ac10b-58cc-4372-a567-0e02b2c3d480',
    facility_id: TEST_FACILITY_ID_2,
    name: 'GW-B',
    status: 'offline',
    last_seen: new Date('2025-01-02T00:00:00Z'),
  },
] as any;

describe('GatewayStatusSubscriptionManager', () => {
  let findAllSpy: jest.SpyInstance;

  beforeEach(() => {
    findAllSpy = jest.spyOn(GatewayModel.prototype, 'findAll').mockResolvedValue(sampleGateways);
    jest.spyOn(GatewayEventsService.getInstance(), 'getFacilityProductLiveness').mockReturnValue({
      connected: true,
      lastPongAt: 12345,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('basics', () => {
    it('returns gateway_status type', () => {
      const mgr = new GatewayStatusSubscriptionManager();
      expect(mgr.getSubscriptionType()).toBe('gateway_status');
    });

    it('restricts facility-scoped subscribe to admin roles', () => {
      const mgr = new GatewayStatusSubscriptionManager();
      expect(mgr.canSubscribe(UserRole.TENANT, { facilityScoped: true })).toBe(false);
      expect(mgr.canSubscribe(UserRole.FACILITY_ADMIN, { facilityScoped: true })).toBe(true);
      expect(mgr.canSubscribe(UserRole.TENANT)).toBe(true);
    });

    it('invalidateCache clears cached rows and TTL', () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const inner = mgr as any;
      inner.cachedAllGateways = [{ id: 'gw-1' }];
      inner.cacheLoadedAtMs = Date.now();
      mgr.invalidateCache();
      expect(inner.cachedAllGateways).toBeNull();
      expect(inner.cacheLoadedAtMs).toBe(0);
    });
  });

  describe('handleSubscription', () => {
    it('subscribes without facility filter for any role', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const client = {
        userId: 'u1',
        userRole: UserRole.TENANT,
        subscriptions: new Map(),
        facilityIds: [TEST_FACILITY_ID],
      };

      const result = await mgr.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'gateway_status', subscriptionId: 'sub-1' },
        client,
      );

      expect(result).toBe(true);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.type).toBe('gateway_status_update');
      expect(msg.data.gateways).toHaveLength(1);
      expect(msg.data.gateways[0]).toMatchObject({
        id: TEST_GATEWAY_ID,
        connected: true,
        lastActivityAt: 12345,
      });
    });

    it('rejects invalid facility UUID', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const result = await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          data: { facilityId: 'bad' },
        },
        {
          userId: 'u1',
          userRole: UserRole.ADMIN,
          subscriptions: new Map(),
        },
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Invalid facility ID');
    });

    it('rejects facility-scoped subscribe for tenant', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const result = await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          data: { facility_id: TEST_FACILITY_ID },
        },
        {
          userId: 'u1',
          userRole: UserRole.TENANT,
          subscriptions: new Map(),
          facilityIds: [TEST_FACILITY_ID],
        },
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('admin role');
    });

    it('rejects facility the admin role cannot access', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const result = await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          data: { facilityId: TEST_FACILITY_ID_2 },
        },
        {
          userId: 'u1',
          userRole: UserRole.FACILITY_ADMIN,
          subscriptions: new Map(),
          facilityIds: [TEST_FACILITY_ID],
        },
      );
      expect(result).toBe(false);
      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('do not have access');
    });

    it('facility-scoped facility admin receives only that facility', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const result = await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          subscriptionId: 'sub-fac',
          data: { facilityId: TEST_FACILITY_ID },
        },
        {
          userId: 'u1',
          userRole: UserRole.FACILITY_ADMIN,
          subscriptions: new Map(),
          facilityIds: [TEST_FACILITY_ID],
        },
      );
      expect(result).toBe(true);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.gateways).toHaveLength(1);
      expect(msg.data.gateways[0].facilityId).toBe(TEST_FACILITY_ID);
    });

    it('sends error when initial load fails and records pool backoff', async () => {
      findAllSpy.mockRejectedValue(new Error('Timeout acquiring a connection from pool'));
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();

      await mgr.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'gateway_status', subscriptionId: 'sub-err' },
        {
          userId: 'u1',
          userRole: UserRole.ADMIN,
          subscriptions: new Map(),
        },
      );

      expect(JSON.parse(ws.send.mock.calls[0][0]).error).toContain('Failed to load gateway status');
      expect((mgr as any).dbBackoffUntilMs).toBeGreaterThan(Date.now());
    });
  });

  describe('handleUnsubscription / cleanup', () => {
    it('clears facility filter map on unsubscription and cleanup', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const client = {
        userId: 'u1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          subscriptionId: 'sub-u',
          data: { facilityId: TEST_FACILITY_ID },
        },
        client,
      );

      mgr.handleUnsubscription(ws, { type: 'unsubscription', subscriptionId: 'sub-u' }, client);
      expect((mgr as any).subscriptionFacilityIds.has('sub-u')).toBe(false);

      await mgr.handleSubscription(
        ws,
        {
          type: 'subscription',
          subscriptionType: 'gateway_status',
          subscriptionId: 'sub-c',
          data: { facilityId: TEST_FACILITY_ID },
        },
        client,
      );
      mgr.cleanup(ws, client);
      expect((mgr as any).subscriptionFacilityIds.has('sub-c')).toBe(false);
    });
  });

  describe('caching', () => {
    it('reuses cached gateways within TTL', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      const client = {
        userId: 'u1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await mgr.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'gateway_status', subscriptionId: 'sub-a' },
        client,
      );
      await mgr.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'gateway_status', subscriptionId: 'sub-b' },
        client,
      );

      expect(findAllSpy).toHaveBeenCalledTimes(1);
    });

    it('returns empty/cached list while DB backoff is active', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      (mgr as any).dbBackoffUntilMs = Date.now() + 60_000;
      (mgr as any).cachedAllGateways = null;
      (mgr as any).cacheLoadedAtMs = 0;

      const ws = openWs();
      await mgr.handleSubscription(
        ws,
        { type: 'subscription', subscriptionType: 'gateway_status', subscriptionId: 'sub-backoff' },
        {
          userId: 'u1',
          userRole: UserRole.ADMIN,
          subscriptions: new Map(),
        },
      );

      expect(findAllSpy).not.toHaveBeenCalled();
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.gateways).toEqual([]);
    });

    it('coalesces concurrent findAll calls via in-flight promise', async () => {
      let resolveFind: (v: any) => void;
      findAllSpy.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFind = resolve;
          }),
      );

      const mgr = new GatewayStatusSubscriptionManager();
      const p1 = (mgr as any).getAllGatewaysCached();
      const p2 = (mgr as any).getAllGatewaysCached();
      resolveFind!(sampleGateways);
      const [a, b] = await Promise.all([p1, p2]);
      expect(a).toBe(b);
      expect(findAllSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('broadcastUpdate', () => {
    it('clears findAll cache even when there are no subscribers', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const inner = mgr as any;
      inner.cachedAllGateways = [{ id: 'stale' }];
      inner.cacheLoadedAtMs = Date.now();
      await mgr.broadcastUpdate('fac-1', 'gw-1');
      expect(inner.cachedAllGateways).toBeNull();
    });

    it('does not skip targeted broadcast when facilityIds is empty []', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = openWs();
      mgr['watchers'].set('sub-1', new Set([wsMock]));
      mgr['clientContext'].set('sub-1', {
        userId: 'u1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: [],
      });

      await mgr.broadcastUpdate(TEST_FACILITY_ID, TEST_GATEWAY_ID);
      expect(wsMock.send).toHaveBeenCalled();
    });

    it('skips targeted broadcast when client facilities exclude event facility', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = openWs();
      mgr['watchers'].set('sub-1', new Set([wsMock]));
      mgr['clientContext'].set('sub-1', {
        userId: 'u1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: [TEST_FACILITY_ID_2],
      });

      await mgr.broadcastUpdate(TEST_FACILITY_ID, TEST_GATEWAY_ID);
      expect(wsMock.send).not.toHaveBeenCalled();
    });

    it('skips facility-scoped subscription when event facility differs', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = openWs();
      mgr['watchers'].set('sub-1', new Set([wsMock]));
      mgr['clientContext'].set('sub-1', {
        userId: 'u1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: [TEST_FACILITY_ID],
      });
      (mgr as any).subscriptionFacilityIds.set('sub-1', TEST_FACILITY_ID);

      await mgr.broadcastUpdate(TEST_FACILITY_ID_2, TEST_GATEWAY_ID);
      expect(wsMock.send).not.toHaveBeenCalled();
    });

    it('sends scoped gateway rows for admin when broadcasting a facility filter', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = openWs();
      mgr['watchers'].set('sub-admin', new Set([wsMock]));
      mgr['clientContext'].set('sub-admin', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
        facilityIds: undefined,
      });

      await mgr.broadcastUpdate(TEST_FACILITY_ID, TEST_GATEWAY_ID);

      const msg = JSON.parse(wsMock.send.mock.calls[0][0]);
      expect(msg.data.gateways).toHaveLength(1);
      expect(msg.data.gateways[0].id).toBe(TEST_GATEWAY_ID);
      expect(msg.data.updatedGatewayId).toBe(TEST_GATEWAY_ID);
    });

    it('removes closed sockets and cleans empty subscriptions', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const closed = { send: jest.fn(), readyState: WebSocket.CLOSED } as any;
      mgr['watchers'].set('sub-closed', new Set([closed]));
      mgr['clientContext'].set('sub-closed', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      await mgr.broadcastUpdate();

      expect(closed.send).not.toHaveBeenCalled();
      expect(mgr['watchers'].has('sub-closed')).toBe(false);
      expect((mgr as any).subscriptionFacilityIds.has('sub-closed')).toBe(false);
    });

    it('removes sockets that throw on send', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const bad = {
        send: jest.fn(() => {
          throw new Error('boom');
        }),
        readyState: WebSocket.OPEN,
      } as any;
      mgr['watchers'].set('sub-bad', new Set([bad]));
      mgr['clientContext'].set('sub-bad', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      await mgr.broadcastUpdate();
      expect(mgr['watchers'].has('sub-bad')).toBe(false);
    });

    it('records pool backoff when broadcast findAll fails', async () => {
      findAllSpy.mockRejectedValue(new Error('Timeout acquiring a connection from the pool'));
      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      mgr['watchers'].set('sub-1', new Set([ws]));
      mgr['clientContext'].set('sub-1', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      await mgr.broadcastUpdate();
      expect((mgr as any).dbBackoffUntilMs).toBeGreaterThan(Date.now());
    });

    it('continues when liveness enrichment fails', async () => {
      jest
        .spyOn(GatewayEventsService.getInstance(), 'getFacilityProductLiveness')
        .mockImplementation(() => {
          throw new Error('liveness down');
        });

      const mgr = new GatewayStatusSubscriptionManager();
      const ws = openWs();
      mgr['watchers'].set('sub-1', new Set([ws]));
      mgr['clientContext'].set('sub-1', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      });

      await mgr.broadcastUpdate();
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.data.gateways[0].connected).toBeNull();
    });
  });
});



