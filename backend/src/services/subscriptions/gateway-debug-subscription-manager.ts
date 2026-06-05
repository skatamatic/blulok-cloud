import { WebSocket } from 'ws';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { UserRole } from '@/types/auth.types';
import { GatewayDebugEvent, GatewayDebugService } from '@/services/gateway/gateway-debug.service';

export interface GatewayDebugSubscriptionFilters {
  facility_id?: string;
}

/**
 * GatewayDebugSubscriptionManager
 *
 * DEV_ADMIN-only subscription that streams gateway WebSocket debug events
 * (connection lifecycle, heartbeat PING/PONG, message types) over the
 * standard frontend WebSocket channel.
 *
 * Security: debug events are facility-scoped. Each subscription is bound to a single
 * facility (via the `facility_id` filter) and the manager filters events server-side so
 * a viewer never receives live traffic for gateways at other facilities. Without this
 * scoping, raw traffic (remote addresses, user IDs, message types) from every connected
 * gateway would leak into any open debug feed.
 */
export class GatewayDebugSubscriptionManager extends BaseSubscriptionManager {
  private unsubscribeDebug?: () => void;
  /** subscriptionId -> filters from the subscribe message */
  private subscriptionFilters = new Map<string, GatewayDebugSubscriptionFilters>();

  constructor() {
    super();
    const debug = GatewayDebugService.getInstance();
    this.unsubscribeDebug = debug.subscribe((event) => this.broadcastUpdateInternal(event));
  }

  getSubscriptionType(): string {
    return 'gateway_debug';
  }

  canSubscribe(userRole: UserRole): boolean {
    return userRole === UserRole.DEV_ADMIN;
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const raw = (message.data ?? {}) as Record<string, unknown>;
    const filters = (raw.filters ?? raw) as GatewayDebugSubscriptionFilters;
    let facilityId = filters.facility_id ? String(filters.facility_id) : undefined;

    // Defense-in-depth: a facility-scoped admin may only watch facilities they can access.
    // (Today only DEV_ADMIN can subscribe, but keep the check parallel to the telemetry manager.)
    if (client.userRole === UserRole.FACILITY_ADMIN) {
      if (facilityId && client.facilityIds && !client.facilityIds.includes(facilityId)) {
        this.sendError(ws, 'Access denied to this facility');
        return false;
      }
      if (!facilityId && client.facilityIds?.length === 1) {
        facilityId = client.facilityIds[0];
      }
    }

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;
    // Set the filter BEFORE adding the watcher so a debug event arriving mid-subscribe can never
    // be delivered unscoped. If the base rejects the subscription (e.g. role check), drop the
    // filter so we don't leak a stale entry.
    this.subscriptionFilters.set(subscriptionId, { facility_id: facilityId });
    const ok = await super.handleSubscription(ws, { ...message, subscriptionId }, client);
    if (!ok) {
      this.subscriptionFilters.delete(subscriptionId);
    }
    return ok;
  }

  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    if (message.subscriptionId) {
      this.subscriptionFilters.delete(message.subscriptionId);
    }
    super.handleUnsubscription(ws, message, client);
  }

  cleanup(ws: WebSocket, client: SubscriptionClient): void {
    for (const [subscriptionId, watchers] of this.watchers.entries()) {
      if (watchers.has(ws)) {
        this.subscriptionFilters.delete(subscriptionId);
      }
    }
    super.cleanup(ws, client);
  }

  protected async sendInitialData(ws: WebSocket, _subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    const message: WebSocketMessage = {
      type: 'subscription',
      subscriptionType: this.getSubscriptionType(),
      data: { message: 'Gateway debug subscription active' },
      timestamp: new Date().toISOString(),
    };
    this.sendMessage(ws, message);
  }

  broadcastUpdate(data: GatewayDebugEvent): void {
    this.broadcastUpdateInternal(data);
  }

  private broadcastUpdateInternal(event: GatewayDebugEvent): void {
    const payload: WebSocketMessage = {
      type: 'data',
      subscriptionType: this.getSubscriptionType(),
      data: event,
      timestamp: new Date().toISOString(),
    };

    for (const [subscriptionId, watcherSet] of this.watchers.entries()) {
      const filters = this.subscriptionFilters.get(subscriptionId) ?? {};
      const client = this.clientContext.get(subscriptionId);
      if (!this.eventMatchesFilters(event, filters, client)) {
        continue;
      }
      for (const ws of watcherSet) {
        this.sendMessage(ws, payload);
      }
    }
  }

  private eventMatchesFilters(
    event: GatewayDebugEvent,
    filters: GatewayDebugSubscriptionFilters,
    client?: SubscriptionClient,
  ): boolean {
    // Facility-scoped subscription: only deliver events for the watched facility.
    // An event without a facilityId is never delivered to a facility-scoped subscription.
    if (filters.facility_id && event.facilityId !== filters.facility_id) {
      return false;
    }
    // Defense-in-depth: facility-scoped admins never see other facilities' traffic.
    if (
      client?.userRole === UserRole.FACILITY_ADMIN &&
      client.facilityIds &&
      client.facilityIds.length > 0 &&
      (!event.facilityId || !client.facilityIds.includes(event.facilityId))
    ) {
      return false;
    }
    return true;
  }
}
