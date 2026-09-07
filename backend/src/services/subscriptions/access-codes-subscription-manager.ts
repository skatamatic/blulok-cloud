import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { AccessCodeService, UserAccessCodePairing } from '@/services/access-code.service';
import { AuthService } from '@/services/auth.service';

const APP_READ_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.DEV_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.TENANT,
  UserRole.MAINTENANCE,
]);

interface AccessCodeSubscriptionFilters {
  facilityId?: string;
}

/**
 * Real-time daily/app access codes for dashboard widgets.
 * Subscription type: `access_codes`
 */
export class AccessCodesSubscriptionManager extends BaseSubscriptionManager {
  private accessCodeService = AccessCodeService.getInstance();
  private subscriptionFilters = new Map<string, AccessCodeSubscriptionFilters>();

  getSubscriptionType(): string {
    return 'access_codes';
  }

  canSubscribe(userRole: UserRole): boolean {
    return APP_READ_ROLES.has(userRole);
  }

  async handleSubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): Promise<boolean> {
    const filters = message.data || {};
    const facilityId = filters.facility_id || filters.facilityId;

    if (facilityId && !uuidValidate(String(facilityId))) {
      this.sendError(ws, 'Invalid facility ID format');
      return false;
    }

    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    if (facilityId && !this.canAccessFacility(client, String(facilityId))) {
      this.sendError(ws, 'Access denied: You do not have access to this facility');
      return false;
    }

    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;
    this.subscriptionFilters.set(subscriptionId, { facilityId: facilityId ? String(facilityId) : undefined });
    this.clientContext.set(subscriptionId, client);
    this.addWatcher(subscriptionId, ws, client);

    await this.sendInitialData(ws, subscriptionId, client);

    this.logger.info(
      `📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}${
        facilityId ? ` (facility: ${facilityId})` : ''
      }`,
    );
    return true;
  }

  handleUnsubscription(ws: WebSocket, message: WebSocketMessage, client: SubscriptionClient): void {
    const subscriptionId = message.subscriptionId;
    if (!subscriptionId) {
      this.sendError(ws, 'Subscription ID required');
      return;
    }

    this.removeWatcher(subscriptionId, ws, client);
    this.clientContext.delete(subscriptionId);
    this.subscriptionFilters.delete(subscriptionId);
    this.logger.info(`📡 ${this.getSubscriptionType()} unsubscription: ${subscriptionId} for user ${client.userId}`);
  }

  cleanup(ws: WebSocket, _client: SubscriptionClient): void {
    this.watchers.forEach((watcherSet, key) => {
      if (watcherSet.has(ws)) {
        watcherSet.delete(ws);
        if (watcherSet.size === 0) {
          this.watchers.delete(key);
          this.clientContext.delete(key);
          this.subscriptionFilters.delete(key);
        }
      }
    });
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      const payload = await this.buildPayloadForSubscription(subscriptionId, client);
      this.sendMessage(ws, {
        type: 'access_codes_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error sending initial access codes data:', error);
      this.sendError(ws, 'Failed to load initial access codes');
    }
  }

  public async broadcastUpdate(changedFacilityId?: string): Promise<void> {
    const activeSubscriptions = Array.from(this.watchers.keys());
    if (activeSubscriptions.length === 0) return;

    const payloadCache = new Map<string, { codes: UserAccessCodePairing[]; count: number; lastUpdated: string }>();

    for (const subscriptionId of activeSubscriptions) {
      const client = this.clientContext.get(subscriptionId);
      if (!client) continue;

      const filters = this.subscriptionFilters.get(subscriptionId);
      if (changedFacilityId) {
        if (filters?.facilityId && filters.facilityId !== changedFacilityId) continue;
        if (!this.canAccessFacility(client, changedFacilityId)) continue;
      }

      const cacheKey = `${client.userId}:${client.userRole}:${filters?.facilityId || 'all'}`;
      if (!payloadCache.has(cacheKey)) {
        try {
          payloadCache.set(cacheKey, await this.buildPayloadForSubscription(subscriptionId, client));
        } catch (error) {
          this.logger.error(`Error building access codes payload for user ${client.userId}:`, error);
          continue;
        }
      }

      const payload = payloadCache.get(cacheKey)!;
      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          this.sendMessage(ws, {
            type: 'access_codes_update',
            subscriptionId,
            data: payload,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.error('Error broadcasting access codes update:', error);
        }
      }
    }
  }

  private async buildPayloadForSubscription(
    subscriptionId: string,
    client: SubscriptionClient,
  ): Promise<{ codes: UserAccessCodePairing[]; count: number; lastUpdated: string }> {
    const filters = this.subscriptionFilters.get(subscriptionId);
    const codes = await this.accessCodeService.getAppCodesForUser(
      client.userId,
      client.userRole,
      client.facilityIds,
      filters?.facilityId,
    );
    return {
      codes,
      count: codes.length,
      lastUpdated: new Date().toISOString(),
    };
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (AuthService.canAccessAllFacilities(client.userRole)) return true;
    return client.facilityIds?.includes(facilityId) ?? false;
  }
}
