import type {
  AccessSessionTraceEvent,
  AccessSessionTraceLookupDevice,
  AccessSessionTraceRow,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';
import { formatTraceLookup } from '@/utils/access-session-trace-dump.utils';

export type TraceWorkspaceMode = 'sessions' | 'events' | 'json';

export type TraceWovenKind =
  | 'correlator_decision'
  | 'raw_access_event'
  | 'lock_unlock_event'
  | 'lock_state';

export interface TraceSessionCardRow extends AccessSessionTraceRow {
  isLive: boolean;
}

export interface TraceWovenItem {
  id: string;
  at: string;
  source: 'live' | 'history';
  kind: TraceWovenKind;
  title: string;
  detail: string;
  payload: unknown;
}

const LIVE_SESSION_STATES = new Set(['pending', 'open']);
const LOCK_UNLOCK_ACTIVITIES = new Set(['lock', 'unlock', 'locking', 'unlocking']);

function rowTime(row: AccessSessionTraceRow): string {
  const value = row.started_at || row.occurred_at || row.created_at;
  return typeof value === 'string' ? value : '';
}

function rowActivityType(row: AccessSessionTraceRow): string {
  return typeof row.activity_type === 'string' ? row.activity_type : '';
}

export function mergeTraceSessions(
  live: AccessSessionTraceRow[],
  recent: AccessSessionTraceRow[],
): TraceSessionCardRow[] {
  const seen = new Set<string>();
  const merged: TraceSessionCardRow[] = [];
  for (const row of live) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push({ ...row, isLive: true });
  }
  for (const row of recent) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push({ ...row, isLive: LIVE_SESSION_STATES.has(String(row.state || '')) });
  }
  return merged.sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
    return rowTime(b).localeCompare(rowTime(a));
  });
}

function formatLockVerb(status?: string | null): string {
  if (!status) return 'unknown';
  return status.replace(/_/g, ' ');
}

export function summarizeLockStates(devices: AccessSessionTraceLookupDevice[]): string {
  return lockStatusStrip(devices).value;
}

/** Gateway-wide lock is meaningless — only units/devices lock. */
export function lockStatusStrip(devices: AccessSessionTraceLookupDevice[]): { label: string; value: string } {
  if (devices.length === 0) {
    return { label: 'Device locks', value: '—' };
  }
  if (devices.length === 1) {
    const device = devices[0];
    const label = device.unit_number
      ? `Unit ${device.unit_number}`
      : device.name || device.serial || 'Device';
    return { label, value: formatLockVerb(device.lock_status) };
  }
  const locked = devices.filter((device) => device.lock_status === 'locked').length;
  const unlocked = devices.filter(
    (device) =>
      device.lock_status === 'unlocked' ||
      device.lock_status === 'unlocking' ||
      device.lock_status === 'locking',
  ).length;
  const parts = [`${locked} locked`];
  if (unlocked) parts.push(`${unlocked} unlocked`);
  const rest = devices.length - locked - unlocked;
  if (rest > 0) parts.push(`${rest} other`);
  return { label: 'Device locks', value: parts.join(' · ') };
}

export function countLiveDeviceOverlaps(liveSessions: AccessSessionTraceRow[]): number {
  const byDevice = new Map<string, number>();
  for (const row of liveSessions) {
    if (!row.device_id || !LIVE_SESSION_STATES.has(String(row.state || ''))) continue;
    byDevice.set(row.device_id, (byDevice.get(row.device_id) || 0) + 1);
  }
  return [...byDevice.values()].filter((count) => count > 1).length;
}

function eventTitle(event: AccessSessionTraceEvent): string {
  if (event.decision) return event.decision.replace(/_/g, ' ');
  if (event.hook) return event.hook.replace(/_/g, ' ');
  return event.kind.replace(/_/g, ' ');
}

function eventDetail(
  event: AccessSessionTraceEvent,
  lookups: AccessSessionTraceSnapshot['lookups'] | undefined,
): string {
  const parts = [
    formatTraceLookup(lookups, 'device', event.device_id),
    formatTraceLookup(lookups, 'user', event.user_id),
  ];
  if (event.session_id) parts.push(`session ${event.session_id.slice(0, 8)}`);
  return parts.filter((part) => part && part !== '—').join(' · ');
}

function rawEventToWoven(
  row: AccessSessionTraceRow,
  lookups: AccessSessionTraceSnapshot['lookups'] | undefined,
): TraceWovenItem {
  const activity = rowActivityType(row);
  const kind: TraceWovenKind = LOCK_UNLOCK_ACTIVITIES.has(activity)
    ? 'lock_unlock_event'
    : 'raw_access_event';
  const title =
    (typeof row.title === 'string' && row.title) || activity.replace(/_/g, ' ') || 'Activity';
  const unit = row.unit_number
    ? `Unit ${row.unit_number}`
    : formatTraceLookup(lookups, 'device', row.device_id);
  const actor = row.actor_name || formatTraceLookup(lookups, 'user', row.actor_id);
  return {
    id: `raw:${row.id}`,
    at: rowTime(row),
    source: 'history',
    kind,
    title,
    detail: [unit, actor].filter((part) => part && part !== '—').join(' · '),
    payload: row,
  };
}

function lockStateItems(
  devices: AccessSessionTraceLookupDevice[],
  capturedAt: string,
): TraceWovenItem[] {
  if (devices.length === 0) return [];
  if (devices.length > 8) {
    return [
      {
        id: 'lock-state:summary',
        at: capturedAt,
        source: 'live',
        kind: 'lock_state',
        title: 'Device locks',
        detail: summarizeLockStates(devices),
        payload: { captured_at: capturedAt, devices },
      },
    ];
  }
  return devices.map((device) => ({
    id: `lock-state:${device.id}`,
    at: capturedAt,
    source: 'live' as const,
    kind: 'lock_state' as const,
    title: device.unit_number ? `Unit ${device.unit_number}` : device.name || device.serial || 'Device',
    detail: `${device.lock_status || 'unknown'}${device.device_status ? ` · ${device.device_status}` : ''}`,
    payload: device,
  }));
}

export function buildWovenTraceItems(input: {
  liveEvents: AccessSessionTraceEvent[];
  correlatorDecisions: AccessSessionTraceEvent[];
  rawEvents: AccessSessionTraceRow[];
  lockStates: AccessSessionTraceLookupDevice[];
  capturedAt: string;
  lookups?: AccessSessionTraceSnapshot['lookups'];
}): TraceWovenItem[] {
  const seen = new Set<string>();
  const items: TraceWovenItem[] = [];

  const pushEvent = (event: AccessSessionTraceEvent, source: 'live' | 'history') => {
    if (!event.id || seen.has(event.id)) return;
    seen.add(event.id);
    if (event.activity_id) seen.add(`raw:${event.activity_id}`);
    items.push({
      id: event.id,
      at: event.at,
      source,
      kind: event.kind === 'session_upsert' ? 'correlator_decision' : event.kind,
      title: eventTitle(event),
      detail: eventDetail(event, input.lookups),
      payload: event,
    });
  };

  for (const event of input.liveEvents) pushEvent(event, 'live');
  for (const event of input.correlatorDecisions) pushEvent(event, 'history');

  for (const row of input.rawEvents) {
    const wovenId = `raw:${row.id}`;
    if (!row.id || seen.has(wovenId) || seen.has(row.id)) continue;
    seen.add(wovenId);
    items.push(rawEventToWoven(row, input.lookups));
  }

  items.push(...lockStateItems(input.lockStates, input.capturedAt));

  return items.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
}

function rawRowToEvent(row: AccessSessionTraceRow): AccessSessionTraceEvent {
  const activity = rowActivityType(row);
  return {
    id: row.id,
    kind: LOCK_UNLOCK_ACTIVITIES.has(activity) ? 'lock_unlock_event' : 'raw_access_event',
    at: rowTime(row),
    device_id: typeof row.device_id === 'string' ? row.device_id : undefined,
    unit_id: typeof row.unit_id === 'string' ? row.unit_id : undefined,
    user_id: typeof row.actor_id === 'string' ? row.actor_id : undefined,
    session_id: typeof row.access_session_id === 'string' ? row.access_session_id : undefined,
    activity_id: row.id,
    payload: row as unknown as Record<string, unknown>,
  };
}

/** Oldest-first event log for NDJSON. Live arrivals with later `at` append at the end. */
export function buildTraceEventLog(input: {
  liveEvents: AccessSessionTraceEvent[];
  correlatorDecisions: AccessSessionTraceEvent[];
  rawEvents: AccessSessionTraceRow[];
}): AccessSessionTraceEvent[] {
  const seen = new Set<string>();
  const events: AccessSessionTraceEvent[] = [];

  const push = (event: AccessSessionTraceEvent) => {
    if (!event.id || seen.has(event.id)) return;
    seen.add(event.id);
    if (event.activity_id) seen.add(event.activity_id);
    events.push(event);
  };

  for (const event of input.correlatorDecisions) push(event);
  for (const row of input.rawEvents) {
    if (!row.id || seen.has(row.id) || seen.has(`raw:${row.id}`)) continue;
    push(rawRowToEvent(row));
  }
  for (const event of input.liveEvents) push(event);

  return events.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
}

export function eventsToNdjson(events: AccessSessionTraceEvent[]): string {
  return events.map((event) => JSON.stringify(event, null, 2)).join('\n\n');
}
