/**
 * Access session correlator — owns lifecycle/coalescing rules.
 * Sessions are resolved before activity_logs inserts so raw events carry access_session_id.
 */

import {
  AccessSessionModel,
  AccessSession,
  AccessSessionActorType,
  AccessSessionDeviceType,
  CreateAccessSessionData,
} from '@/models/access-session.model';
import {
  COALESCEABLE_GRANT_METHODS,
  ON_SITE_GRANT_TO_OPEN_TTL_SEC,
} from '@/constants/access-session.constants';
import { logger } from '@/utils/logger';

export type SessionActor = {
  type?: AccessSessionActorType;
  id?: string;
  name?: string;
  role?: string;
};

export type CloudRemoteUnlockParams = {
  facilityId: string;
  deviceId: string;
  unitId?: string;
  gatewayId?: string;
  deviceType: AccessSessionDeviceType;
  method: string;
  commandId: string;
  initiator: SessionActor;
  expiresAt: Date;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
};

export type GrantEventParams = {
  facilityId: string;
  deviceId: string;
  unitId?: string;
  gatewayId?: string;
  deviceType: AccessSessionDeviceType;
  method: string;
  actor?: SessionActor;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type DenialEventParams = GrantEventParams & {
  denialReason?: string;
  reasonMessage?: string;
};

export type UnlockStateParams = {
  facilityId: string;
  deviceId: string;
  unitId?: string;
  gatewayId?: string;
  deviceType: AccessSessionDeviceType;
  remoteCommandId?: string;
  actor?: SessionActor;
  method?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type LockStateParams = {
  facilityId: string;
  deviceId: string;
  unitId?: string;
  gatewayId?: string;
  deviceType: AccessSessionDeviceType;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
};

export type FailSessionParams = {
  sessionId?: string;
  deviceId?: string;
  remoteCommandId?: string;
  state: 'failed' | 'timed_out';
  denialReason?: string;
  reasonMessage?: string;
  metadata?: Record<string, unknown>;
};

function isCoalesceableMethod(method: string): boolean {
  return (COALESCEABLE_GRANT_METHODS as readonly string[]).includes(method);
}

function sameActor(session: AccessSession, actor?: SessionActor): boolean {
  if (!actor?.id && !session.actor_id) return true;
  if (!actor?.id || !session.actor_id) return false;
  return actor.id === session.actor_id;
}

export class AccessSessionCorrelator {
  private readonly model = new AccessSessionModel();

  /**
   * Cloud remote unlock issued → pending session keyed by remote_command_id.
   */
  async onCloudRemoteUnlockIssued(params: CloudRemoteUnlockParams): Promise<AccessSession> {
    const existing = await this.model.findPendingByRemoteCommandId(params.commandId);
    if (existing) return existing;

    return this.model.create({
      facility_id: params.facilityId,
      unit_id: params.unitId,
      device_id: params.deviceId,
      device_type: params.deviceType,
      gateway_id: params.gatewayId,
      kind: 'access',
      origin: 'cloud_remote',
      method: params.method,
      outcome: 'granted',
      state: 'pending',
      actor_type: params.initiator.type || 'user',
      actor_id: params.initiator.id,
      actor_name: params.initiator.name,
      actor_role: params.initiator.role,
      started_at: params.startedAt || new Date(),
      expires_at: params.expiresAt,
      remote_command_id: params.commandId,
      metadata: {
        initiated_by: {
          id: params.initiator.id,
          name: params.initiator.name,
          role: params.initiator.role,
        },
        ...params.metadata,
      },
    });
  }

  /**
   * Gateway grant: coalesce into open session, attach to pending cloud, or create on-site pending.
   */
  async onGrantAccessEvent(params: GrantEventParams): Promise<AccessSession> {
    const open = await this.model.findOpenByDevice(params.deviceId);
    if (
      open
      && isCoalesceableMethod(params.method)
      && open.method === params.method
      && sameActor(open, params.actor)
    ) {
      const updated = await this.model.update(open.id, {
        attempt_count: open.attempt_count + 1,
        metadata: this.mergeMetadata(open.metadata, params.metadata),
      });
      return updated || open;
    }

    const pending = await this.model.findPendingByDevice(params.deviceId);
    if (pending && pending.origin === 'cloud_remote') {
      const updated = await this.model.update(pending.id, {
        attempt_count: pending.attempt_count + 1,
        unit_id: params.unitId || pending.unit_id,
        correlation_id: params.correlationId || pending.correlation_id,
        metadata: this.mergeMetadata(pending.metadata, {
          ...params.metadata,
          on_site_grant_method: params.method,
        }),
      });
      return updated || pending;
    }

    const expiresAt = new Date(Date.now() + ON_SITE_GRANT_TO_OPEN_TTL_SEC * 1000);
    return this.model.create({
      facility_id: params.facilityId,
      unit_id: params.unitId,
      device_id: params.deviceId,
      device_type: params.deviceType,
      gateway_id: params.gatewayId,
      kind: 'access',
      origin: 'on_site',
      method: params.method,
      outcome: 'granted',
      state: 'pending',
      actor_type: params.actor?.type || (params.actor?.id ? 'user' : 'device'),
      actor_id: params.actor?.id,
      actor_name: params.actor?.name,
      actor_role: params.actor?.role,
      started_at: params.occurredAt || new Date(),
      expires_at: expiresAt,
      correlation_id: params.correlationId,
      metadata: params.metadata,
    });
  }

  /** Denials never coalesce — always a terminal session. */
  async onDenialAccessEvent(params: DenialEventParams): Promise<AccessSession> {
    return this.model.create({
      facility_id: params.facilityId,
      unit_id: params.unitId,
      device_id: params.deviceId,
      device_type: params.deviceType,
      gateway_id: params.gatewayId,
      kind: 'access',
      origin: 'on_site',
      method: params.method,
      outcome: 'denied',
      state: 'denied',
      actor_type: params.actor?.type || (params.actor?.id ? 'user' : 'device'),
      actor_id: params.actor?.id,
      actor_name: params.actor?.name,
      actor_role: params.actor?.role,
      denial_reason: params.denialReason,
      reason_message: params.reasonMessage,
      started_at: params.occurredAt || new Date(),
      settled_at: params.occurredAt || new Date(),
      correlation_id: params.correlationId,
      metadata: params.metadata,
    });
  }

  /**
   * Physical unlock: open matching pending (prefer remote_command_id), else create local open.
   */
  async onDeviceUnlocked(params: UnlockStateParams): Promise<AccessSession> {
    let pending: AccessSession | null = null;
    if (params.remoteCommandId) {
      pending = await this.model.findPendingByRemoteCommandId(params.remoteCommandId);
    }
    if (!pending) {
      pending = await this.model.findPendingByDevice(params.deviceId);
    }

    const openedAt = params.occurredAt || new Date();
    if (pending) {
      const updated = await this.model.update(pending.id, {
        state: 'open',
        outcome: 'granted',
        opened_at: openedAt,
        expires_at: null,
        unit_id: params.unitId || pending.unit_id,
        gateway_id: params.gatewayId || pending.gateway_id,
        actor_type: params.actor?.type || pending.actor_type,
        actor_id: params.actor?.id || pending.actor_id,
        actor_name: params.actor?.name || pending.actor_name,
        actor_role: params.actor?.role || pending.actor_role,
        method: params.method || pending.method,
        metadata: this.mergeMetadata(pending.metadata, params.metadata),
      });
      return updated || pending;
    }

    return this.model.create({
      facility_id: params.facilityId,
      unit_id: params.unitId,
      device_id: params.deviceId,
      device_type: params.deviceType,
      gateway_id: params.gatewayId,
      kind: 'access',
      origin: 'local',
      method: params.method || 'local_device',
      outcome: 'granted',
      state: 'open',
      actor_type: params.actor?.type || 'gateway',
      actor_id: params.actor?.id,
      actor_name: params.actor?.name || 'Gateway',
      actor_role: params.actor?.role,
      started_at: openedAt,
      opened_at: openedAt,
      metadata: params.metadata,
    });
  }

  /**
   * Physical lock: close newest open unlock session.
   * Never creates a standalone lock_only row — locks always belong on an unlock timeline.
   * If nothing is open, attach to the latest unlock session on the device; if none exists,
   * create a local access session closed at the lock time (opened_at = closed_at).
   */
  async onDeviceLocked(params: LockStateParams): Promise<AccessSession> {
    const closedAt = params.occurredAt || new Date();
    const open = await this.model.findOpenByDevice(params.deviceId);

    if (open) {
      const openedAt = open.opened_at || open.started_at;
      const openDurationSec = Math.max(0, Math.round((closedAt.getTime() - openedAt.getTime()) / 1000));
      const updated = await this.model.update(open.id, {
        state: 'closed',
        closed_at: closedAt,
        settled_at: closedAt,
        open_duration_sec: openDurationSec,
        metadata: this.mergeMetadata(open.metadata, params.metadata),
      });
      return updated || open;
    }

    const recent = await this.model.findLatestUnlockSessionByDevice(params.deviceId);
    if (recent) {
      if (recent.state === 'pending') {
        // Lock observed while still waiting for open — settle as closed without inventing open.
        const updated = await this.model.update(recent.id, {
          state: 'closed',
          outcome: recent.outcome || 'granted',
          closed_at: closedAt,
          settled_at: closedAt,
          expires_at: null,
          metadata: this.mergeMetadata(recent.metadata, {
            ...params.metadata,
            locked_without_open: true,
          }),
        });
        return updated || recent;
      }
      if (recent.state === 'closed') {
        // Already closed: still attribute the lock activity to this unlock session.
        if (!recent.closed_at || closedAt.getTime() > new Date(recent.closed_at).getTime()) {
          const openedAt = recent.opened_at || recent.started_at;
          const openDurationSec = recent.opened_at
            ? Math.max(0, Math.round((closedAt.getTime() - new Date(openedAt).getTime()) / 1000))
            : recent.open_duration_sec;
          const updated = await this.model.update(recent.id, {
            closed_at: closedAt,
            settled_at: closedAt,
            open_duration_sec: openDurationSec,
            metadata: this.mergeMetadata(recent.metadata, params.metadata),
          });
          return updated || recent;
        }
        return recent;
      }
      // timed_out / failed — link activity only
      return recent;
    }

    // No prior unlock session: synthesize a local access that opened and locked together.
    return this.model.create({
      facility_id: params.facilityId,
      unit_id: params.unitId,
      device_id: params.deviceId,
      device_type: params.deviceType,
      gateway_id: params.gatewayId,
      kind: 'access',
      origin: 'local',
      method: 'local_device',
      outcome: 'granted',
      state: 'closed',
      actor_type: 'gateway',
      actor_name: 'Gateway',
      started_at: closedAt,
      opened_at: closedAt,
      closed_at: closedAt,
      settled_at: closedAt,
      open_duration_sec: 0,
      metadata: {
        ...params.metadata,
        synthesized_from_lock: true,
      },
    });
  }

  /** Fail or time out a pending session (remote command failure / sweeper). */
  async failOrTimeout(params: FailSessionParams): Promise<AccessSession | null> {
    let session: AccessSession | null = null;
    if (params.sessionId) {
      session = await this.model.findById(params.sessionId);
    } else if (params.remoteCommandId) {
      session = await this.model.findPendingByRemoteCommandId(params.remoteCommandId);
    } else if (params.deviceId) {
      session = await this.model.findPendingByDevice(params.deviceId);
    }
    if (!session || session.state !== 'pending') {
      return session;
    }

    const now = new Date();
    return this.model.update(session.id, {
      state: params.state,
      outcome: 'failed',
      denial_reason: params.denialReason || (params.state === 'timed_out' ? 'timeout' : session.denial_reason),
      reason_message: params.reasonMessage || session.reason_message,
      settled_at: now,
      expires_at: null,
      metadata: this.mergeMetadata(session.metadata, params.metadata),
    });
  }

  async expirePendingSessions(now: Date = new Date()): Promise<AccessSession[]> {
    const expired = await this.model.findExpiredPending(now);
    const results: AccessSession[] = [];
    for (const session of expired) {
      try {
        const updated = await this.failOrTimeout({
          sessionId: session.id,
          state: 'timed_out',
          denialReason: 'timeout',
          reasonMessage: 'Timed out waiting for device confirmation',
        });
        if (updated) results.push(updated);
      } catch (err) {
        logger.error('AccessSessionCorrelator: failed to expire session', {
          sessionId: session.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  private mergeMetadata(
    existing: Record<string, unknown> | null,
    incoming?: Record<string, unknown>,
  ): Record<string, unknown> | null {
    if (!incoming || Object.keys(incoming).length === 0) return existing;
    return { ...(existing || {}), ...incoming };
  }
}
