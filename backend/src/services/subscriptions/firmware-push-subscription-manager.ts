import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { FirmwarePushModel } from '@/models/firmware-push.model';
import { FirmwarePushEventModel } from '@/models/firmware-push-event.model';

/**
 * Firmware Push Progress Payload Interface
 *
 * Defines the structure for real-time progress updates during firmware
 * push operations from cloud to gateway.
 */
export interface FirmwarePushProgressPayload {
  pushId: string;
  firmwareId: string;
  gatewayId: string;
  facilityId: string;
  targetType?: string;
  step: 'pending' | 'manifest_sent' | 'transferring' | 'distributing' | 'installing' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  percent: number;
  chunksTotal?: number;
  chunksSent?: number;
  message?: string;
  timestamp?: string;
  /** Gateway-reported phase (distributing, installing, verifying, etc.) */
  phase?: string;
  /** Total devices targeted by this push */
  devicesTotal?: number;
  /** Devices that have completed the update */
  devicesComplete?: number;
  /** Devices that failed the update */
  devicesFailed?: number;
  /** Per-device status details (when gateway reports them) */
  devices?: Array<{
    device_id: string;
    status: string;
    progress_percent?: number;
    error?: string;
  }>;
  /** Error details (when gateway reports them) */
  error?: {
    code?: string;
    message: string;
    severity?: string;
  };
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
  private pushModel: FirmwarePushModel;
  private pushEventModel: FirmwarePushEventModel;

  constructor() {
    super();
    this.pushModel = new FirmwarePushModel();
    this.pushEventModel = new FirmwarePushEventModel();
  }

  getSubscriptionType(): string {
    return 'firmware_push_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      // Load active pushes scoped by role
      let activePushes;
      if (client.userRole === UserRole.FACILITY_ADMIN) {
        activePushes = await this.pushModel.findActiveByFacilities(client.facilityIds || []);
      } else {
        activePushes = await this.pushModel.findAllActive();
      }

      // For each active push, load recent events and device statuses
      const pushSnapshots = await Promise.all(
        activePushes.map(async (push) => {
          const [recentEvents, deviceStatuses] = await Promise.all([
            this.pushEventModel.findByPushId(push.id, 20),
            this.pushEventModel.getDeviceStatuses(push.id),
          ]);
          return {
            push,
            recentEvents,
            deviceStatuses,
          };
        }),
      );

      const message = JSON.stringify({
        type: 'firmware_push_progress_update',
        subscriptionId,
        data: { status: 'ready', activePushes: pushSnapshots },
        timestamp: new Date().toISOString(),
      });
      ws.send(message);
    } catch (error) {
      this.logger.error('[FirmwarePush] Error sending initial data', { error });
      const fallback = JSON.stringify({
        type: 'firmware_push_progress_update',
        subscriptionId,
        data: { status: 'ready', activePushes: [] },
        timestamp: new Date().toISOString(),
      });
      ws.send(fallback);
    }
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
