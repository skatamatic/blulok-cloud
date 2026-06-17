import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import type { GatewayRecoveryProgressPayload } from '@/services/gateway/gateway-recovery.service';

export class GatewayRecoverySubscriptionManager extends BaseSubscriptionManager {
  getSubscriptionType(): string {
    return 'gateway_recovery_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    ws.send(JSON.stringify({
      type: 'gateway_recovery_progress_update',
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    }));
  }

  public async broadcastProgress(payload: GatewayRecoveryProgressPayload): Promise<void> {
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

        watchers.forEach((wsConn) => {
          if (wsConn.readyState === WebSocket.OPEN) {
            try {
              wsConn.send(JSON.stringify({
                type: 'gateway_recovery_progress_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              }));
            } catch (error) {
              this.logger.error('[GatewayRecovery] Error sending to client', { subscriptionId, error });
              watchers.delete(wsConn);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
              }
            }
          } else {
            watchers.delete(wsConn);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Error broadcasting gateway recovery progress update:', error);
    }
  }
}
