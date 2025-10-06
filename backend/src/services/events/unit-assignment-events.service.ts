/**
 * Unit Assignment Events Service
 * 
 * Pub/sub system for unit assignment changes.
 * Allows services to react to tenant-unit assignments (e.g., gateway access updates)
 */

import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

export interface UnitAssignmentEvent {
  eventType: 'assigned' | 'unassigned' | 'updated';
  unitId: string;
  facilityId: string;
  tenantId: string;
  accessType?: string;
  metadata?: {
    source: 'manual' | 'fms_sync' | 'api';
    syncLogId?: string;
    performedBy?: string;
  };
  timestamp: Date;
}

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
