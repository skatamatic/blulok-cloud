/**
 * Access session trace — snapshot + in-process event ring for correlator debugging.
 * Process-local: Cloud Run instances do not share the ring.
 */

import { randomUUID } from 'crypto';
import os from 'os';
import { AccessSessionModel, AccessSessionWithContext } from '@/models/access-session.model';
import { ActivityLogModel, ActivityLogWithContext } from '@/models/activity-log.model';
import { DeviceModel } from '@/models/device.model';
import { GatewayModel } from '@/models/gateway.model';
import { ACCESS_HISTORY_ACTIVITY_TYPES } from '@/constants/access-history.constants';
import {
  ACCESS_SESSION_TRACE_RING_SIZE,
  ACCESS_SESSION_TRACE_RULES,
  ACCESS_SESSION_TRACE_SNAPSHOT_LIMIT,
  ACCESS_SESSION_TRACE_SUBSCRIPTION,
} from '@/constants/access-session-trace.constants';
import { ActivityEventsService, ActivityEvent } from '@/services/events/activity-events.service';
import { logger } from '@/utils/logger';
import { SubscriptionRegistry } from '@/services/subscriptions/subscription-registry';
import type { AccessSessionTraceSubscriptionManager } from '@/services/subscriptions/access-session-trace-subscription-manager';
import {
  activityKind,
  findSessionsSharingDevice,
  inferCorrelatorDecision,
  jsonSafe,
  rowMatchesTraceFilters,
  summarizeActivity,
  traceEventMatchesFilters,
} from '@/utils/access-session-trace.utils';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceFilters,
  AccessSessionTraceLookupDevice,
  AccessSessionTraceLookupUnit,
  AccessSessionTraceLookupUser,
  AccessSessionTracePendingAttribution,
  AccessSessionTraceSnapshot,
  CorrelatorDecisionInput,
} from '@/services/access/access-session-trace.types';

export class AccessSessionTraceService {
  private static instance: AccessSessionTraceService;
  private readonly sessionModel = new AccessSessionModel();
  private readonly activityModel = new ActivityLogModel();
  private readonly deviceModel = new DeviceModel();
  private readonly gatewayModel = new GatewayModel();
  private readonly ring: AccessSessionTraceEvent[] = [];
  private subscriptionRegistry: SubscriptionRegistry | null = null;
  private activityUnsub: (() => void) | null = null;

  private constructor() {
    this.bindActivityListener();
  }

  public static getInstance(): AccessSessionTraceService {
    if (!AccessSessionTraceService.instance) {
      AccessSessionTraceService.instance = new AccessSessionTraceService();
    }
    return AccessSessionTraceService.instance;
  }

  public static resetForTests(): void {
    if (AccessSessionTraceService.instance) {
      AccessSessionTraceService.instance.activityUnsub?.();
      AccessSessionTraceService.instance.activityUnsub = null;
      AccessSessionTraceService.instance.ring.length = 0;
      AccessSessionTraceService.instance.subscriptionRegistry = null;
    }
    AccessSessionTraceService.instance = undefined as unknown as AccessSessionTraceService;
  }

  setSubscriptionRegistry(registry: SubscriptionRegistry): void {
    this.subscriptionRegistry = registry;
  }

  recordCorrelatorDecision(input: CorrelatorDecisionInput): AccessSessionTraceEvent {
    const session = input.session;
    const event: AccessSessionTraceEvent = {
      id: randomUUID(),
      kind: 'correlator_decision',
      hook: input.hook,
      decision: inferCorrelatorDecision(input.hook, session),
      at: new Date().toISOString(),
      facility_id: session?.facility_id || (input.params?.facilityId as string | undefined),
      gateway_id: session?.gateway_id || (input.params?.gatewayId as string | undefined),
      device_id: session?.device_id || (input.params?.deviceId as string | undefined),
      unit_id: session?.unit_id || (input.params?.unitId as string | undefined),
      user_id: session?.actor_id
        || ((input.params?.actor as { id?: string } | undefined)?.id)
        || ((input.params?.initiator as { id?: string } | undefined)?.id),
      session_id: session?.id,
      payload: jsonSafe({
        hook: input.hook,
        decision: inferCorrelatorDecision(input.hook, session),
        params: input.params || null,
        session,
        extra: input.extra || null,
      }),
    };
    this.pushAndBroadcast(event);
    return event;
  }

  async snapshot(filters: AccessSessionTraceFilters): Promise<AccessSessionTraceSnapshot> {
    const gateway = await this.gatewayModel.findById(filters.gateway_id || '');
    const facilityId = filters.facility_id;
    const limit = ACCESS_SESSION_TRACE_SNAPSHOT_LIMIT;

    const [blulokDevices, accessControlDevices, liveSessions, recentSessions, rawEvents] = await Promise.all([
      this.deviceModel.findBluLokDevices({
        facility_id: facilityId,
        gateway_id: filters.gateway_id,
        skipPrimaryTenantEnrichment: true,
        limit: 500,
      }),
      this.deviceModel.findAccessControlDevices({
        facility_id: facilityId,
        gateway_id: filters.gateway_id,
        limit: 500,
      }),
      this.sessionModel.findWithContext({
        facility_id: facilityId,
        device_id: filters.device_id,
        unit_id: filters.unit_id,
        actor_id: filters.user_id,
        states: ['pending', 'open'],
        limit,
        max_limit: limit,
      }),
      this.sessionModel.findWithContext({
        facility_id: facilityId,
        device_id: filters.device_id,
        unit_id: filters.unit_id,
        actor_id: filters.user_id,
        limit,
        max_limit: limit,
      }),
      this.activityModel.findWithContext({
        facility_id: facilityId,
        device_id: filters.device_id,
        unit_id: filters.unit_id,
        actor_id: filters.user_id,
        activity_types: ACCESS_HISTORY_ACTIVITY_TYPES,
        limit,
        max_limit: limit,
      }),
    ]);

    const lockStates: AccessSessionTraceLookupDevice[] = [
      ...blulokDevices.map((d) => ({
        id: d.id,
        device_type: 'blulok' as const,
        serial: d.device_serial,
        name: null,
        unit_id: d.unit_id,
        unit_number: d.unit_number ?? null,
        lock_status: d.lock_status,
        device_status: d.device_status,
        gateway_id: d.gateway_id,
      })),
      ...accessControlDevices.map((d) => ({
        id: d.id,
        device_type: 'access_control' as const,
        serial: d.device_serial,
        name: d.name,
        unit_id: null,
        unit_number: null,
        lock_status: d.is_locked ? 'locked' : 'unlocked',
        device_status: d.status,
        gateway_id: d.gateway_id,
      })),
    ];

    const gatewayDeviceIds = new Set(lockStates.map((d) => d.id));
    const scopedLive = liveSessions.filter((s) => rowMatchesTraceFilters(s, filters, gatewayDeviceIds));
    const scopedRecent = recentSessions.filter((s) => rowMatchesTraceFilters(s, filters, gatewayDeviceIds));
    const scopedEvents = rawEvents.filter((e) => rowMatchesTraceFilters(e, filters, gatewayDeviceIds));

    const pendingMemory = await this.listMemoryAttributions(filters, gatewayDeviceIds);
    const pendingDurable: AccessSessionTracePendingAttribution[] = scopedLive
      .filter((s) => s.state === 'pending' && s.origin === 'cloud_remote' && s.remote_command_id)
      .map((s) => ({
        source: 'durable_session' as const,
        device_id: s.device_id,
        command_id: s.remote_command_id as string,
        requested_status: 'unlocked' as const,
        facility_id: s.facility_id || facilityId,
        gateway_id: s.gateway_id,
        unit_id: s.unit_id,
        session_id: s.id,
        initiator: s.actor_id
          ? {
              userId: s.actor_id,
              userName: s.actor_name || '',
              role: s.actor_role || '',
            }
          : undefined,
      }));

    const correlatorDecisions = this.ring
      .filter((event) => event.kind === 'correlator_decision')
      .filter((event) => traceEventMatchesFilters(event, filters))
      .slice(-limit);

    const lookups = this.buildLookups(lockStates, scopedRecent, scopedEvents, pendingMemory, pendingDurable);

    return jsonSafe({
      captured_at: new Date().toISOString(),
      process: {
        pid: process.pid,
        hostname: os.hostname() || null,
        note: 'Correlator ring and in-memory pending commands are local to this Cloud Run instance.',
      },
      gateway: {
        id: gateway?.id || filters.gateway_id || '',
        name: gateway?.name ?? null,
        facility_id: gateway?.facility_id ?? facilityId,
        status: gateway?.status ?? null,
      },
      filters,
      rules: ACCESS_SESSION_TRACE_RULES,
      live_sessions: scopedLive,
      recent_sessions: scopedRecent,
      raw_events: scopedEvents,
      pending_attributions: [...pendingMemory, ...pendingDurable],
      lock_states: lockStates.filter((d) => this.deviceMatchesFilters(d, filters)),
      correlator_decisions: correlatorDecisions,
      lookups,
      debug: {
        live_session_count: scopedLive.length,
        recent_session_count: scopedRecent.length,
        raw_event_count: scopedEvents.length,
        pending_memory_count: pendingMemory.length,
        pending_durable_count: pendingDurable.length,
        correlator_ring_count: correlatorDecisions.length,
        sessions_sharing_device: findSessionsSharingDevice(scopedRecent),
      },
    });
  }

  private deviceMatchesFilters(
    device: AccessSessionTraceLookupDevice,
    filters: AccessSessionTraceFilters,
  ): boolean {
    if (filters.device_id && device.id !== filters.device_id) return false;
    if (filters.unit_id && device.unit_id !== filters.unit_id) return false;
    return true;
  }

  private async listMemoryAttributions(
    filters: AccessSessionTraceFilters,
    gatewayDeviceIds: Set<string>,
  ): Promise<AccessSessionTracePendingAttribution[]> {
    try {
      const { LockCommandService } = await import('@/services/lock-command.service');
      return LockCommandService.getInstance().listPendingAttributions({
        facilityId: filters.facility_id,
        gatewayId: filters.gateway_id,
        deviceId: filters.device_id,
        unitId: filters.unit_id,
        userId: filters.user_id,
        gatewayDeviceIds,
      });
    } catch (error) {
      logger.warn('AccessSessionTraceService: memory attribution list failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private buildLookups(
    devices: AccessSessionTraceLookupDevice[],
    sessions: AccessSessionWithContext[],
    events: ActivityLogWithContext[],
    pendingMemory: AccessSessionTracePendingAttribution[],
    pendingDurable: AccessSessionTracePendingAttribution[],
  ): AccessSessionTraceSnapshot['lookups'] {
    const deviceMap: Record<string, AccessSessionTraceLookupDevice> = {};
    for (const device of devices) {
      deviceMap[device.id] = device;
    }

    const units: Record<string, AccessSessionTraceLookupUnit> = {};
    const users: Record<string, AccessSessionTraceLookupUser> = {};

    const addUnit = (id?: string | null, unitNumber?: string | null) => {
      if (!id) return;
      units[id] = { id, unit_number: unitNumber ?? units[id]?.unit_number ?? null };
    };
    const addUser = (id?: string | null, name?: string | null, email?: string | null) => {
      if (!id) return;
      users[id] = {
        id,
        name: name ?? users[id]?.name ?? null,
        email: email ?? users[id]?.email ?? null,
      };
    };

    for (const device of devices) addUnit(device.unit_id, device.unit_number);

    for (const session of sessions) {
      addUnit(session.unit_id, session.unit_number);
      addUser(session.actor_id, session.actor_name, session.actor_user_email);
      if (!deviceMap[session.device_id]) {
        deviceMap[session.device_id] = {
          id: session.device_id,
          device_type: session.device_type,
          serial: session.device_serial ?? null,
          name: session.device_name ?? null,
          unit_id: session.unit_id,
          unit_number: session.unit_number ?? null,
          gateway_id: session.gateway_id,
        };
      }
    }

    for (const event of events) {
      addUnit(event.unit_id, event.unit_number);
      addUser(
        event.actor_id,
        [event.actor_user_first_name, event.actor_user_last_name].filter(Boolean).join(' ') || event.actor_name,
        event.actor_user_email,
      );
    }

    for (const pending of [...pendingMemory, ...pendingDurable]) {
      addUnit(pending.unit_id);
      addUser(pending.initiator?.userId, pending.initiator?.userName);
    }

    return { devices: deviceMap, units, users };
  }

  private bindActivityListener(): void {
    this.activityUnsub = ActivityEventsService.getInstance().onActivityLogged(async (event) => {
      try {
        await this.ingestActivityEvent(event);
      } catch (error) {
        logger.warn('AccessSessionTraceService: activity ingest failed', {
          activityId: event.activityId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async ingestActivityEvent(event: ActivityEvent): Promise<void> {
    if (!ACCESS_HISTORY_ACTIVITY_TYPES.includes(event.activityType as (typeof ACCESS_HISTORY_ACTIVITY_TYPES)[number])) {
      return;
    }

    let enriched: ActivityLogWithContext | null = null;
    try {
      const rows = await this.activityModel.findWithContext({ id: event.activityId, limit: 1 });
      enriched = rows[0] || null;
    } catch {
      enriched = null;
    }

    const gatewayId =
      (enriched?.metadata?.gateway_id as string | undefined)
      || undefined;

    const traceEvent: AccessSessionTraceEvent = {
      id: randomUUID(),
      kind: activityKind(event.activityType),
      at: new Date().toISOString(),
      facility_id: event.facilityId,
      gateway_id: gatewayId,
      device_id: event.deviceId,
      unit_id: event.unitId,
      user_id: event.actorId,
      activity_id: event.activityId,
      session_id: enriched?.access_session_id || undefined,
      payload: jsonSafe({
        activity_event: event,
        activity: enriched ? summarizeActivity(enriched) : null,
      }),
    };
    this.pushAndBroadcast(traceEvent);
  }

  private pushAndBroadcast(event: AccessSessionTraceEvent): void {
    this.ring.push(event);
    if (this.ring.length > ACCESS_SESSION_TRACE_RING_SIZE) {
      this.ring.splice(0, this.ring.length - ACCESS_SESSION_TRACE_RING_SIZE);
    }
    this.broadcast(event);
  }

  private broadcast(event: AccessSessionTraceEvent): void {
    const manager = this.subscriptionRegistry?.getManager(
      ACCESS_SESSION_TRACE_SUBSCRIPTION,
    ) as AccessSessionTraceSubscriptionManager | undefined;
    manager?.broadcastUpdate(event);
  }
}
