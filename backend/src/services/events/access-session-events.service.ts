import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import type { AccessSession } from '@/models/access-session.model';

export interface AccessSessionUpsertEvent {
  sessionId: string;
  facilityId?: string;
  unitId?: string;
  deviceId: string;
  state: string;
  changed: string[];
  session: AccessSession;
  timestamp: Date;
}

/**
 * Publish-subscribe for access session lifecycle (pending → open → closed, etc.).
 * ActivitySubscriptionManager fans these out as `access_session_upsert` WS messages.
 */
export class AccessSessionEventsService {
  private static instance: AccessSessionEventsService;
  private readonly eventEmitter = new EventEmitter();

  private constructor() {
    this.eventEmitter.setMaxListeners(100);
  }

  public static getInstance(): AccessSessionEventsService {
    if (!AccessSessionEventsService.instance) {
      AccessSessionEventsService.instance = new AccessSessionEventsService();
    }
    return AccessSessionEventsService.instance;
  }

  public emitSessionUpsert(event: Omit<AccessSessionUpsertEvent, 'timestamp'>): void {
    const full: AccessSessionUpsertEvent = { ...event, timestamp: new Date() };
    logger.debug(`Access session upsert: ${event.sessionId} → ${event.state}`, {
      changed: event.changed,
      deviceId: event.deviceId,
    });
    this.eventEmitter.emit('access_session:upsert', full);
    if (event.facilityId) {
      this.eventEmitter.emit(`access_session:facility:${event.facilityId}`, full);
    }
  }

  public onSessionUpsert(
    handler: (event: AccessSessionUpsertEvent) => void | Promise<void>,
  ): () => void {
    const wrapped = async (event: AccessSessionUpsertEvent) => {
      try {
        await handler(event);
      } catch (error) {
        logger.error('Error in access session upsert handler:', error);
      }
    };
    this.eventEmitter.on('access_session:upsert', wrapped);
    return () => this.eventEmitter.off('access_session:upsert', wrapped);
  }

  public removeAllListeners(): void {
    this.eventEmitter.removeAllListeners();
  }

  public static resetForTests(): void {
    if (AccessSessionEventsService.instance) {
      AccessSessionEventsService.instance.removeAllListeners();
    }
    AccessSessionEventsService.instance = undefined as unknown as AccessSessionEventsService;
  }
}
