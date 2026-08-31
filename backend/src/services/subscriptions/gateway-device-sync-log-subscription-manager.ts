import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { GatewayModel } from '@/models/gateway.model';
import type { GatewayDeviceSyncLogRecord } from '@/types/gateway-device-sync.types';

export interface GatewayDeviceSyncLogSubscriptionFilters {
  facility_id?: string;
  gateway_id?: string;
}

/**
 * Streams new gateway device inventory sync audit rows to platform admins.
 * Subscription type: gateway_device_sync_logs
 */
export class GatewayDeviceSyncLogSubscriptionManager extends BaseSubscriptionManager {
  private gatewayModel = new GatewayModel();
  private subscriptionFilters = new Map<string, GatewayDeviceSyncLogSubscriptionFilters>();

  getSubscriptionType(): string {
    return 'gateway_device_sync_logs';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN].includes(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const raw = (message.data ?? {}) as Record<string, unknown>;
    const filters = (raw.filters ?? raw) as GatewayDeviceSyncLogSubscriptionFilters;
    let facilityId = filters.facility_id ? String(filters.facility_id) : undefined;
    const gatewayId = filters.gateway_id ? String(filters.gateway_id) : undefined;

    if (gatewayId) {
      const gateway = await this.gatewayModel.findById(gatewayId);
      if (!gateway) {
        this.sendError(ws, 'Gateway not found');
        return false;
      }

      if (facilityId && gateway.facility_id && gateway.facility_id !== facilityId) {
        this.sendError(ws, 'Gateway does not belong to the specified facility');
        return false;
      }

      if (!facilityId && gateway.facility_id) {
        facilityId = gateway.facility_id;
      }
    }

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;
    this.subscriptionFilters.set(subscriptionId, {
      facility_id: facilityId,
      gateway_id: gatewayId,
    });

    return super.handleSubscription(ws, { ...message, subscriptionId }, client);
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

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, _client: SubscriptionClient): Promise<void> {
    this.sendMessage(ws, {
      type: 'gateway_device_sync_log_update',
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastUpdate(entries: GatewayDeviceSyncLogRecord[]): void {
    if (entries.length === 0) return;

    for (const [subscriptionId, watchers] of this.watchers.entries()) {
      const filters = this.subscriptionFilters.get(subscriptionId) ?? {};
      const matched = entries.filter((entry) => this.entryMatchesFilters(entry, filters));

      if (matched.length === 0) continue;

      const payload: WebSocketMessage = {
        type: 'gateway_device_sync_log_update',
        subscriptionId,
        data: { logs: matched },
        timestamp: new Date().toISOString(),
      };

      for (const ws of watchers) {
        this.sendMessage(ws, payload);
      }
    }
  }

  private entryMatchesFilters(
    entry: GatewayDeviceSyncLogRecord,
    filters: GatewayDeviceSyncLogSubscriptionFilters,
  ): boolean {
    if (filters.gateway_id && entry.gateway_id !== filters.gateway_id) {
      return false;
    }
    if (filters.facility_id && entry.facility_id !== filters.facility_id) {
      return false;
    }
    return true;
  }
}
