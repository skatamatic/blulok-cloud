import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient } from './base-subscription-manager';
import { GatewayModel, Gateway } from '@/models/gateway.model';

export class GatewayStatusSubscriptionManager extends BaseSubscriptionManager {
  private gatewayModel: GatewayModel;

  constructor() {
    super();
    this.gatewayModel = new GatewayModel();
  }

  getSubscriptionType(): string {
    return 'gateway_status';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All roles can subscribe; RBAC enforced by facility scoping
    return true;
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const gateways = await this.getScopedGateways(client);
      const payload = this.toPayload(gateways);

      this.sendMessage(ws, {
        type: 'gateway_status_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('Error sending initial gateway status data:', error);
      this.sendError(ws, 'Failed to load gateway status');
    }
  }

  public async broadcastUpdate(facilityId?: string, gatewayId?: string): Promise<void> {
    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      if (activeSubscriptions.length === 0) return;

      // Preload gateways once per unique facility set when possible
      // For simplicity, load per subscription based on each client's facilities
      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) continue;

        // If filtering by facilityId and client has facilityIds, skip if not in scope
        if (facilityId && client.facilityIds && !client.facilityIds.includes(facilityId) && client.userRole !== UserRole.ADMIN && client.userRole !== UserRole.DEV_ADMIN) {
          continue;
        }

        const gateways = await this.getScopedGateways(client, facilityId, gatewayId);
        const payload = this.toPayload(gateways, gatewayId);

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;

        watchers.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'gateway_status_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString()
              }));
            } catch (err) {
              this.logger.error('Error sending gateway status to WebSocket:', err);
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
      this.logger.error('Error broadcasting gateway status update:', error);
    }
  }

  private async getScopedGateways(client: SubscriptionClient, facilityIdFilter?: string, gatewayIdFilter?: string): Promise<Gateway[]> {
    const all = await this.gatewayModel.findAll();

    // Admin roles can see all
    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return all.filter(g => (!facilityIdFilter || g.facility_id === facilityIdFilter) && (!gatewayIdFilter || g.id === gatewayIdFilter));
    }

    // Other roles limited to facilityIds
    const allowedFacilities = client.facilityIds || [];
    return all.filter(g => allowedFacilities.includes(g.facility_id) && (!facilityIdFilter || g.facility_id === facilityIdFilter) && (!gatewayIdFilter || g.id === gatewayIdFilter));
  }

  private toPayload(gateways: Gateway[], updatedGatewayId?: string) {
    return {
      gateways: gateways.map(g => ({
        id: g.id,
        facilityId: g.facility_id,
        name: g.name,
        status: g.status,
        lastSeen: g.last_seen,
      })),
      updatedGatewayId,
      lastUpdated: new Date().toISOString(),
    };
  }
}



