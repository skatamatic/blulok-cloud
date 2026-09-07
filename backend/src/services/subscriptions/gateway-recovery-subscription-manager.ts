import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import type { GatewayRecoveryProgressPayload } from '@/services/gateway/gateway-recovery.service';

/**
 * Live swap/recovery progress deltas (percent, phase message).
 * Prefer `gateway_recovery_status` for candidates/sessions/recovery snapshots.
 *
 * When `facility_id` is provided, only ADMIN / DEV_ADMIN / FACILITY_ADMIN may subscribe.
 */
export class GatewayRecoverySubscriptionManager extends BaseSubscriptionManager {
  private subscriptionFacilityIds = new Map<string, string | undefined>();

  getSubscriptionType(): string {
    return 'gateway_recovery_progress';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const filters = message.data || {};
    const rawFacilityId = filters.facility_id || filters.facilityId;
    const facilityId = rawFacilityId ? String(rawFacilityId).trim() : undefined;
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    if (facilityId) {
      if (!uuidValidate(facilityId)) {
        this.sendError(ws, 'Invalid facility ID format');
        return false;
      }
      if (!this.canAccessFacility(client, facilityId)) {
        this.sendError(ws, 'Access denied: You do not have access to this facility');
        return false;
      }
    }

    this.clientContext.set(subscriptionId, client);
    this.subscriptionFacilityIds.set(subscriptionId, facilityId);
    this.addWatcher(subscriptionId, ws, client);
    await this.sendInitialData(ws, subscriptionId, client);
    this.logger.info(
      `📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}`
      + (facilityId ? ` (facility: ${facilityId})` : ''),
    );
    return true;
  }

  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    const subscriptionId = message.subscriptionId;
    if (subscriptionId) {
      this.subscriptionFacilityIds.delete(subscriptionId);
    }
    super.handleUnsubscription(ws, message, client);
  }

  cleanup(ws: WebSocket, client: SubscriptionClient): void {
    for (const [subscriptionId, watchers] of this.watchers.entries()) {
      if (watchers.has(ws)) {
        this.subscriptionFacilityIds.delete(subscriptionId);
      }
    }
    super.cleanup(ws, client);
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

        const scopedFacilityId = this.subscriptionFacilityIds.get(subscriptionId);
        if (scopedFacilityId && scopedFacilityId !== payload.facilityId) continue;

        if (!this.canAccessFacility(client, payload.facilityId)) continue;

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
                this.subscriptionFacilityIds.delete(subscriptionId);
              }
            }
          } else {
            watchers.delete(wsConn);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
              this.subscriptionFacilityIds.delete(subscriptionId);
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Error broadcasting gateway recovery progress update:', error);
    }
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return true;
    }
    return (client.facilityIds || []).includes(facilityId);
  }
}
