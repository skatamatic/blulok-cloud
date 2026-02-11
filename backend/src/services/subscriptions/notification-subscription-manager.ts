import { WebSocket } from 'ws';
import { UserRole } from '@/types/auth.types';
import { BaseSubscriptionManager, SubscriptionClient, WebSocketMessage } from './base-subscription-manager';
import { NotificationModel } from '@/models/notification.model';
import { NotificationEventsService, NotificationCreatedEvent } from '@/services/events/notification-events.service';

/**
 * Notification Subscription Manager
 *
 * Manages real-time subscriptions to user notification updates.
 * Provides live notification counts and new notification alerts.
 *
 * Subscription Type: 'notifications'
 *
 * Key Features:
 * - Real-time notification updates
 * - Unread count tracking
 * - New notification alerts
 * - User-scoped subscriptions
 *
 * Data Provided:
 * - Unread notification count
 * - New notifications as they arrive
 * - Read receipt updates
 *
 * Access Control:
 * - All authenticated users can subscribe
 * - Users only receive their own notifications
 */
export class NotificationSubscriptionManager extends BaseSubscriptionManager {
  private notificationModel: NotificationModel;
  private eventService: NotificationEventsService;
  private initialized: boolean = false;
  private cleanupFunctions: Array<() => void> = [];

  constructor() {
    super();
    this.notificationModel = new NotificationModel();
    this.eventService = NotificationEventsService.getInstance();
    this.setupEventListeners();
  }

  /**
   * Clean up event listeners when the manager is destroyed
   */
  public destroy(): void {
    this.cleanupFunctions.forEach(cleanup => cleanup());
    this.cleanupFunctions = [];
    this.initialized = false;
  }

  getSubscriptionType(): string {
    return 'notifications';
  }

  canSubscribe(_userRole: UserRole): boolean {
    // All authenticated users can subscribe to their own notifications
    return true;
  }

  private setupEventListeners(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for new notifications
    this.cleanupFunctions.push(
      this.eventService.onNotificationCreated(async (event: NotificationCreatedEvent) => {
        await this.broadcastToUser(event.userId, {
          type: 'notification_created',
          data: {
            notificationId: event.notificationId,
            type: event.notificationType,
            title: event.title,
            message: event.message,
            priority: event.priority,
            facilityId: event.facilityId,
            reference: event.reference,
            timestamp: event.timestamp.toISOString(),
          },
        });

        // Also send updated unread count
        await this.broadcastUnreadCount(event.userId);
      })
    );

    // Listen for read events
    this.cleanupFunctions.push(
      this.eventService.onNotificationRead(async (event) => {
        await this.broadcastToUser(event.userId, {
          type: 'notification_read',
          data: {
            notificationId: event.notificationId,
            readAt: event.readAt.toISOString(),
          },
        });

        // Update unread count
        await this.broadcastUnreadCount(event.userId);
      })
    );

    // Listen for batch read events
    this.cleanupFunctions.push(
      this.eventService.onBatchRead(async (event) => {
        await this.broadcastToUser(event.userId, {
          type: 'notifications_batch_read',
          data: {
            notificationIds: event.notificationIds,
            facilityId: event.facilityId,
            timestamp: event.timestamp.toISOString(),
          },
        });

        // Update unread count
        await this.broadcastUnreadCount(event.userId);
      })
    );

    // Listen for deleted events
    this.cleanupFunctions.push(
      this.eventService.onNotificationDeleted(async (event) => {
        await this.broadcastToUser(event.userId, {
          type: 'notification_deleted',
          data: {
            notificationId: event.notificationId,
            timestamp: event.timestamp.toISOString(),
          },
        });

        // Update unread count (in case deleted notification was unread)
        await this.broadcastUnreadCount(event.userId);
      })
    );
  }

  protected async sendInitialData(ws: WebSocket, subscriptionId: string, client: SubscriptionClient): Promise<void> {
    try {
      // Get unread count for the user
      const unreadCount = await this.notificationModel.getUnreadCount(client.userId);

      // Get recent notifications (last 10)
      const recentNotifications = await this.notificationModel.find({
        user_id: client.userId,
        limit: 10,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });

      this.sendMessage(ws, {
        type: 'notifications_update',
        subscriptionId,
        data: {
          unreadCount,
          recentNotifications: recentNotifications.map(n => ({
            id: n.id,
            type: n.notification_type,
            title: n.title,
            message: n.message,
            priority: n.priority,
            isRead: n.is_read,
            facilityId: n.facility_id,
            createdAt: n.created_at,
          })),
          lastUpdated: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error('Error sending initial notification data:', error);
      this.sendError(ws, 'Failed to load initial notification data');
    }
  }

  /**
   * Broadcast to a specific user
   */
  private async broadcastToUser(userId: string, message: Partial<WebSocketMessage>): Promise<void> {
    const activeSubscriptions = Array.from(this.watchers.keys());

    for (const subscriptionId of activeSubscriptions) {
      const client = this.clientContext.get(subscriptionId);
      if (!client || client.userId !== userId) continue;

      const watchers = this.watchers.get(subscriptionId);
      if (!watchers) continue;

      for (const ws of watchers) {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({
              ...message,
              subscriptionId,
              timestamp: new Date().toISOString(),
            }));
          } catch (error) {
            this.logger.error('Error broadcasting to WebSocket:', error);
          }
        }
      }
    }
  }

  /**
   * Broadcast updated unread count to a user
   */
  private async broadcastUnreadCount(userId: string): Promise<void> {
    try {
      const unreadCount = await this.notificationModel.getUnreadCount(userId);
      await this.broadcastToUser(userId, {
        type: 'notifications_count_update',
        data: {
          unreadCount,
          lastUpdated: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error('Error broadcasting unread count:', error);
    }
  }

  /**
   * Broadcast update for general refresh
   */
  public async broadcastUpdate(): Promise<void> {
    // Not needed for notifications - we use event-driven updates
  }
}
