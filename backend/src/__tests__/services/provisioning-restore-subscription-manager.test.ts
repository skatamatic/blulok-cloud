/**
 * ProvisioningRestoreSubscriptionManager Unit Tests
 */

import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { ProvisioningRestoreSubscriptionManager } from '@/services/subscriptions/provisioning-restore-subscription-manager';

describe('ProvisioningRestoreSubscriptionManager', () => {
  let manager: ProvisioningRestoreSubscriptionManager;

  beforeEach(() => {
    manager = new ProvisioningRestoreSubscriptionManager();
  });

  it('returns provisioning_restore_progress subscription type', () => {
    expect(manager.getSubscriptionType()).toBe('provisioning_restore_progress');
  });

  it('allows admin roles to subscribe', () => {
    expect(manager.canSubscribe(UserRole.ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.DEV_ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.FACILITY_ADMIN)).toBe(true);
    expect(manager.canSubscribe(UserRole.TENANT)).toBe(false);
  });

  it('broadcasts progress to subscribed clients', async () => {
    const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
    const subscriptionId = 'sub-1';

    const watcherSet = new Set<WebSocket>();
    watcherSet.add(mockWs);
    (manager as any).watchers.set(subscriptionId, watcherSet);
    (manager as any).clientContext.set(subscriptionId, {
      userRole: UserRole.ADMIN,
      userId: 'admin-1',
    });

    await manager.broadcastProgress({
      restoreId: 'restore-1',
      backupId: 'backup-1',
      backupFilename: 'mesh.zip',
      gatewayId: 'gw-1',
      facilityId: 'facility-1',
      step: 'transferring',
      percent: 40,
      chunksTotal: 10,
      chunksSent: 4,
    });

    expect(mockWs.send).toHaveBeenCalled();
    const sentData = JSON.parse(mockWs.send.mock.calls[0][0]);
    expect(sentData.type).toBe('provisioning_restore_progress_update');
    expect(sentData.data.restoreId).toBe('restore-1');
    expect(sentData.data.percent).toBe(40);
  });

  it('scopes facility admin broadcasts to assigned facilities', async () => {
    const mockWs = { readyState: WebSocket.OPEN, send: jest.fn() } as any;
    const subscriptionId = 'sub-facility';

    const watcherSet = new Set<WebSocket>();
    watcherSet.add(mockWs);
    (manager as any).watchers.set(subscriptionId, watcherSet);
    (manager as any).clientContext.set(subscriptionId, {
      userRole: UserRole.FACILITY_ADMIN,
      userId: 'fac-admin-1',
      facilityIds: ['facility-2'],
    });

    await manager.broadcastProgress({
      restoreId: 'restore-1',
      backupId: 'backup-1',
      backupFilename: 'mesh.zip',
      gatewayId: 'gw-1',
      facilityId: 'facility-1',
      step: 'transferring',
      percent: 10,
    });

    expect(mockWs.send).not.toHaveBeenCalled();
  });
});
