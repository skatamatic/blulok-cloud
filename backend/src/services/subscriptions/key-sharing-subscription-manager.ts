import { WebSocket } from 'ws';
import { validate as uuidValidate } from 'uuid';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { KeySharingModel, KeySharingWithDetails } from '@/models/key-sharing.model';

const KEY_SHARING_READ_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.DEV_ADMIN,
  UserRole.FACILITY_ADMIN,
  UserRole.TENANT,
  UserRole.MAINTENANCE,
]);

interface KeySharingSubscriptionFilters {
  facilityId?: string;
}

/**
 * Real-time key sharing records for dashboard widgets.
 * Subscription type: `key_sharing`
 */
export class KeySharingSubscriptionManager extends BaseSubscriptionManager {
  private keySharingModel = new KeySharingModel();
  private subscriptionFilters = new Map<string, KeySharingSubscriptionFilters>();

  getSubscriptionType(): string {
    return 'key_sharing';
  }

  canSubscribe(userRole: UserRole): boolean {
    return KEY_SHARING_READ_ROLES.has(userRole);
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
        type: 'key_sharing_update',
        subscriptionId,
        data: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error sending initial key sharing data:', error);
      this.sendError(ws, 'Failed to load initial key sharing records');
    }
  }

  public async broadcastUpdate(changedFacilityId?: string): Promise<void> {
    const activeSubscriptions = Array.from(this.watchers.keys());
    if (activeSubscriptions.length === 0) return;

    const payloadCache = new Map<string, { sharings: KeySharingWithDetails[]; total: number; lastUpdated: string }>();

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
          this.logger.error(`Error building key sharing payload for user ${client.userId}:`, error);
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
            type: 'key_sharing_update',
            subscriptionId,
            data: payload,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          this.logger.error('Error broadcasting key sharing update:', error);
        }
      }
    }
  }

  private async buildPayloadForSubscription(
    subscriptionId: string,
    client: SubscriptionClient,
  ): Promise<{ sharings: KeySharingWithDetails[]; total: number; lastUpdated: string }> {
    const filters = this.subscriptionFilters.get(subscriptionId);
    const queryFilters = this.buildQueryFilters(client, filters?.facilityId);
    const result = await this.keySharingModel.findAll(queryFilters);
    return {
      sharings: result.sharings,
      total: result.total,
      lastUpdated: new Date().toISOString(),
    };
  }

  private buildQueryFilters(client: SubscriptionClient, facilityId?: string) {
    const filters: Record<string, unknown> = {
      is_active: true,
      limit: 50,
      offset: 0,
      sort_by: 'shared_at',
      sort_order: 'desc',
    };

    if (AuthService.isAdmin(client.userRole)) {
      // Admins see all active sharings (optionally facility-scoped below).
    } else if (AuthService.isFacilityAdmin(client.userRole)) {
      if (client.facilityIds && client.facilityIds.length > 0) {
        filters.facility_ids = client.facilityIds;
      }
    } else if (client.userRole === UserRole.TENANT) {
      filters.primary_tenant_id = client.userId;
    } else if (client.userRole === UserRole.MAINTENANCE) {
      filters.shared_with_user_id = client.userId;
    }

    if (facilityId) {
      if (AuthService.canAccessAllFacilities(client.userRole)) {
        filters.facility_ids = [facilityId];
      } else if (client.facilityIds?.includes(facilityId)) {
        filters.facility_ids = [facilityId];
      }
    }

    return filters;
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (AuthService.canAccessAllFacilities(client.userRole)) return true;
    return client.facilityIds?.includes(facilityId) ?? false;
  }
}
