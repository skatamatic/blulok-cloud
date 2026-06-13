import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';

export interface ProvisioningRestoreProgressPayload {
  restoreId: string;
  backupId: string;
  backupFilename: string;
  gatewayId: string;
  facilityId: string;
  step: 'pending' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  percent: number;
  chunksTotal?: number;
  chunksSent?: number;
  message?: string;
  timestamp?: string;
}

export class ProvisioningRestoreSubscriptionManager extends BaseSubscriptionManager {
  getSubscriptionType(): string {
    return 'provisioning_restore_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    ws.send(JSON.stringify({
      type: 'provisioning_restore_progress_update',
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    }));
  }

  public async broadcastProgress(payload: ProvisioningRestoreProgressPayload): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) continue;

        if (client.userRole === UserRole.FACILITY_ADMIN) {
          const facilityIds = client.facilityIds || [];
          if (!facilityIds.includes(payload.facilityId)) continue;
        }

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;

        watchers.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'provisioning_restore_progress_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              }));
            } catch (error) {
              this.logger.error('[ProvisioningRestore] Error sending to client', { subscriptionId, error });
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
              }
            }
          } else {
            watchers.delete(ws);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Error broadcasting provisioning restore progress update:', error);
    }
  }
}
