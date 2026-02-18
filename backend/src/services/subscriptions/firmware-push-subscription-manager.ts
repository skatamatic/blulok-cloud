import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';

/**
 * Firmware Push Progress Payload Interface
 *
 * Defines the structure for real-time progress updates during firmware
 * push operations from cloud to gateway.
 */
export interface FirmwarePushProgressPayload {
  /** Push task identifier */
  pushId: string;
  /** Firmware image identifier */
  firmwareId: string;
  /** Target gateway identifier */
  gatewayId: string;
  /** Target facility identifier */
  facilityId: string;
  /** Firmware target type (gateway, lock, friend_node) — distinguishes concurrent pushes */
  targetType?: string;
  /** Current push step */
  step: 'pending' | 'manifest_sent' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  /** Progress percentage (0-100) */
  percent: number;
  /** Total number of chunks */
  chunksTotal?: number;
  /** Number of chunks sent so far */
  chunksSent?: number;
  /** Optional human-readable status message */
  message?: string;
  /** Optional timestamp override */
  timestamp?: string;
}

/**
 * FirmwarePushSubscriptionManager
 *
 * Manages real-time subscriptions to firmware push progress updates.
 * Mirrors the FMSSyncProgressSubscriptionManager pattern exactly.
 *
 * Subscription Type: 'firmware_push_progress'
 *
 * Access Control:
 * - ADMIN, DEV_ADMIN: Full system-wide visibility
 * - FACILITY_ADMIN: Limited to assigned facilities only
 * - Other roles: Access denied
 */
export class FirmwarePushSubscriptionManager extends BaseSubscriptionManager {
  getSubscriptionType(): string {
    return 'firmware_push_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    this.sendMessage(ws, {
      type: 'firmware_push_progress_update',
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    } as any);
  }

  /**
   * Broadcast a progress update to all eligible watchers respecting RBAC and facility scoping
   */
  public async broadcastProgress(payload: FirmwarePushProgressPayload): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      this.logger.info('[FirmwarePush] Broadcasting to subscriptions', {
        activeCount: activeSubscriptions.length,
        facilityId: payload.facilityId,
        step: payload.step,
        percent: payload.percent,
      });

      let sent = 0;
      let skipped = 0;

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) {
          skipped++;
          continue;
        }

        // RBAC / scoping: facility admin must be scoped to facilityId
        if (client.userRole === UserRole.FACILITY_ADMIN) {
          const facilityIds = client.facilityIds || [];
          if (!facilityIds.includes(payload.facilityId)) {
            skipped++;
            continue;
          }
        }

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) {
          skipped++;
          continue;
        }

        watchers.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              const message = JSON.stringify({
                type: 'firmware_push_progress_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              });
              ws.send(message);
              sent++;
            } catch (error) {
              this.logger.error('[FirmwarePush] Error sending to client', { subscriptionId, error });
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

      this.logger.info('[FirmwarePush] Broadcast complete', { sent, skipped });
    } catch (error) {
      this.logger.error('Error broadcasting firmware push progress update:', error);
    }
  }
}
