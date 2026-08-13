import type {
  AccessSessionTraceEvent,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';

export function buildAccessSessionTraceDump(input: {
  snapshot: AccessSessionTraceSnapshot | null;
  liveEvents: AccessSessionTraceEvent[];
  lockStates: AccessSessionTraceSnapshot['lock_states'];
}): string {
  const { snapshot, liveEvents, lockStates } = input;
  const capturedAt = new Date().toISOString();
  const body = {
    captured_at_client: capturedAt,
    snapshot,
    live_events_since_snapshot: liveEvents,
    lock_states_live: lockStates,
  };
  return JSON.stringify(body, null, 2);
}

export function formatTraceLookup(
  lookups: AccessSessionTraceSnapshot['lookups'] | undefined,
  kind: 'device' | 'unit' | 'user',
  id?: string | null,
): string {
  if (!id) return '—';
  if (!lookups) return id;
  if (kind === 'device') {
    const device = lookups.devices[id];
    if (!device) return id;
    const label = device.unit_number
      ? `Unit ${device.unit_number}`
      : device.name || device.serial || id.slice(0, 8);
    return `${label} (${id.slice(0, 8)})`;
  }
  if (kind === 'unit') {
    const unit = lookups.units[id];
    return unit?.unit_number ? `Unit ${unit.unit_number}` : id;
  }
  const user = lookups.users[id];
  if (!user) return id;
  return user.email || user.name || id;
}

export function eventMatchesClientFilters(
  event: AccessSessionTraceEvent,
  filters: { user_id: string; unit_id: string; device_id?: string },
): boolean {
  if (filters.device_id && event.device_id && event.device_id !== filters.device_id) return false;
  if (filters.unit_id && event.unit_id && event.unit_id !== filters.unit_id) return false;
  if (filters.user_id && event.user_id && event.user_id !== filters.user_id) return false;
  return true;
}

export function lookupUsersToFilterUsers(
  users: AccessSessionTraceSnapshot['lookups']['users'] | undefined,
): Array<{ id: string; name?: string | null; email?: string | null }> {
  return Object.values(users || {}).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
  }));
}

export function traceRowMatchesUser(
  row: {
    actor_id?: string | null;
    user_id?: string | null;
    initiator?: { userId?: string };
  },
  userId: string,
): boolean {
  if (!userId) return true;
  return row.actor_id === userId || row.user_id === userId || row.initiator?.userId === userId;
}
