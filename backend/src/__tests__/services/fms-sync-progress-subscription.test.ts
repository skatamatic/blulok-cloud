/**
 * Tests for FMS Sync Progress WebSocket subscription
 * 
 * RBAC and Security Tests:
 * - Verifies only ADMIN/DEV_ADMIN/FACILITY_ADMIN can subscribe
 * - Ensures FACILITY_ADMIN only receives progress for assigned facilities
 * - Confirms non-admin roles are blocked
 * - Tests facilityIds enforcement
 */

import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { FMSSyncProgressSubscriptionManager, FMSSyncProgressPayload } from '@/services/subscriptions/fms-sync-progress-subscription-manager';
import { SubscriptionClient } from '@/services/subscriptions/base-subscription-manager';

describe('FMSSyncProgressSubscriptionManager', () => {
  let manager: FMSSyncProgressSubscriptionManager;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    manager = new FMSSyncProgressSubscriptionManager();
    
    // Create mock WebSocket
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
    } as any;
  });

  describe('RBAC - Subscription Permissions', () => {
    it('should allow ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    });

    it('should allow DEV_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    });

    it('should allow FACILITY_ADMIN to subscribe', () => {
      expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    });

    it('should DENY TENANT from subscribing', () => {
      expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
    });

    it('should DENY MAINTENANCE from subscribing', () => {
      expect(manager.canSubscribe(UserRole.MAINTENANCE)).toBe(false);
    });
  });

  describe('Subscription Type', () => {
    it('should return correct subscription type', () => {
      expect(manager.getSubscriptionType()).toBe('fms_sync_progress');
    });
  });

  describe('Initial Data', () => {
    it('should send ready status as initial data', async () => {
      const client: SubscriptionClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-1',
        subscriptionType: 'fms_sync_progress',
      }, client);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"fms_sync_progress_update"')
      );
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"status":"ready"')
      );
    });
  });

  describe('SECURITY: Progress Broadcast - ADMIN/DEV_ADMIN', () => {
    it('should broadcast ALL facility progress to ADMIN users', async () => {
      const adminClient: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-admin',
        subscriptionType: 'fms_sync_progress',
      }, adminClient);

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 50,
        message: 'Fetching data',
      };

      await manager.broadcastProgress(payload);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"facilityId":"facility-1"')
      );
    });

    it('should broadcast ALL facility progress to DEV_ADMIN users', async () => {
      const devAdminClient: SubscriptionClient = {
        userId: 'dev-admin-1',
        userRole: UserRole.DEV_ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-dev-admin',
        subscriptionType: 'fms_sync_progress',
      }, devAdminClient);

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'detecting',
        percent: 70,
      };

      await manager.broadcastProgress(payload);

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"facilityId":"facility-1"')
      );
    });
  });

  describe('SECURITY: Progress Broadcast - FACILITY_ADMIN Scoping', () => {
    it('should broadcast progress for ASSIGNED facilities to FACILITY_ADMIN', async () => {
      const facilityAdminClient: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1', 'facility-2'], // Assigned facilities
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-facility-admin',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdminClient);

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'complete',
        percent: 100,
      };

      await manager.broadcastProgress(payload);

      // Should receive because facility-1 is in assigned list
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"facilityId":"facility-1"')
      );
    });

    it('should NOT broadcast progress for NON-ASSIGNED facilities to FACILITY_ADMIN', async () => {
      const mockWsSend = jest.fn();
      const mockWsFacilityAdmin = {
        readyState: WebSocket.OPEN,
        send: mockWsSend,
      } as any;

      const facilityAdminClient: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1', 'facility-2'], // Only these facilities
      };

      await manager.handleSubscription(mockWsFacilityAdmin, {
        type: 'subscription',
        subscriptionId: 'sub-facility-admin',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdminClient);

      // Clear initial data call
      mockWsSend.mockClear();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-999', // NOT in assigned list
        syncLogId: 'log-999',
        step: 'fetching',
        percent: 30,
      };

      await manager.broadcastProgress(payload);

      // Should NOT receive because facility-999 is not in assigned list
      const calls = mockWsSend.mock.calls;
      const receivedPayload = calls.length > 0 ? JSON.parse(calls[0][0]) : null;
      
      if (receivedPayload) {
        expect(receivedPayload.data?.facilityId).not.toBe('facility-999');
      }
    });

    it('should handle FACILITY_ADMIN with NO assigned facilities', async () => {
      const mockWsSend = jest.fn();
      const mockWsNoFacilities = {
        readyState: WebSocket.OPEN,
        send: mockWsSend,
      } as any;

      const facilityAdminClient: SubscriptionClient = {
        userId: 'facility-admin-no-access',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: [], // No facilities assigned
      };

      await manager.handleSubscription(mockWsNoFacilities, {
        type: 'subscription',
        subscriptionId: 'sub-no-facilities',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdminClient);

      // Clear initial data call
      mockWsSend.mockClear();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 30,
      };

      await manager.broadcastProgress(payload);

      // Should NOT receive any progress
      const progressCalls = mockWsSend.mock.calls.filter(call => {
        const msg = JSON.parse(call[0]);
        return msg.type === 'fms_sync_progress_update' && msg.data?.facilityId;
      });

      expect(progressCalls.length).toBe(0);
    });

    it('should handle FACILITY_ADMIN with undefined facilityIds', async () => {
      const mockWsSend = jest.fn();
      const mockWsUndefinedFacilities = {
        readyState: WebSocket.OPEN,
        send: mockWsSend,
      } as any;

      const facilityAdminClient: SubscriptionClient = {
        userId: 'facility-admin-undefined',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        // facilityIds is undefined (not provided)
      };

      await manager.handleSubscription(mockWsUndefinedFacilities, {
        type: 'subscription',
        subscriptionId: 'sub-undefined',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdminClient);

      // Clear initial data call
      mockWsSend.mockClear();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 30,
      };

      await manager.broadcastProgress(payload);

      // Should NOT receive (undefined treated as empty array)
      const progressCalls = mockWsSend.mock.calls.filter(call => {
        const msg = JSON.parse(call[0]);
        return msg.type === 'fms_sync_progress_update' && msg.data?.facilityId;
      });

      expect(progressCalls.length).toBe(0);
    });
  });

  describe('Progress Payload Data Contract', () => {
    it('should broadcast all progress fields correctly', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-1',
        subscriptionType: 'fms_sync_progress',
      }, client);

      mockWs.send = jest.fn();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'detecting',
        percent: 65,
        message: 'Analyzing tenants',
        timestamp: '2025-01-01T00:00:00.000Z',
      };

      await manager.broadcastProgress(payload);

      const sentData = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
      
      expect(sentData.type).toBe('fms_sync_progress_update');
      expect(sentData.data.facilityId).toBe('facility-1');
      expect(sentData.data.syncLogId).toBe('log-1');
      expect(sentData.data.step).toBe('detecting');
      expect(sentData.data.percent).toBe(65);
      expect(sentData.data.message).toBe('Analyzing tenants');
    });

    it('should include timestamp in broadcast', async () => {
      const client: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs, {
        type: 'subscription',
        subscriptionId: 'sub-1',
        subscriptionType: 'fms_sync_progress',
      }, client);

      mockWs.send = jest.fn();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'complete',
        percent: 100,
      };

      await manager.broadcastProgress(payload);

      const sentData = JSON.parse((mockWs.send as jest.Mock).mock.calls[0][0]);
      expect(sentData.timestamp).toBeDefined();
    });
  });

  describe('WebSocket Connection Management', () => {
    it('should remove closed connections during broadcast', async () => {
      const mockWsClosed = {
        readyState: WebSocket.CLOSED,
        send: jest.fn(),
      } as any;

      const client: SubscriptionClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWsClosed, {
        type: 'subscription',
        subscriptionId: 'sub-closed',
        subscriptionType: 'fms_sync_progress',
      }, client);

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 30,
      };

      await manager.broadcastProgress(payload);

      // Should not send to closed connection
      expect(mockWsClosed.send).not.toHaveBeenCalled();
    });

    it('should handle send errors gracefully during broadcast', async () => {
      // First subscribe with good ws
      const mockWsGood = {
        readyState: WebSocket.OPEN,
        send: jest.fn(),
      } as any;

      const client: SubscriptionClient = {
        userId: 'user-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWsGood, {
        type: 'subscription',
        subscriptionId: 'sub-good',
        subscriptionType: 'fms_sync_progress',
      }, client);

      // Replace with error-throwing ws for broadcast test
      const mockWsError = {
        readyState: WebSocket.OPEN,
        send: jest.fn(() => {
          throw new Error('Send failed');
        }),
      } as any;

      // Directly add the error ws to watchers to test broadcast error handling
      const watchers = (manager as any).watchers.get('sub-good');
      if (watchers) {
        watchers.add(mockWsError);
      }

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 30,
      };

      // Should not throw even with error during send
      await expect(manager.broadcastProgress(payload)).resolves.not.toThrow();
    });
  });

  describe('Multiple Subscribers', () => {
    it('should broadcast to multiple ADMIN subscribers', async () => {
      const mockWs1 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWs2 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;

      const client1: SubscriptionClient = {
        userId: 'admin-1',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      const client2: SubscriptionClient = {
        userId: 'admin-2',
        userRole: UserRole.ADMIN,
        subscriptions: new Map(),
      };

      await manager.handleSubscription(mockWs1, {
        type: 'subscription',
        subscriptionId: 'sub-1',
        subscriptionType: 'fms_sync_progress',
      }, client1);

      await manager.handleSubscription(mockWs2, {
        type: 'subscription',
        subscriptionId: 'sub-2',
        subscriptionType: 'fms_sync_progress',
      }, client2);

      mockWs1.send = jest.fn();
      mockWs2.send = jest.fn();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'fetching',
        percent: 50,
      };

      await manager.broadcastProgress(payload);

      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).toHaveBeenCalled();
    });

    it('should correctly scope multiple FACILITY_ADMIN subscribers', async () => {
      const mockWs1 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;
      const mockWs2 = { send: jest.fn(), readyState: WebSocket.OPEN } as any;

      const facilityAdmin1: SubscriptionClient = {
        userId: 'facility-admin-1',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-1'],
      };

      const facilityAdmin2: SubscriptionClient = {
        userId: 'facility-admin-2',
        userRole: UserRole.FACILITY_ADMIN,
        subscriptions: new Map(),
        facilityIds: ['facility-2'],
      };

      await manager.handleSubscription(mockWs1, {
        type: 'subscription',
        subscriptionId: 'sub-fa1',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdmin1);

      await manager.handleSubscription(mockWs2, {
        type: 'subscription',
        subscriptionId: 'sub-fa2',
        subscriptionType: 'fms_sync_progress',
      }, facilityAdmin2);

      mockWs1.send = jest.fn();
      mockWs2.send = jest.fn();

      const payload: FMSSyncProgressPayload = {
        facilityId: 'facility-1',
        syncLogId: 'log-1',
        step: 'complete',
        percent: 100,
      };

      await manager.broadcastProgress(payload);

      // Only facility-admin-1 should receive (has facility-1)
      expect(mockWs1.send).toHaveBeenCalled();
      expect(mockWs2.send).not.toHaveBeenCalled();
    });
  });
});

