import { GatewayStatusSubscriptionManager } from '@/services/subscriptions/gateway-status-subscription-manager';

describe('GatewayStatusSubscriptionManager', () => {
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
});
