jest.unmock('@/models/gateway.model');

import { GatewayStatusSubscriptionManager } from '@/services/subscriptions/gateway-status-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { WebSocket } from 'ws';
import { GatewayModel } from '@/models/gateway.model';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';

describe('GatewayStatusSubscriptionManager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('invalidateCache', () => {
    it('clears cached gateway rows and TTL so the next read refetches from the database', () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const inner = mgr as unknown as {
        cachedAllGateways: unknown[] | null;
        cacheLoadedAtMs: number;
      };
      inner.cachedAllGateways = [{ id: 'gw-1' }] as unknown[];
      inner.cacheLoadedAtMs = Date.now();

      mgr.invalidateCache();

      expect(inner.cachedAllGateways).toBeNull();
      expect(inner.cacheLoadedAtMs).toBe(0);
    });
  });

  describe('broadcastUpdate', () => {
    it('clears findAll cache even when there are no subscribers (next subscribe sees fresh DB)', async () => {
      const mgr = new GatewayStatusSubscriptionManager();
      const inner = mgr as unknown as {
        cachedAllGateways: unknown[] | null;
        cacheLoadedAtMs: number;
      };
      inner.cachedAllGateways = [{ id: 'stale' }] as unknown[];
      inner.cacheLoadedAtMs = Date.now();

      await mgr.broadcastUpdate('fac-1', 'gw-1');

      expect(inner.cachedAllGateways).toBeNull();
      expect(inner.cacheLoadedAtMs).toBe(0);
    });

    it('does not skip targeted broadcast when facilityIds is empty [] (regression: [] is truthy in JS)', async () => {
      jest.spyOn(GatewayModel.prototype, 'findAll').mockResolvedValue([
        { id: 'gw-a', facility_id: 'fac-1', name: 'A', status: 'online', last_seen: new Date() },
      ] as any);

      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = { readyState: WebSocket.OPEN, send: jest.fn() } as unknown as WebSocket;
      mgr['watchers'].set('sub-1', new Set([wsMock]));
      mgr['clientContext'].set('sub-1', {
        userId: 'u1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: [],
      });

      await mgr.broadcastUpdate('fac-1', 'gw-a');

      expect(wsMock.send).toHaveBeenCalled();
    });

    it('skips targeted broadcast when client has explicit facilities that exclude the event facility', async () => {
      jest.spyOn(GatewayModel.prototype, 'findAll').mockResolvedValue([
        { id: 'gw-a', facility_id: 'fac-1', name: 'A', status: 'online', last_seen: new Date() },
      ] as any);

      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = { readyState: WebSocket.OPEN, send: jest.fn() } as unknown as WebSocket;
      mgr['watchers'].set('sub-1', new Set([wsMock]));
      mgr['clientContext'].set('sub-1', {
        userId: 'u1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['fac-2'],
      });

      await mgr.broadcastUpdate('fac-1', 'gw-a');

      expect(wsMock.send).not.toHaveBeenCalled();
    });

    it('sends scoped gateway rows for admin when broadcasting a facility filter', async () => {
      jest.spyOn(GatewayModel.prototype, 'findAll').mockResolvedValue([
        { id: 'gw-a', facility_id: 'fac-1', name: 'A', status: 'online', last_seen: new Date() },
        { id: 'gw-b', facility_id: 'fac-2', name: 'B', status: 'offline', last_seen: new Date() },
      ] as any);

      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = { readyState: WebSocket.OPEN, send: jest.fn() } as unknown as WebSocket;
      mgr['watchers'].set('sub-admin', new Set([wsMock]));
      mgr['clientContext'].set('sub-admin', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
        facilityIds: undefined,
      });

      await mgr.broadcastUpdate('fac-1', 'gw-a');

      expect(wsMock.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse((wsMock.send as jest.Mock).mock.calls[0][0] as string);
      expect(msg.type).toBe('gateway_status_update');
      expect(msg.data.gateways).toHaveLength(1);
      expect(msg.data.gateways[0].id).toBe('gw-a');
      expect(msg.data.updatedGatewayId).toBe('gw-a');
    });

    it('enriches each gateway with the live inbound session signal (connected + lastActivityAt)', async () => {
      jest.spyOn(GatewayModel.prototype, 'findAll').mockResolvedValue([
        { id: 'gw-a', facility_id: 'fac-1', name: 'A', status: 'offline', last_seen: new Date() },
      ] as any);
      const lastActivityAt = Date.now();
      jest
        .spyOn(GatewayEventsService.getInstance(), 'getFacilityProductLiveness')
        .mockReturnValue({ connected: true, lastPongAt: lastActivityAt });

      const mgr = new GatewayStatusSubscriptionManager();
      const wsMock = { readyState: WebSocket.OPEN, send: jest.fn() } as unknown as WebSocket;
      mgr['watchers'].set('sub-admin', new Set([wsMock]));
      mgr['clientContext'].set('sub-admin', {
        userId: 'admin',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
        facilityIds: undefined,
      });

      await mgr.broadcastUpdate('fac-1', 'gw-a');

      const msg = JSON.parse((wsMock.send as jest.Mock).mock.calls[0][0] as string);
      expect(msg.data.gateways[0]).toMatchObject({
        id: 'gw-a',
        status: 'offline',
        connected: true,
        lastActivityAt,
      });
    });
  });
});
