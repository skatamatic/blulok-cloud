import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { ActivityType, ActivityEntityType, ActorType, ActivityResult } from '@/models/activity-log.model';

/**
 * Activity Event Interface
 *
 * Represents activity events in the BluLok system for real-time updates.
 * These events enable decoupled activity logging and real-time dashboards.
 */
export interface ActivityEvent {
  /** Activity log ID */
  activityId: string;
  /** Type of entity the activity is about */
  entityType: ActivityEntityType;
  /** Entity ID */
  entityId: string;
  /** Type of activity */
  activityType: ActivityType;
  /** Activity title */
  title: string;
  /** Activity description */
  description?: string;
  /** Who/what performed the action */
  actorType: ActorType;
  /** Actor ID (user ID if actor is user) */
  actorId?: string;
  /** Actor display name */
  actorName?: string;
  /** Result of the activity */
  result: ActivityResult;
  /** Optional facility ID */
  facilityId?: string;
  /** Optional unit ID */
  unitId?: string;
  /** Optional device ID */
  deviceId?: string;
  /** When the activity occurred */
  occurredAt: Date;
  /** Timestamp when the event was emitted */
  timestamp: Date;
}

/**
 * Activity Events Service
 *
 * Publish-subscribe system for activity logging events.
 * Enables decoupled, event-driven architecture for activity tracking
 * and real-time dashboard updates.
 *
 * Key Features:
 * - Event-driven activity updates
 * - Real-time WebSocket broadcasting
 * - Facility-scoped event filtering
 * - Error-resilient event handling
 *
 * Event Types:
 * - activity:logged: New activity logged
 * - activity:lock: Lock activity (lock, unlock, locking, unlocking)
 * - activity:access: Access attempt activity
 * - activity:status: Status change activity
 * - activity:error: Error activity
 * - activity:maintenance: Maintenance activity
 */
export class ActivityEventsService {
  private static instance: ActivityEventsService;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): ActivityEventsService {
    if (!ActivityEventsService.instance) {
      ActivityEventsService.instance = new ActivityEventsService();
    }
    return ActivityEventsService.instance;
  }

  /**
   * Emit activity logged event
   */
  public emitActivityLogged(event: Omit<ActivityEvent, 'timestamp'>): void {
    const fullEvent: ActivityEvent = {
      ...event,
      timestamp: new Date(),
    };

    logger.debug(`📋 Activity logged: ${event.activityType} on ${event.entityType}/${event.entityId}`, {
      activityId: event.activityId,
      result: event.result,
    });

    // Emit general event
    this.eventEmitter.emit('activity:logged', fullEvent);

    // Emit specific event based on activity type
    switch (event.activityType) {
      case 'lock':
      case 'unlock':
      case 'locking':
      case 'unlocking':
        this.eventEmitter.emit('activity:lock', fullEvent);
        break;
      case 'access_attempt':
        this.eventEmitter.emit('activity:access', fullEvent);
        break;
      case 'status_change':
      case 'connection_change':
        this.eventEmitter.emit('activity:status', fullEvent);
        break;
      case 'error':
        this.eventEmitter.emit('activity:error', fullEvent);
        break;
      case 'maintenance_start':
      case 'maintenance_end':
        this.eventEmitter.emit('activity:maintenance', fullEvent);
        break;
    }

    // Emit facility-scoped event if facility ID is present
    if (event.facilityId) {
      this.eventEmitter.emit(`activity:facility:${event.facilityId}`, fullEvent);
    }

    // Emit unit-scoped event if unit ID is present
    if (event.unitId) {
      this.eventEmitter.emit(`activity:unit:${event.unitId}`, fullEvent);
    }

    // Emit device-scoped event if device ID is present
    if (event.deviceId) {
      this.eventEmitter.emit(`activity:device:${event.deviceId}`, fullEvent);
    }
  }

  /**
   * Subscribe to all activity events
   * @returns Cleanup function to unsubscribe
   */
  public onActivityLogged(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:logged', wrappedHandler);
    return () => this.eventEmitter.off('activity:logged', wrappedHandler);
  }

  /**
   * Subscribe to lock-related activity events
   * @returns Cleanup function to unsubscribe
   */
  public onLockActivity(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:lock', wrappedHandler);
    return () => this.eventEmitter.off('activity:lock', wrappedHandler);
  }

  /**
   * Subscribe to access attempt activity events
   * @returns Cleanup function to unsubscribe
   */
  public onAccessActivity(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:access', wrappedHandler);
    return () => this.eventEmitter.off('activity:access', wrappedHandler);
  }

  /**
   * Subscribe to status change activity events
   * @returns Cleanup function to unsubscribe
   */
  public onStatusActivity(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:status', wrappedHandler);
    return () => this.eventEmitter.off('activity:status', wrappedHandler);
  }

  /**
   * Subscribe to error activity events
   * @returns Cleanup function to unsubscribe
   */
  public onErrorActivity(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:error', wrappedHandler);
    return () => this.eventEmitter.off('activity:error', wrappedHandler);
  }

  /**
   * Subscribe to maintenance activity events
   * @returns Cleanup function to unsubscribe
   */
  public onMaintenanceActivity(handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    this.eventEmitter.on('activity:maintenance', wrappedHandler);
    return () => this.eventEmitter.off('activity:maintenance', wrappedHandler);
  }

  /**
   * Subscribe to activity events for a specific facility
   * @returns Cleanup function to unsubscribe
   */
  public onFacilityActivity(facilityId: string, handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    const eventName = `activity:facility:${facilityId}`;
    this.eventEmitter.on(eventName, wrappedHandler);
    return () => this.eventEmitter.off(eventName, wrappedHandler);
  }

  /**
   * Subscribe to activity events for a specific unit
   * @returns Cleanup function to unsubscribe
   */
  public onUnitActivity(unitId: string, handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    const eventName = `activity:unit:${unitId}`;
    this.eventEmitter.on(eventName, wrappedHandler);
    return () => this.eventEmitter.off(eventName, wrappedHandler);
  }

  /**
   * Subscribe to activity events for a specific device
   * @returns Cleanup function to unsubscribe
   */
  public onDeviceActivity(deviceId: string, handler: (event: ActivityEvent) => void | Promise<void>): () => void {
    const wrappedHandler = this.wrapHandler(handler);
    const eventName = `activity:device:${deviceId}`;
    this.eventEmitter.on(eventName, wrappedHandler);
    return () => this.eventEmitter.off(eventName, wrappedHandler);
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
        logger.error('Error in activity event handler:', error);
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
