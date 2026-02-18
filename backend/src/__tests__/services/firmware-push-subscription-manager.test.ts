/**
 * FirmwarePushSubscriptionManager Unit Tests
 *
 * Tests access control, broadcast delivery, facility scoping, and connection cleanup.
 * Follows the same pattern as fms-sync-progress-subscription.test.ts.
 */

import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { FirmwarePushSubscriptionManager } from '@/services/subscriptions/firmware-push-subscription-manager';

describe('FirmwarePushSubscriptionManager', () => {
  let manager: FirmwarePushSubscriptionManager;

  beforeEach(() => {
    manager = new FirmwarePushSubscriptionManager();
  });

  describe('getSubscriptionType', () => {
    it('should return firmware_push_progress', () => {
      expect(manager.getSubscriptionType()).toBe('firmware_push_progress');
    });
  });

  describe('canSubscribe', () => {
    it('should allow ADMIN', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    });

    it('should allow DEV_ADMIN', () => {
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    });

    it('should allow FACILITY_ADMIN', () => {
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    });

    it('should deny TENANT', () => {
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
    });

    it('should deny MAINTENANCE', () => {
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(false);
    });
  });

  describe('broadcastProgress', () => {
    const payload = {
      pushId: 'push-1',
      firmwareId: 'fw-1',
      gatewayId: 'gw-1',
      facilityId: 'facility-1',
      step: 'transferring' as const,
      percent: 50,
      chunksTotal: 10,
      chunksSent: 5,
    };

    it('should send to open WebSocket connections', async () => {
      const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
      const subscriptionId = 'sub-1';

      // Register watcher
      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.ADMIN,
        userId: 'admin-1',
      });

      await manager.broadcastProgress(payload);

      expect(mockWs.send).toHaveBeenCalled();
      const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
      expect(sentData.type).toBe('firmware_push_progress_update');
      expect(sentData.data.pushId).toBe('push-1');
      expect(sentData.data.percent).toBe(50);
    });

    it('should respect facility scoping for FACILITY_ADMIN', async () => {
      const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
      const subscriptionId = 'sub-2';

      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.FACILITY_ADMIN,
        userId: 'fa-1',
        facilityIds: ['other-facility'],
      });

      await manager.broadcastProgress(payload);

      // Should NOT receive because facility-1 is not in assigned list
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should send to FACILITY_ADMIN scoped to correct facility', async () => {
      const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
      const subscriptionId = 'sub-3';

      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.FACILITY_ADMIN,
        userId: 'fa-2',
        facilityIds: ['facility-1', 'facility-2'],
      });

      await manager.broadcastProgress(payload);
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should skip closed WebSocket connections', async () => {
      const mockWs = { readyState: WebSocket.CLOSED, send: jest.fn() } as any;
      const subscriptionId = 'sub-4';

      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.ADMIN,
        userId: 'admin-1',
      });

      await manager.broadcastProgress(payload);
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('should clean up dead connections', async () => {
      const mockWs = { readyState: WebSocket.CLOSED, send: jest.fn() } as any;
      const subscriptionId = 'sub-5';

      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.ADMIN,
        userId: 'admin-1',
      });

      await manager.broadcastProgress(payload);

      // Connection should be cleaned up
      expect(watcherSet.size).toBe(0);
    });

    it('should handle no subscribers gracefully', async () => {
      await expect(manager.broadcastProgress(payload)).resolves.not.toThrow();
    });

    it('should handle send errors gracefully', async () => {
      const mockWs = {
        readyState: WebSocket.OPEN,
        send: jest.fn().mockImplementation(() => { throw new Error('Send failed'); }),
      } as any;
      const subscriptionId = 'sub-6';

      const watcherSet = new Set<WebSocket>();
      watcherSet.add(mockWs);
      (manager as any).watchers.set(subscriptionId, watcherSet);
      (manager as any).clientContext.set(subscriptionId, {
        userRole: UserRole.ADMIN,
        userId: 'admin-1',
      });

      await expect(manager.broadcastProgress(payload)).resolves.not.toThrow();
    });

    it('should broadcast to multiple subscribers', async () => {
      const mockWs1 = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
      const mockWs2 = { readyState: WebSocket.OPEN, send: jest.fn() } as any;

      const watcherSet1 = new Set<WebSocket>();
      watcherSet1.add(mockWs1);
      (manager as any).watchers.set('sub-a', watcherSet1);
      (manager as any).clientContext.set('sub-a', {
        userRole: UserRole.ADMIN,
        userId: 'admin-1',
      });

      const watcherSet2 = new Set<WebSocket>();
      watcherSet2.add(mockWs2);
      (manager as any).watchers.set('sub-b', watcherSet2);
      (manager as any).clientContext.set('sub-b', {
        userRole: UserRole.DEV_ADMIN,
        userId: 'dev-1',
      });

      await manager.broadcastProgress(payload);

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });
  });
});
