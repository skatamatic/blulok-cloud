/**
 * Access Session Service — façade over correlator + model with event emission.
 */

import {
  AccessSessionModel,
  AccessSession,
  AccessSessionWithContext,
  AccessSessionFilters,
} from '@/models/access-session.model';
import {
  AccessSessionCorrelator,
  CloudRemoteUnlockParams,
  GrantEventParams,
  DenialEventParams,
  UnlockStateParams,
  LockStateParams,
  FailSessionParams,
} from '@/services/access/access-session-correlator.service';
import { AccessSessionEventsService } from '@/services/events/access-session-events.service';

export class AccessSessionService {
  private static instance: AccessSessionService;
  private readonly model = new AccessSessionModel();
  private readonly correlator = new AccessSessionCorrelator();
  private readonly events = AccessSessionEventsService.getInstance();

  private constructor() {}

  public static getInstance(): AccessSessionService {
    if (!AccessSessionService.instance) {
      AccessSessionService.instance = new AccessSessionService();
    }
    return AccessSessionService.instance;
  }

  public static resetForTests(): void {
    AccessSessionService.instance = undefined as unknown as AccessSessionService;
  }

  async getById(id: string): Promise<AccessSession | null> {
    return this.model.findById(id);
  }

  async findWithContext(filters: AccessSessionFilters): Promise<AccessSessionWithContext[]> {
    return this.model.findWithContext(filters);
  }

  async count(filters: AccessSessionFilters): Promise<number> {
    return this.model.count(filters);
  }

  async countCurrentlyOpen(filters: Omit<AccessSessionFilters, 'state' | 'states'> = {}): Promise<number> {
    return this.model.countCurrentlyOpen(filters);
  }

  async findPendingByDevice(deviceId: string): Promise<AccessSession | null> {
    return this.model.findPendingByDevice(deviceId);
  }

  async findPendingByRemoteCommandId(remoteCommandId: string): Promise<AccessSession | null> {
    return this.model.findPendingByRemoteCommandId(remoteCommandId);
  }

  async onCloudRemoteUnlockIssued(params: CloudRemoteUnlockParams): Promise<AccessSession> {
    const session = await this.correlator.onCloudRemoteUnlockIssued(params);
    this.emitUpsert(session, ['state', 'started_at']);
    return session;
  }

  async onGrantAccessEvent(params: GrantEventParams): Promise<AccessSession> {
    const session = await this.correlator.onGrantAccessEvent(params);
    this.emitUpsert(session, ['attempt_count', 'state']);
    return session;
  }

  async onDenialAccessEvent(params: DenialEventParams): Promise<AccessSession> {
    const session = await this.correlator.onDenialAccessEvent(params);
    this.emitUpsert(session, ['state', 'outcome']);
    return session;
  }

  async onDeviceUnlocked(params: UnlockStateParams): Promise<AccessSession> {
    const session = await this.correlator.onDeviceUnlocked(params);
    this.emitUpsert(session, ['state', 'opened_at']);
    return session;
  }

  async onDeviceLocked(params: LockStateParams): Promise<AccessSession> {
    const session = await this.correlator.onDeviceLocked(params);
    this.emitUpsert(session, ['state', 'closed_at', 'open_duration_sec']);
    return session;
  }

  async failOrTimeout(params: FailSessionParams): Promise<AccessSession | null> {
    const session = await this.correlator.failOrTimeout(params);
    if (session) this.emitUpsert(session, ['state', 'outcome', 'settled_at']);
    return session;
  }

  async expirePendingSessions(now?: Date): Promise<AccessSession[]> {
    const sessions = await this.correlator.expirePendingSessions(now);
    for (const session of sessions) {
      this.emitUpsert(session, ['state', 'outcome', 'settled_at']);
    }
    return sessions;
  }

  private emitUpsert(session: AccessSession, changed: string[]): void {
    this.events.emitSessionUpsert({
      sessionId: session.id,
      facilityId: session.facility_id || undefined,
      unitId: session.unit_id || undefined,
      deviceId: session.device_id,
      state: session.state,
      changed,
      session,
    });
  }
}
