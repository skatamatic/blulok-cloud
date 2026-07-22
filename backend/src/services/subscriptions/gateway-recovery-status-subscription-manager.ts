import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import type { GatewayRecovery } from '@/models/gateway-recovery.model';

export type GatewayRecoveryStatusPayload = {
  facilityId: string;
  candidates: Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }>;
  recovery: GatewayRecovery | null;
  sessions: Array<{
    gatewayId: string;
    sessionRole: 'active' | 'swap_candidate';
    connected: boolean;
    lastActivityAt?: number;
  }>;
  demotedPreviousGateway: { gatewayId: string; connected: boolean } | null;
};

/**
 * Facility-scoped swap/recovery status for the facility Gateway setup UI.
 *
 * Subscription type: `gateway_recovery_status`
 * Requires `facility_id` in subscription data.
 * Roles: ADMIN, DEV_ADMIN, FACILITY_ADMIN.
 */
export class GatewayRecoveryStatusSubscriptionManager extends BaseSubscriptionManager {
  private subscriptionFacilityIds = new Map<string, string>();

  getSubscriptionType(): string {
    return 'gateway_recovery_status';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const filters = message.data || {};
    const facilityId = String(filters.facility_id || filters.facilityId || '').trim();
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    if (!facilityId || !uuidValidate(facilityId)) {
      this.sendError(ws, 'facility_id is required for gateway_recovery_status subscription');
      return false;
    }

    if (!this.canAccessFacility(client, facilityId)) {
      this.sendError(ws, 'Access denied: You do not have access to this facility');
      return false;
    }

    this.clientContext.set(subscriptionId, client);
    this.subscriptionFacilityIds.set(subscriptionId, facilityId);
    this.addWatcher(subscriptionId, ws, client);
    await this.sendInitialData(ws, subscriptionId, client);
    this.logger.info(
      `📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId} (facility: ${facilityId})`,
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
    const facilityId = this.subscriptionFacilityIds.get(subscriptionId);
    if (!facilityId) {
      this.sendError(ws, 'Missing facility scope for gateway_recovery_status');
      return;
    }

    try {
      const payload = await this.loadStatusPayload(facilityId);
      this.sendMessage(ws, {
        type: 'gateway_recovery_status_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('[GatewayRecoveryStatus] Error sending initial data', { facilityId, error });
      this.sendError(ws, 'Failed to load gateway recovery status');
    }
  }

  public async broadcastStatus(facilityId: string): Promise<void> {
    try {
      const payload = await this.loadStatusPayload(facilityId);
      const activeSubscriptions = Array.from(this.watchers.keys());

      for (const subscriptionId of activeSubscriptions) {
        const scopedFacilityId = this.subscriptionFacilityIds.get(subscriptionId);
        if (scopedFacilityId !== facilityId) continue;

        const client = this.clientContext.get(subscriptionId);
        if (!client || !this.canAccessFacility(client, facilityId)) continue;

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;

        watchers.forEach((wsConn) => {
          if (wsConn.readyState === WebSocket.OPEN) {
            try {
              wsConn.send(JSON.stringify({
                type: 'gateway_recovery_status_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              }));
            } catch (error) {
              this.logger.error('[GatewayRecoveryStatus] Error sending to client', { subscriptionId, error });
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
      this.logger.error('Error broadcasting gateway recovery status update:', error);
    }
  }

  private async loadStatusPayload(facilityId: string): Promise<GatewayRecoveryStatusPayload> {
    const { GatewayRecoveryService } = await import('@/services/gateway/gateway-recovery.service');
    const snapshot = await GatewayRecoveryService.getRecoveryCandidatesPayload(facilityId);
    return {
      facilityId,
      candidates: snapshot.candidates,
      recovery: snapshot.recovery,
      sessions: snapshot.sessions,
      demotedPreviousGateway: snapshot.demotedPreviousGateway,
    };
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return true;
    }
    return (client.facilityIds || []).includes(facilityId);
  }
}
