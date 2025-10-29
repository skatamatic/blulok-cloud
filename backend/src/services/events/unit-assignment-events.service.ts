import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

/**
 * Unit Assignment Event Interface
 *
 * Represents changes to tenant-unit relationships in the BluLok system.
 * These events drive access control updates, denylist management, and
 * real-time dashboard notifications.
 */
export interface UnitAssignmentEvent {
  /** Type of assignment change */
  eventType: 'assigned' | 'unassigned' | 'updated';
  /** Unit affected by the assignment change */
  unitId: string;
  /** Facility containing the affected unit */
  facilityId: string;
  /** Tenant affected by the assignment change */
  tenantId: string;
  /** Type of access granted (full/shared/temporary) */
  accessType?: string;
  /** Additional event metadata for tracking and auditing */
  metadata?: {
    /** Source of the assignment change */
    source: 'manual' | 'fms_sync' | 'api';
    /** FMS sync log ID if triggered by external system */
    syncLogId?: string;
    /** User who performed the action */
    performedBy?: string;
  };
  /** Timestamp when the event occurred */
  timestamp: Date;
}

/**
 * Unit Assignment Events Service
 *
 * Publish-subscribe system for tenant-unit assignment lifecycle events.
 * Enables decoupled, event-driven architecture for access control management
 * and real-time system updates.
 *
 * Key Features:
 * - Event-driven access control updates
 * - Multi-source assignment tracking (manual, FMS, API)
 * - Comprehensive audit logging
 * - Error-resilient event handling
 * - High-performance event emission with many listeners
 *
 * Event Types:
 * - tenant:assigned: New tenant-unit relationship created
 * - tenant:unassigned: Existing tenant-unit relationship terminated
 * - assignment:updated: Access type or permissions modified
 * - unit:assignment:changed: Catch-all for any assignment change
 *
 * Security Integration:
 * - Triggers AccessRevocationListenerService for denylist updates
 * - Updates Route Pass audiences when assignments change
 * - Maintains facility-scoped access control integrity
 */

export class UnitAssignmentEventsService {
  private static instance: UnitAssignmentEventsService;
  private eventEmitter: EventEmitter;

  private constructor() {
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100); // Allow many listeners
  }

  public static getInstance(): UnitAssignmentEventsService {
    if (!UnitAssignmentEventsService.instance) {
      UnitAssignmentEventsService.instance = new UnitAssignmentEventsService();
    }
    return UnitAssignmentEventsService.instance;
  }

  /**
   * Emit tenant assigned to unit event
   */
  public emitTenantAssigned(event: Omit<UnitAssignmentEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: UnitAssignmentEvent = {
      ...event,
      eventType: 'assigned',
      timestamp: new Date(),
    };

    logger.info(`📍 Unit assignment event: Tenant ${event.tenantId} assigned to unit ${event.unitId}`, {
      source: event.metadata?.source || 'unknown'
    });

    this.eventEmitter.emit('tenant:assigned', fullEvent);
    this.eventEmitter.emit('unit:assignment:changed', fullEvent);
  }

  /**
   * Emit tenant unassigned from unit event
   */
  public emitTenantUnassigned(event: Omit<UnitAssignmentEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: UnitAssignmentEvent = {
      ...event,
      eventType: 'unassigned',
      timestamp: new Date(),
    };

    logger.info(`📍 Unit assignment event: Tenant ${event.tenantId} unassigned from unit ${event.unitId}`, {
      source: event.metadata?.source || 'unknown'
    });

    this.eventEmitter.emit('tenant:unassigned', fullEvent);
    this.eventEmitter.emit('unit:assignment:changed', fullEvent);
  }

  /**
   * Emit tenant-unit assignment updated event
   */
  public emitAssignmentUpdated(event: Omit<UnitAssignmentEvent, 'eventType' | 'timestamp'>): void {
    const fullEvent: UnitAssignmentEvent = {
      ...event,
      eventType: 'updated',
      timestamp: new Date(),
    };

    logger.info(`📍 Unit assignment event: Assignment updated for tenant ${event.tenantId}, unit ${event.unitId}`, {
      source: event.metadata?.source || 'unknown'
    });

    this.eventEmitter.emit('assignment:updated', fullEvent);
    this.eventEmitter.emit('unit:assignment:changed', fullEvent);
  }

  /**
   * Subscribe to tenant assigned events
   */
  public onTenantAssigned(handler: (event: UnitAssignmentEvent) => void | Promise<void>): void {
    this.eventEmitter.on('tenant:assigned', this.wrapHandler(handler));
  }

  /**
   * Subscribe to tenant unassigned events
   */
  public onTenantUnassigned(handler: (event: UnitAssignmentEvent) => void | Promise<void>): void {
    this.eventEmitter.on('tenant:unassigned', this.wrapHandler(handler));
  }

  /**
   * Subscribe to any assignment change event
   */
  public onAssignmentChanged(handler: (event: UnitAssignmentEvent) => void | Promise<void>): void {
    this.eventEmitter.on('unit:assignment:changed', this.wrapHandler(handler));
  }

  /**
   * Unsubscribe from events
   */
  public off(eventName: string, handler: Function): void {
    this.eventEmitter.off(eventName, handler as any);
  }

  /**
   * Wrap handler to catch errors
   */
  private wrapHandler(handler: (event: UnitAssignmentEvent) => void | Promise<void>) {
    return async (event: UnitAssignmentEvent) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Error in unit assignment event handler:', error);
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
