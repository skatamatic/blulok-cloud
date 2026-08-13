import type { AccessSession } from '@/models/access-session.model';
import type { ActivityLogWithContext } from '@/models/activity-log.model';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceFilters,
  CorrelatorHook,
} from '@/services/access/access-session-trace.types';

export function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, inner) => {
      if (inner instanceof Date) return inner.toISOString();
      return inner;
    }),
  ) as T;
}

export function inferCorrelatorDecision(
  hook: CorrelatorHook,
  session: AccessSession | null,
): string {
  if (!session) return `${hook}:no_session`;
  const meta = (session.metadata || {}) as Record<string, unknown>;

  if (hook === 'grant') {
    if (meta.coalesced_pending_grant) return 'coalesce_repeat_on_site_pending';
    if (meta.absorbed_local_open) return 'absorb_recent_local_open';
    if (meta.on_site_grant_method) return 'attach_pending_cloud_remote';
    if (session.state === 'open' && session.attempt_count > 1) {
      return 'coalesce_repeat_grant_into_open';
    }
    if (session.state === 'pending' && session.origin === 'on_site') {
      return 'create_on_site_pending';
    }
    return `grant:${session.origin}:${session.state}`;
  }

  if (hook === 'unlock') {
    if (meta.unlocked_after_grant_race) return 'open_pending_after_grant_race';
    if (session.origin === 'local' && session.state === 'open') return 'create_local_open';
    if (session.state === 'open') return 'open_pending';
    return `unlock:${session.origin}:${session.state}`;
  }

  if (hook === 'lock') {
    if (meta.synthesized_from_lock) return 'synthesize_closed_from_lock';
    if (meta.locked_without_open) return 'close_pending_without_open';
    if (session.state === 'closed') return 'close_open_session';
    return `lock:${session.origin}:${session.state}`;
  }

  if (hook === 'denial') return 'create_denied';
  if (hook === 'cloud_remote_issued') return 'create_or_reuse_cloud_remote_pending';
  if (hook === 'confirm_locked') return `confirm_locked:${session.state}`;
  if (hook === 'fail_or_timeout' || hook === 'expire') {
    return `${hook}:${session.state}:${session.denial_reason || 'none'}`;
  }
  return `${hook}:${session.origin}:${session.state}`;
}

export function traceEventMatchesFilters(
  event: AccessSessionTraceEvent,
  filters: AccessSessionTraceFilters,
): boolean {
  if (filters.facility_id && event.facility_id && event.facility_id !== filters.facility_id) {
    return false;
  }
  if (filters.gateway_id && event.gateway_id && event.gateway_id !== filters.gateway_id) {
    return false;
  }
  if (filters.device_id && event.device_id && event.device_id !== filters.device_id) {
    return false;
  }
  if (filters.unit_id && event.unit_id && event.unit_id !== filters.unit_id) {
    return false;
  }
  if (filters.user_id && event.user_id && event.user_id !== filters.user_id) {
    return false;
  }
  return true;
}

export function rowMatchesTraceFilters(
  row: {
    facility_id?: string | null;
    gateway_id?: string | null;
    device_id?: string | null;
    unit_id?: string | null;
    actor_id?: string | null;
  },
  filters: AccessSessionTraceFilters,
  gatewayDeviceIds?: Set<string>,
): boolean {
  if (filters.facility_id && row.facility_id && row.facility_id !== filters.facility_id) {
    return false;
  }
  if (filters.device_id && row.device_id !== filters.device_id) return false;
  if (filters.unit_id && row.unit_id !== filters.unit_id) return false;
  if (filters.user_id && row.actor_id !== filters.user_id) return false;
  if (filters.gateway_id) {
    if (row.gateway_id && row.gateway_id !== filters.gateway_id) return false;
    if (!row.gateway_id && row.device_id && gatewayDeviceIds && !gatewayDeviceIds.has(row.device_id)) {
      return false;
    }
  }
  return true;
}

export function findSessionsSharingDevice(sessions: AccessSession[]): Array<{
  device_id: string;
  session_ids: string[];
  states: string[];
  started_at: Array<string | null>;
}> {
  const byDevice = new Map<string, AccessSession[]>();
  for (const session of sessions) {
    const list = byDevice.get(session.device_id) || [];
    list.push(session);
    byDevice.set(session.device_id, list);
  }
  const clustered: Array<{
    device_id: string;
    session_ids: string[];
    states: string[];
    started_at: Array<string | null>;
  }> = [];
  for (const [deviceId, list] of byDevice) {
    if (list.length < 2) continue;
    clustered.push({
      device_id: deviceId,
      session_ids: list.map((s) => s.id),
      states: list.map((s) => s.state),
      started_at: list.map((s) =>
        s.started_at instanceof Date ? s.started_at.toISOString() : s.started_at ? String(s.started_at) : null,
      ),
    });
  }
  return clustered;
}

export function activityKind(activityType: string): AccessSessionTraceEvent['kind'] {
  if (activityType === 'lock' || activityType === 'unlock') return 'lock_unlock_event';
  return 'raw_access_event';
}

export function summarizeActivity(log: ActivityLogWithContext): Record<string, unknown> {
  return {
    id: log.id,
    activity_type: log.activity_type,
    title: log.title,
    description: log.description,
    result: log.result,
    result_message: log.result_message,
    actor_type: log.actor_type,
    actor_id: log.actor_id,
    actor_name: log.actor_name,
    actor_user_email: log.actor_user_email,
    facility_id: log.facility_id,
    unit_id: log.unit_id,
    unit_number: log.unit_number,
    device_id: log.device_id,
    device_serial: log.device_serial,
    access_session_id: log.access_session_id,
    occurred_at: log.occurred_at,
    metadata: log.metadata,
  };
}
