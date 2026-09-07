import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import type { AccessCodePushState } from '@/services/access-code.service';

/** Wire payload for facility Access Groups / admin push badge. */
export type AccessCodePushStatePayload = {
  facility_id: string;
  status: 'pending' | 'active' | 'error';
  last_error: string | null;
  last_nonce: string | null;
  updated_at: string;
  /** When true, clients should refetch admin effective codes via REST. */
  refresh_effective_codes?: boolean;
};

/**
 * Facility-scoped access-code push outbox + admin refresh nudges.
 *
 * Subscription type: `access_code_push_state`
 * Requires `facility_id`.
 * Roles: ADMIN, DEV_ADMIN, FACILITY_ADMIN (same as access-code manage APIs).
 */
export class AccessCodePushStateSubscriptionManager extends BaseSubscriptionManager {
  private subscriptionFacilityIds = new Map<string, string>();

  getSubscriptionType(): string {
    return 'access_code_push_state';
  }

  canSubscribe(userRole: UserRole): boolean {
    return [UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN].includes(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const filters = message.data || {};
    const facilityId = String(filters.facility_id || filters.facilityId || '').trim();
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires admin role`);
      return false;
    }

    if (!facilityId || !uuidValidate(facilityId)) {
      this.sendError(ws, 'facility_id is required for access_code_push_state subscription');
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
      this.sendError(ws, 'Missing facility scope for access_code_push_state');
      return;
    }

    try {
      const payload = this.loadPayload(facilityId, { refreshEffectiveCodes: false });
      this.sendMessage(ws, {
        type: 'access_code_push_state_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('[AccessCodePushState] Error sending initial data', { facilityId, error });
      this.sendError(ws, 'Failed to load access code push state');
    }
  }

  public broadcastPushState(
    facilityId: string,
    options?: { refreshEffectiveCodes?: boolean; state?: AccessCodePushState },
  ): void {
    try {
      const payload = this.loadPayload(facilityId, {
        refreshEffectiveCodes: options?.refreshEffectiveCodes === true,
        state: options?.state,
      });
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
                type: 'access_code_push_state_update',
                subscriptionId,
                data: payload,
                timestamp: new Date().toISOString(),
              }));
            } catch (error) {
              this.logger.error('[AccessCodePushState] Error sending to client', { subscriptionId, error });
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
      this.logger.error('Error broadcasting access code push state update:', error);
    }
  }

  private loadPayload(
    facilityId: string,
    options?: { refreshEffectiveCodes?: boolean; state?: AccessCodePushState },
  ): AccessCodePushStatePayload {
    // Lazy import avoids circular init with AccessCodeService
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AccessCodeService } = require('@/services/access-code.service') as typeof import('@/services/access-code.service');
    const state = options?.state ?? AccessCodeService.getInstance().getPushState(facilityId);
    const updatedAt =
      state.updated_at instanceof Date
        ? state.updated_at.toISOString()
        : new Date(String(state.updated_at)).toISOString();

    return {
      facility_id: state.facility_id,
      status: state.status,
      last_error: state.last_error,
      last_nonce: state.last_nonce,
      updated_at: updatedAt,
      ...(options?.refreshEffectiveCodes ? { refresh_effective_codes: true } : {}),
    };
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (AuthService.canAccessAllFacilities(client.userRole)) return true;
    return (client.facilityIds || []).includes(facilityId);
  }
}
