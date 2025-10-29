import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';

/**
 * FMS Sync Progress Payload Interface
 *
 * Defines the structure for real-time progress updates during FMS synchronization operations.
 * Provides detailed step-by-step progress information for long-running sync processes.
 */
export interface FMSSyncProgressPayload {
  /** Target facility identifier */
  facilityId: string;
  /** Sync log identifier for tracking */
  syncLogId: string;
  /** Current synchronization step */
  step: 'connecting' | 'fetching' | 'detecting' | 'preparing' | 'complete' | 'cancelled' | 'failed';
  /** Progress percentage (0-100) */
  percent: number;
  /** Optional human-readable status message */
  message?: string;
  /** Optional timestamp override */
  timestamp?: string;
}

/**
 * FMS Sync Progress Subscription Manager
 *
 * Manages real-time subscriptions to detailed FMS synchronization progress updates.
 * Provides granular visibility into long-running sync operations with step-by-step progress.
 *
 * Subscription Type: 'fms_sync_progress'
 *
 * Key Features:
 * - Real-time sync progress monitoring with percentage completion
 * - Step-by-step progress updates (connecting → fetching → detecting → preparing → complete)
 * - Facility-scoped progress visibility
 * - Error state reporting and cancellation notifications
 * - Progress bar support for UI components
 *
 * Data Provided:
 * - Current sync step and percentage completion
 * - Facility-specific progress updates
 * - Error messages and failure notifications
 * - Sync cancellation and completion events
 * - Real-time status messages for user feedback
 *
 * Access Control:
 * - ADMIN, DEV_ADMIN: Full system-wide progress visibility
 * - FACILITY_ADMIN: Limited to assigned facilities only
 * - Other roles: Access denied
 *
 * Sync Steps:
 * - connecting: Establishing connection to FMS provider
 * - fetching: Downloading tenant/unit data from FMS
 * - detecting: Comparing local vs remote data for changes
 * - preparing: Preparing changes for application
 * - complete: Sync finished successfully
 * - cancelled: Sync operation was cancelled
 * - failed: Sync encountered unrecoverable errors
 */
export class FMSSyncProgressSubscriptionManager extends BaseSubscriptionManager {
  getSubscriptionType(): string {
    return 'fms_sync_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    // Only ADMIN, DEV_ADMIN, and FACILITY_ADMIN can subscribe to FMS sync progress
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    // No initial payload for progress; it is real-time only
    this.sendMessage(ws, {
      type: 'fms_sync_progress_update',
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    } as any);
  }

  /**
   * Broadcast a progress update to all eligible watchers respecting RBAC and facility scoping
   */
  public async broadcastProgress(payload: FMSSyncProgressPayload): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      this.logger.info('[FMSSyncProgress] Broadcasting to subscriptions', {
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
            this.logger.info('[FMSSyncProgress] Skipping FACILITY_ADMIN - not scoped to facility', {
              subscriptionId,
              userRole: client.userRole,
              facilityIds,
              targetFacilityId: payload.facilityId,
            });
            skipped++;
            continue;
          }
        }

        // Admin and Dev Admin can see all
        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) {
          skipped++;
          continue;
        }

        watchers.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              const message = JSON.stringify({
                type: 'fms_sync_progress_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              });
              this.logger.info('[FMSSyncProgress] Sending to client', {
                subscriptionId,
                messageLength: message.length,
              });
              ws.send(message);
              sent++;
            } catch (error) {
              this.logger.error('[FMSSyncProgress] Error sending to client', { subscriptionId, error });
              // Remove broken connection
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
              }
            }
          } else {
            this.logger.warn('[FMSSyncProgress] WebSocket not open', { subscriptionId, readyState: ws.readyState });
            watchers.delete(ws);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
            }
          }
        });
      }

      this.logger.info('[FMSSyncProgress] Broadcast complete', { sent, skipped });
    } catch (error) {
      this.logger.error('Error broadcasting FMS sync progress update:', error);
    }
  }
}


