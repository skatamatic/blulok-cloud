import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { NotificationType, NotificationPriority } from '@/models/notification.model';

/**
 * Notification Event Interface
 *
 * Represents notification lifecycle events in the BluLok system.
 * These events enable decoupled notification handling and real-time updates.
 */
export interface NotificationEvent {
  /** Type of notification event */
  eventType: 'created' | 'read' | 'deleted';
  /** Notification ID */
  notificationId: string;
  /** Target user ID */
  userId: string;
  /** Notification type category */
  notificationType: NotificationType;
  /** Notification priority */
  priority: NotificationPriority;
  /** Optional facility ID for facility-scoped notifications */
  facilityId?: string;
  /** Optional reference for related entities */
  reference?: {
    type: string;
    id: string;
  };
  /** Timestamp when the event occurred */
  timestamp: Date;
}

/**
 * Notification Created Event
 * Emitted when a new notification is created
 */
export interface NotificationCreatedEvent extends NotificationEvent {
  eventType: 'created';
  title: string;
  message: string;
}

/**
 * Notification Read Event
 * Emitted when a notification is marked as read
 */
export interface NotificationReadEvent extends NotificationEvent {
  eventType: 'read';
  readAt: Date;
}

/**
 * Notification Events Service
 *
 * Publish-subscribe system for notification lifecycle events.
 * Enables decoupled, event-driven architecture for notification handling
 * and real-time system updates.
 *
 * Key Features:
 * - Event-driven notification updates
 * - Real-time WebSocket broadcasting
 * - Comprehensive audit logging
 * - Error-resilient event handling
 *
 * Event Types:
 * - notification:created: New notification created
 * - notification:read: Notification marked as read
 * - notification:deleted: Notification deleted
 * - notification:changed: Catch-all for any notification change
 */
export class NotificationEventsService {
  private static instance: NotificationEventsService;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): NotificationEventsService {
    if (!NotificationEventsService.instance) {
      NotificationEventsService.instance = new NotificationEventsService();
    }
    return NotificationEventsService.instance;
  }

  /**
   * Emit notification created event
   */
  public emitNotificationCreated(event: Omit<NotificationCreatedEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: NotificationCreatedEvent = {
      ...event,
      eventType: 'created',
      timestamp: new Date(),
    };

    logger.info(`📬 Notification created: ${event.notificationType} for user ${event.userId}`, {
      notificationId: event.notificationId,
      priority: event.priority,
    });

    this.eventEmitter.emit('notification:created', fullEvent);
    this.eventEmitter.emit('notification:changed', fullEvent);
  }

  /**
   * Emit notification read event
   */
  public emitNotificationRead(event: Omit<NotificationReadEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: NotificationReadEvent = {
      ...event,
      eventType: 'read',
      timestamp: new Date(),
    };

    logger.debug(`📬 Notification read: ${event.notificationId} by user ${event.userId}`);

    this.eventEmitter.emit('notification:read', fullEvent);
    this.eventEmitter.emit('notification:changed', fullEvent);
  }

  /**
   * Emit notification deleted event
   */
  public emitNotificationDeleted(event: Omit<NotificationEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: NotificationEvent = {
      ...event,
      eventType: 'deleted',
      timestamp: new Date(),
    };

    logger.debug(`📬 Notification deleted: ${event.notificationId} for user ${event.userId}`);

    this.eventEmitter.emit('notification:deleted', fullEvent);
    this.eventEmitter.emit('notification:changed', fullEvent);
  }

  /**
   * Emit batch read event (multiple notifications marked as read)
   */
  public emitBatchRead(
    userId: string,
    notificationIds: string[],
    scope?: { facilityId?: string; facilityIds?: string[] },
  ): void {
    logger.info(`📬 Batch notifications read: ${notificationIds.length} for user ${userId}`);

    this.eventEmitter.emit('notification:batch:read', {
      userId,
      notificationIds,
      facilityId: scope?.facilityId,
      facilityIds: scope?.facilityIds,
      timestamp: new Date(),
    });
  }

  /**
   * Subscribe to notification created events
   * @returns Cleanup function to unsubscribe
   */
  public onNotificationCreated(handler: (event: NotificationCreatedEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('notification:created', wrappedHandler);
    return () => this.eventEmitter.off('notification:created', wrappedHandler);
  }

  /**
   * Subscribe to notification read events
   * @returns Cleanup function to unsubscribe
   */
  public onNotificationRead(handler: (event: NotificationReadEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('notification:read', wrappedHandler);
    return () => this.eventEmitter.off('notification:read', wrappedHandler);
  }

  /**
   * Subscribe to notification deleted events
   * @returns Cleanup function to unsubscribe
   */
  public onNotificationDeleted(handler: (event: NotificationEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('notification:deleted', wrappedHandler);
    return () => this.eventEmitter.off('notification:deleted', wrappedHandler);
  }

  /**
   * Subscribe to any notification change event
   * @returns Cleanup function to unsubscribe
   */
  public onNotificationChanged(handler: (event: NotificationEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('notification:changed', wrappedHandler);
    return () => this.eventEmitter.off('notification:changed', wrappedHandler);
  }

  /**
   * Subscribe to batch read events
   * @returns Cleanup function to unsubscribe
   */
  public onBatchRead(handler: (event: { userId: string; notificationIds: string[]; facilityId?: string; facilityIds?: string[]; timestamp: Date }) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('notification:batch:read', wrappedHandler);
    return () => this.eventEmitter.off('notification:batch:read', wrappedHandler);
  }

  /**
   * @deprecated Use the cleanup function returned by on* methods instead
   */
  public off(eventName: string, handler: Function): void {
    this.eventEmitter.off(eventName, handler as any);
  }

  /**
   * Wrap handler to catch errors
   */
  private wrapHandler<T>(handler: (event: T) => void | Promise<void>) {
    return async (event: T) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Error in notification event handler:', error);
      }
    };
  }

  /**
   * Remove all listeners (for testing)
   */
  public removeAllListeners(): void {
    this.eventEmitter.removeAllListeners();
  }
}
