import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { GatewayModel, Gateway } from '@/models/gateway.model';

/**
 * Gateway Status Subscription Manager
 *
 * Subscription Type: 'gateway_status'
 *
 * Filters:
 * - facility_id (optional): scopes updates to one facility. When present, only
 *   ADMIN / DEV_ADMIN / FACILITY_ADMIN may subscribe (facility Gateway setup UI).
 * - Without facility_id: all authenticated roles (e.g. tenant lock realtime).
 */
export class GatewayStatusSubscriptionManager extends BaseSubscriptionManager {
  private gatewayModel: GatewayModel;
  private cachedAllGateways: Gateway[] | null = null;
  private cacheLoadedAtMs = 0;
  private allGatewaysInFlight: Promise<Gateway[]> | null = null;
  private dbBackoffUntilMs = 0;
  private readonly CACHE_TTL_MS = 5000;
  private readonly DB_BACKOFF_MS = 30_000;
  private subscriptionFacilityIds = new Map<string, string | undefined>();

  constructor() {
    super();
    this.gatewayModel = new GatewayModel();
  }

  /** Drop cached gateway rows so the next broadcast reflects fresh DB state (e.g. after inbound WS connect). */
  public invalidateCache(): void {
    this.cachedAllGateways = null;
    this.cacheLoadedAtMs = 0;
  }

  getSubscriptionType(): string {
    return 'gateway_status';
  }

  canSubscribe(userRole: UserRole, opts?: { facilityScoped?: boolean }): boolean {
    if (opts?.facilityScoped) {
      return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
    }
    return true;
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const filters = message.data || {};
    const rawFacilityId = filters.facility_id || filters.facilityId;
    const facilityId = rawFacilityId ? String(rawFacilityId).trim() : undefined;
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    if (facilityId) {
      if (!uuidValidate(facilityId)) {
        this.sendError(ws, 'Invalid facility ID format');
        return false;
      }
      if (!this.canSubscribe(client.userRole, { facilityScoped: true })) {
        this.sendError(ws, `Access denied: facility-scoped ${this.getSubscriptionType()} requires admin role`);
        return false;
      }
      if (!this.canAccessFacility(client, facilityId)) {
        this.sendError(ws, 'Access denied: You do not have access to this facility');
        return false;
      }
    } else if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
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

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const facilityFilter = this.subscriptionFacilityIds.get(subscriptionId);
      const gateways = await this.getScopedGateways(client, facilityFilter);
      const payload = await this.toPayload(gateways);

      this.sendMessage(ws, {
        type: 'gateway_status_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (this.isPoolAcquireTimeout(error)) {
        this.dbBackoffUntilMs = Date.now() + this.DB_BACKOFF_MS;
      }
      this.logger.error('Error sending initial gateway status data:', error);
      this.sendError(ws, 'Failed to load gateway status');
    }
  }

  public async broadcastUpdate(facilityId?: string, gatewayId?: string): Promise<void> {
    this.invalidateCache();

    try {
      const activeSubscriptions = Array.from(this.watchers.keys());
      if (activeSubscriptions.length === 0) return;

      for (const subscriptionId of activeSubscriptions) {
        const client = this.clientContext.get(subscriptionId);
        if (!client) continue;

        const scopedFacilityId = this.subscriptionFacilityIds.get(subscriptionId);
        if (scopedFacilityId) {
          if (facilityId && scopedFacilityId !== facilityId) continue;
          if (!this.canAccessFacility(client, scopedFacilityId)) continue;
        } else if (
          facilityId
          && client.facilityIds
          && client.facilityIds.length > 0
          && !client.facilityIds.includes(facilityId)
          && client.userRole !== UserRole.ADMIN
          && client.userRole !== UserRole.DEV_ADMIN
        ) {
          continue;
        }

        const effectiveFacilityFilter = scopedFacilityId || facilityId;
        const gateways = await this.getScopedGateways(client, effectiveFacilityFilter, gatewayId);
        const payload = await this.toPayload(gateways, gatewayId);

        const watchers = this.watchers.get(subscriptionId);
        if (!watchers) continue;

        watchers.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({
                type: 'gateway_status_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              }));
            } catch (err) {
              this.logger.error('Error sending gateway status to WebSocket:', err);
              watchers.delete(ws);
              if (watchers.size === 0) {
                this.watchers.delete(subscriptionId);
                this.clientContext.delete(subscriptionId);
                this.subscriptionFacilityIds.delete(subscriptionId);
              }
            }
          } else {
            watchers.delete(ws);
            if (watchers.size === 0) {
              this.watchers.delete(subscriptionId);
              this.clientContext.delete(subscriptionId);
              this.subscriptionFacilityIds.delete(subscriptionId);
            }
          }
        });
      }
    } catch (error) {
      if (this.isPoolAcquireTimeout(error)) {
        this.dbBackoffUntilMs = Date.now() + this.DB_BACKOFF_MS;
      }
      this.logger.error('Error broadcasting gateway status update:', error);
    }
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return true;
    }
    return (client.facilityIds || []).includes(facilityId);
  }

  private async getScopedGateways(client: SubscriptionClient, facilityIdFilter?: string, gatewayIdFilter?: string): Promise<Gateway[]> {
    const all = await this.getAllGatewaysCached();

    if (client.userRole === UserRole.ADMIN || client.userRole === UserRole.DEV_ADMIN) {
      return all.filter((g) => (!facilityIdFilter || g.facility_id === facilityIdFilter) && (!gatewayIdFilter || g.id === gatewayIdFilter));
    }

    const allowedFacilities = client.facilityIds || [];
    return all.filter((g) => !!g.facility_id && allowedFacilities.includes(g.facility_id) && (!facilityIdFilter || g.facility_id === facilityIdFilter) && (!gatewayIdFilter || g.id === gatewayIdFilter));
  }

  private async getAllGatewaysCached(): Promise<Gateway[]> {
    const now = Date.now();
    if (this.cachedAllGateways && now - this.cacheLoadedAtMs < this.CACHE_TTL_MS) {
      return this.cachedAllGateways;
    }
    if (now < this.dbBackoffUntilMs) {
      return this.cachedAllGateways || [];
    }
    if (this.allGatewaysInFlight) {
      return this.allGatewaysInFlight;
    }

    this.allGatewaysInFlight = this.gatewayModel.findAll()
      .then((rows) => {
        this.cachedAllGateways = rows;
        this.cacheLoadedAtMs = Date.now();
        return rows;
      })
      .finally(() => {
        this.allGatewaysInFlight = null;
      });

    return this.allGatewaysInFlight;
  }

  private async toPayload(gateways: Gateway[], updatedGatewayId?: string) {
    const liveness = await this.getLivenessByFacility(gateways);

    return {
      gateways: gateways.map((g) => {
        const live = g.facility_id ? liveness.get(g.facility_id) : undefined;
        return {
          id: g.id,
          facilityId: g.facility_id,
          name: g.name,
          status: g.status,
          lastSeen: g.last_seen,
          connected: live ? live.connected : null,
          lastActivityAt: live?.lastPongAt ?? null,
        };
      }),
      updatedGatewayId,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async getLivenessByFacility(
    gateways: Gateway[],
  ): Promise<Map<string, { connected: boolean; lastPongAt?: number }>> {
    const byFacility = new Map<string, { connected: boolean; lastPongAt?: number }>();
    try {
      const { GatewayEventsService } = await import('@/services/gateway/gateway-events.service');
      const events = GatewayEventsService.getInstance();
      for (const g of gateways) {
        if (!g.facility_id || byFacility.has(g.facility_id)) continue;
        byFacility.set(g.facility_id, events.getFacilityProductLiveness(g.facility_id));
      }
    } catch (error) {
      this.logger.warn('Failed to resolve live gateway connectivity for status payload:', error);
    }
    return byFacility;
  }
}
