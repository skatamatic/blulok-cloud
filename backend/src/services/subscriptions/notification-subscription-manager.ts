import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import {
  BaseSubscriptionManager,
  SubscriptionClient,
  WebSocketMessage,
} from './base-subscription-manager';
import { NotificationModel, Notification } from '@/models/notification.model';
import { NotificationEventsService, NotificationCreatedEvent } from '@/services/events/notification-events.service';
import { logger } from '@/utils/logger';
import {
  canViewNotificationType,
  excludedNotificationTypesForRole,
} from '@/utils/in-app-notification-visibility.utils';

type NotificationSubscriptionFilters = {
  facilityId?: string;
  facilityIds?: string[];
};

/**
 * Manages real-time subscriptions to user notification updates with facility scoping.
 */
export class NotificationSubscriptionManager extends BaseSubscriptionManager {
  private notificationModel: NotificationModel;
  private eventService: NotificationEventsService;
  private initialized = false;
  private cleanupFunctions: Array<() => void> = [];
  private subscriptionFilters = new Map<string, NotificationSubscriptionFilters>();

  constructor() {
    super();
    this.notificationModel = new NotificationModel();
    this.eventService = NotificationEventsService.getInstance();
    this.setupEventListeners();
  }

  public destroy(): void {
    this.cleanupFunctions.forEach((cleanup) => cleanup());
    this.cleanupFunctions = [];
    this.initialized = false;
  }

  getSubscriptionType(): string {
    return 'notifications';
  }

  canSubscribe(_userRole: UserRole): boolean {
    return true;
  }

  async handleSubscription(
    ws: WebSocket,
    message: WebSocketMessage,
    client: SubscriptionClient,
  ): Promise<boolean> {
    const subscriptionId = message.subscriptionId || `${this.getSubscriptionType()}-${Date.now()}`;

    if (!this.canSubscribe(client.userRole)) {
      this.sendError(ws, `Access denied: ${this.getSubscriptionType()} subscription requires appropriate role`);
      return false;
    }

    const rawFilters = (message.data ?? {}) as Record<string, unknown>;
    const facilityId =
      typeof rawFilters.facilityId === 'string'
        ? rawFilters.facilityId
        : typeof rawFilters.facility_id === 'string'
          ? rawFilters.facility_id
          : undefined;

    let facilityIds: string[] | undefined;
    if (Array.isArray(rawFilters.facilityIds)) {
      facilityIds = rawFilters.facilityIds.filter((x): x is string => typeof x === 'string');
    } else if (Array.isArray(rawFilters.facility_ids)) {
      facilityIds = rawFilters.facility_ids.filter((x): x is string => typeof x === 'string');
    }

    if (facilityId && !this.canAccessFacility(client, facilityId)) {
      this.sendError(ws, 'Access denied: You do not have access to this facility');
      return false;
    }

    if (facilityIds?.length && !AuthService.canAccessAllFacilities(client.userRole)) {
      const allowed = client.facilityIds ?? [];
      facilityIds = facilityIds.filter((id) => allowed.includes(id));
    }

    const scope = this.resolveScope(client, facilityId, facilityIds);
    this.subscriptionFilters.set(subscriptionId, scope);
    this.clientContext.set(subscriptionId, client);
    this.addWatcher(subscriptionId, ws, client);

    await this.sendInitialData(ws, subscriptionId, client);

    logger.info(
      `📡 ${this.getSubscriptionType()} subscription created: ${subscriptionId} for user ${client.userId}` +
        (scope.facilityId ? ` (facility: ${scope.facilityId})` : scope.facilityIds?.length ? ` (${scope.facilityIds.length} facilities)` : ''),
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
    logger.info(`📡 ${this.getSubscriptionType()} unsubscription: ${subscriptionId} for user ${client.userId}`);
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

  private setupEventListeners(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.cleanupFunctions.push(
      this.eventService.onNotificationCreated(async (event: NotificationCreatedEvent) => {
        await this.broadcastCreated(event);
      }),
    );

    this.cleanupFunctions.push(
      this.eventService.onNotificationRead(async (event) => {
        this.broadcastToMatchingSubscriptions(event.userId, {
          type: 'notification_read',
          data: {
            notificationId: event.notificationId,
            readAt: event.readAt.toISOString(),
          },
        }, { facilityId: event.facilityId });
        await this.broadcastUnreadCountsForUser(event.userId);
      }),
    );

    this.cleanupFunctions.push(
      this.eventService.onBatchRead(async (event) => {
        this.broadcastToMatchingSubscriptions(event.userId, {
          type: 'notifications_batch_read',
          data: {
            notificationIds: event.notificationIds,
            facilityId: event.facilityId,
            facilityIds: event.facilityIds,
            timestamp: event.timestamp.toISOString(),
          },
        }, { facilityId: event.facilityId, facilityIds: event.facilityIds });
        await this.broadcastUnreadCountsForUser(event.userId);
      }),
    );

    this.cleanupFunctions.push(
      this.eventService.onNotificationDeleted(async (event) => {
        this.broadcastToMatchingSubscriptions(event.userId, {
          type: 'notification_deleted',
          data: {
            notificationId: event.notificationId,
            timestamp: event.timestamp.toISOString(),
          },
        }, { facilityId: event.facilityId });
        await this.broadcastUnreadCountsForUser(event.userId);
      }),
    );
  }

  protected async sendInitialData(
    ws: WebSocket,
    subscriptionId: string,
    client: SubscriptionClient,
  ): Promise<void> {
    try {
      const scope = this.subscriptionFilters.get(subscriptionId) ?? {};
      const excludedTypes = excludedNotificationTypesForRole(client.userRole);
      const excludeNotificationTypes =
        excludedTypes.length > 0 ? excludedTypes : undefined;

      const unreadCount = await this.notificationModel.getUnreadCount(client.userId, {
        facilityId: scope.facilityId,
        facilityIds: scope.facilityIds,
        excludeNotificationTypes,
      });

      const recentNotifications = await this.notificationModel.find({
        user_id: client.userId,
        facility_id: scope.facilityId,
        facility_ids: scope.facilityId ? undefined : scope.facilityIds,
        include_expired: true,
        exclude_notification_types: excludeNotificationTypes,
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      this.sendMessage(ws, {
        type: 'notifications_update',
        subscriptionId,
        data: {
          unreadCount,
          recentNotifications: recentNotifications.map((n) => this.formatNotification(n)),
          lastUpdated: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error sending initial notification data:', error);
      this.sendError(ws, 'Failed to load initial notification data');
    }
  }

  private async broadcastCreated(event: NotificationCreatedEvent): Promise<void> {
    const activeSubscriptions = Array.from(this.watchers.keys());

    for (const subscriptionId of activeSubscriptions) {
      const client = this.clientContext.get(subscriptionId);
      if (!client || client.userId !== event.userId) continue;

      if (!canViewNotificationType(client.userRole, event.notificationType)) continue;

      const scope = this.subscriptionFilters.get(subscriptionId);
      if (!this.matchesFacilityScope(event.facilityId, scope, client)) continue;

      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(
            JSON.stringify({
              type: 'notification_created',
              subscriptionId,
              data: {
                notificationId: event.notificationId,
                type: event.notificationType,
                title: event.title,
                message: event.message,
                priority: event.priority,
                facilityId: event.facilityId,
                reference: event.reference,
                metadata: event.metadata ?? null,
                timestamp: event.timestamp.toISOString(),
              },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (error) {
          logger.error('Error broadcasting notification_created:', error);
        }
      }
    }

    await this.broadcastUnreadCountsForUser(event.userId);
  }

  private broadcastToMatchingSubscriptions(
    userId: string,
    message: Partial<WebSocketMessage>,
    scopeFilter?: { facilityId?: string; facilityIds?: string[] },
  ): void {
    for (const subscriptionId of this.watchers.keys()) {
      const client = this.clientContext.get(subscriptionId);
      if (!client || client.userId !== userId) continue;

      const scope = this.subscriptionFilters.get(subscriptionId);
      if (scopeFilter?.facilityId) {
        if (!this.matchesFacilityScope(scopeFilter.facilityId, scope, client)) continue;
      } else if (scopeFilter?.facilityIds?.length) {
        if (!this.matchesBatchReadScope(undefined, scopeFilter.facilityIds, scope, client)) continue;
      }

      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(
            JSON.stringify({
              ...message,
              subscriptionId,
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (error) {
          logger.error('Error broadcasting notification update:', error);
        }
      }
    }
  }

  /** Scope check for batch read-all events that carry facilityId or facilityIds. */
  private matchesBatchReadScope(
    eventFacilityId: string | undefined,
    eventFacilityIds: string[] | undefined,
    scope: NotificationSubscriptionFilters | undefined,
    client: SubscriptionClient,
  ): boolean {
    if (eventFacilityId) {
      return this.matchesFacilityScope(eventFacilityId, scope, client);
    }
    if (eventFacilityIds?.length) {
      if (scope?.facilityId) {
        return eventFacilityIds.includes(scope.facilityId);
      }
      if (scope?.facilityIds?.length) {
        return scope.facilityIds.some((id) => eventFacilityIds.includes(id));
      }
      if (!AuthService.canAccessAllFacilities(client.userRole) && client.facilityIds?.length) {
        return eventFacilityIds.some((id) => client.facilityIds!.includes(id));
      }
      return true;
    }
    return true;
  }

  private async broadcastUnreadCountsForUser(userId: string): Promise<void> {
    for (const subscriptionId of this.watchers.keys()) {
      const client = this.clientContext.get(subscriptionId);
      if (!client || client.userId !== userId) continue;
      const scope = this.subscriptionFilters.get(subscriptionId) ?? {};
      const excludedTypes = excludedNotificationTypesForRole(client.userRole);
      const excludeNotificationTypes =
        excludedTypes.length > 0 ? excludedTypes : undefined;

      const unreadCount = await this.notificationModel.getUnreadCount(userId, {
        facilityId: scope.facilityId,
        facilityIds: scope.facilityIds,
        excludeNotificationTypes,
      });

      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        try {
          ws.send(
            JSON.stringify({
              type: 'notifications_count_update',
              subscriptionId,
              data: { unreadCount, lastUpdated: new Date().toISOString() },
              timestamp: new Date().toISOString(),
            }),
          );
        } catch (error) {
          logger.error('Error broadcasting unread count:', error);
        }
      }
    }
  }

  private resolveScope(
    client: SubscriptionClient,
    facilityId?: string,
    facilityIds?: string[],
  ): NotificationSubscriptionFilters {
    if (facilityId) {
      return { facilityId };
    }
    if (facilityIds && facilityIds.length > 0) {
      return { facilityIds };
    }
    if (!AuthService.canAccessAllFacilities(client.userRole) && client.facilityIds?.length) {
      return { facilityIds: client.facilityIds };
    }
    return {};
  }

  private canAccessFacility(client: SubscriptionClient, facilityId: string): boolean {
    if (AuthService.canAccessAllFacilities(client.userRole)) return true;
    return client.facilityIds?.includes(facilityId) ?? false;
  }

  private matchesFacilityScope(
    notificationFacilityId: string | undefined,
    scope: NotificationSubscriptionFilters | undefined,
    client: SubscriptionClient,
  ): boolean {
    if (!scope?.facilityId && !scope?.facilityIds?.length) {
      if (!AuthService.canAccessAllFacilities(client.userRole) && notificationFacilityId && client.facilityIds) {
        return client.facilityIds.includes(notificationFacilityId);
      }
      return true;
    }

    if (!notificationFacilityId) {
      return false;
    }

    if (scope.facilityId) {
      return notificationFacilityId === scope.facilityId;
    }

    if (scope.facilityIds?.length) {
      return scope.facilityIds.includes(notificationFacilityId);
    }

    return true;
  }

  private formatNotification(n: Notification): {
    id: string;
    type: Notification['notification_type'];
    title: string;
    message: string;
    priority: Notification['priority'];
    isRead: boolean;
    readAt: Date | null;
    facilityId: string | null;
    reference: { type: string; id: string } | null;
    metadata: Notification['metadata'];
    createdAt: Date;
  } {
    return {
      id: n.id,
      type: n.notification_type,
      title: n.title,
      message: n.message,
      priority: n.priority,
      isRead: n.is_read,
      readAt: n.read_at,
      facilityId: n.facility_id,
      reference: n.reference_type && n.reference_id
        ? { type: n.reference_type, id: n.reference_id }
        : null,
      metadata: n.metadata,
      createdAt: n.created_at,
    };
  }

  public async broadcastUpdate(): Promise<void> {
    // Event-driven only
  }
}
