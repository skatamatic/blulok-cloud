import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { GatewayModel } from '@/models/gateway.model';
import {
  ACCESS_SESSION_TRACE_MESSAGE_TYPE,
  ACCESS_SESSION_TRACE_SUBSCRIPTION,
} from '@/constants/access-session-trace.constants';
import type { AccessSessionTraceEvent, AccessSessionTraceFilters } from '@/services/access/access-session-trace.types';
import { traceEventMatchesFilters } from '@/utils/access-session-trace.utils';

/**
 * Streams correlator decisions and raw access/lock events for gateway session debugging.
 * Subscription type: access_session_trace
 */
export class AccessSessionTraceSubscriptionManager extends BaseSubscriptionManager {
  private gatewayModel = new GatewayModel();
  private subscriptionFilters = new Map<string, AccessSessionTraceFilters>();

  getSubscriptionType(): string {
    return ACCESS_SESSION_TRACE_SUBSCRIPTION;
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const raw = (message.data ?? {}) as Record<string, unknown>;
    const nested = (raw.filters ?? raw) as Record<string, unknown>;
    let facilityId = nested.facility_id ? String(nested.facility_id) : undefined;
    const gatewayId = nested.gateway_id ? String(nested.gateway_id) : undefined;
    const deviceId = nested.device_id ? String(nested.device_id) : undefined;
    const unitId = nested.unit_id ? String(nested.unit_id) : undefined;
    const userId = nested.user_id ? String(nested.user_id) : undefined;

    if (client.userRole === UserRole.FACILITY_ADMIN) {
      if (facilityId && client.facilityIds && !client.facilityIds.includes(facilityId)) {
        this.sendError(ws, 'Access denied to this facility');
        return false;
      }
      if (!facilityId && client.facilityIds?.length === 1) {
        facilityId = client.facilityIds[0];
      }
    }

    if (gatewayId) {
      const gateway = await this.gatewayModel.findById(gatewayId);
      if (!gateway) {
        this.sendError(ws, 'Gateway not found');
        return false;
      }
      if (
        client.userRole === UserRole.FACILITY_ADMIN
        && gateway.facility_id
        && client.facilityIds
        && !client.facilityIds.includes(gateway.facility_id)
      ) {
        this.sendError(ws, 'Access denied to this gateway');
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

    if (!facilityId) {
      this.sendError(ws, 'facility_id or gateway_id is required');
      return false;
    }

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;
    this.subscriptionFilters.set(subscriptionId, {
      facility_id: facilityId,
      gateway_id: gatewayId,
      device_id: deviceId,
      unit_id: unitId,
      user_id: userId,
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
      type: ACCESS_SESSION_TRACE_MESSAGE_TYPE,
      subscriptionId,
      data: { status: 'ready' },
      timestamp: new Date().toISOString(),
    });
  }

  broadcastUpdate(event: AccessSessionTraceEvent): void {
    for (const [subscriptionId, watchers] of this.watchers.entries()) {
      const filters = this.subscriptionFilters.get(subscriptionId);
      if (!filters || !traceEventMatchesFilters(event, filters)) continue;

      const payload: WebSocketMessage = {
        type: ACCESS_SESSION_TRACE_MESSAGE_TYPE,
        subscriptionId,
        data: { event },
        timestamp: new Date().toISOString(),
      };

      for (const ws of watchers) {
        this.sendMessage(ws, payload);
      }
    }
  }
}
