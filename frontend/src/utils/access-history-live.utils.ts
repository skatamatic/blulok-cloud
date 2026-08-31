import { AccessLog } from '@/types/access-history.types';
import { AccessSession, AccessSessionState } from '@/types/access-session.types';
import { accessHistoryMethodMatchesFilter } from '@/constants/accessHistory.constants';
import { queryDateFromMs, queryDateToMs } from '@/utils/datetime.utils';

export type ActivityWsEvent = {
  eventType?: string;
  payload?: Record<string, unknown>;
};

export type AccessHistoryLiveFilters = {
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  action?: string;
  method?: string;
  success?: boolean;
  denial_reason?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  /** Session-view filter (e.g. currently open). */
  state?: AccessSessionState;
};

const TERMINAL_ACTIVITY_TYPES = new Set(['access_attempt', 'lock', 'unlock']);

const KNOWN_DENIAL_REASONS = new Set<NonNullable<AccessLog['denial_reason']>>([
  'invalid_credential',
  'out_of_schedule',
  'system_error',
  'device_offline',
  'insufficient_permissions',
  'expired_access',
  'maintenance_mode',
  'denylist_blocked',
  'route_pass_expired',
  'route_pass_invalid_signature',
  'route_pass_wrong_lock',
  'unknown_error',
  'other',
  'timeout',
  'settlement_mismatch',
]);

function parseDenialReason(raw: string | undefined): AccessLog['denial_reason'] | undefined {
  if (!raw) return undefined;
  if (KNOWN_DENIAL_REASONS.has(raw as NonNullable<AccessLog['denial_reason']>)) {
    return raw as AccessLog['denial_reason'];
  }
  if (raw === 'internal_error') return 'system_error';
  return 'other';
}

function mapLegacyMethod(method: string | undefined, activityType?: string): string {
  if (method === 'automatic') return 'local_device';
  if (!method) {
    if (activityType === 'lock' || activityType === 'unlock') {
      return 'local_device';
    }
    return 'app';
  }
  return method;
}

function mapLegacyAction(
  action: string | undefined,
  activityType: string | undefined,
  success: boolean,
): string {
  if (action === 'access_denied') return 'unlock_attempt';
  if (action === 'keypad_attempt' && !success) return 'unlock_attempt';
  if (action) return action;
  if (activityType === 'lock') return 'lock';
  if (activityType === 'unlock') return 'unlock';
  return success ? 'access_granted' : 'unlock_attempt';
}

function normalizeAccessLogRow(raw: Record<string, unknown>): AccessLog | null {
  const id = raw.id;
  if (typeof id !== 'string' || !id) return null;

  const activityType = typeof raw.activityType === 'string' ? raw.activityType : undefined;
  if (activityType && !TERMINAL_ACTIVITY_TYPES.has(activityType)) {
    return null;
  }

  const occurredAt =
    (typeof raw.occurred_at === 'string' && raw.occurred_at) ||
    (typeof raw.occurredAt === 'string' && raw.occurredAt) ||
    new Date().toISOString();
  const createdAt =
    (typeof raw.created_at === 'string' && raw.created_at) ||
    (typeof raw.createdAt === 'string' && raw.createdAt) ||
    occurredAt;
  const updatedAt =
    (typeof raw.updated_at === 'string' && raw.updated_at) ||
    (typeof raw.updatedAt === 'string' && raw.updatedAt) ||
    occurredAt;

  const deviceId =
    (typeof raw.device_id === 'string' && raw.device_id) ||
    (typeof raw.deviceId === 'string' && raw.deviceId) ||
    (typeof raw.entityId === 'string' && raw.entityId) ||
    'unknown';

  const metadata =
    raw.metadata && typeof raw.metadata === 'object'
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const metadataAction = typeof metadata.action === 'string' ? metadata.action : undefined;

  const actor =
    raw.actor && typeof raw.actor === 'object'
      ? (raw.actor as Record<string, unknown>)
      : undefined;
  const result = typeof raw.result === 'string' ? raw.result : undefined;
  const status =
    typeof raw.status === 'string'
      ? (raw.status as AccessLog['status'])
      : result === 'success'
        ? 'success'
        : result === 'pending'
          ? 'pending'
          : result === 'failure'
            ? 'failed'
            : undefined;
  const success =
    typeof raw.success === 'boolean'
      ? raw.success
      : status === 'success' || (result === 'success' && status !== 'failed' && status !== 'pending');

  let action = typeof raw.action === 'string' ? raw.action : metadataAction;
  action = mapLegacyAction(action, activityType, success);

  let method = typeof raw.method === 'string' ? raw.method : undefined;
  if (!method && typeof metadata.method === 'string') {
    method = metadata.method;
  }
  method = mapLegacyMethod(method, activityType);

  const reason =
    (typeof raw.reason === 'string' && raw.reason) ||
    (typeof raw.resultMessage === 'string' && raw.resultMessage) ||
    undefined;

  return {
    id,
    device_id: deviceId,
    device_type:
      raw.device_type === 'access_control' || metadata.device_type === 'access_control'
        ? 'access_control'
        : 'blulok',
    facility_id:
      (typeof raw.facility_id === 'string' && raw.facility_id) ||
      (typeof raw.facilityId === 'string' ? raw.facilityId : undefined),
    unit_id:
      (typeof raw.unit_id === 'string' && raw.unit_id) ||
      (typeof raw.unitId === 'string' ? raw.unitId : undefined),
    user_id:
      (typeof raw.user_id === 'string' && raw.user_id) ||
      (typeof actor?.id === 'string' ? actor.id : undefined),
    action: action as AccessLog['action'],
    method: method as AccessLog['method'],
    success,
    status,
    denial_reason: parseDenialReason(
      (typeof raw.denial_reason === 'string' && raw.denial_reason) ||
        (typeof metadata.denial_reason === 'string' ? metadata.denial_reason : undefined),
    ),
    reason,
    metadata: metadata as AccessLog['metadata'],
    occurred_at: occurredAt,
    created_at: createdAt,
    updated_at: updatedAt,
    facility_name:
      (typeof raw.facility_name === 'string' && raw.facility_name) ||
      (typeof raw.facilityName === 'string' ? raw.facilityName : undefined),
    unit_number:
      (typeof raw.unit_number === 'string' && raw.unit_number) ||
      (typeof raw.unitNumber === 'string' ? raw.unitNumber : undefined),
    user_name:
      (typeof raw.user_name === 'string' && raw.user_name) ||
      (typeof raw.userName === 'string' ? raw.userName : undefined) ||
      (typeof actor?.name === 'string' ? actor.name : undefined),
    device_name:
      (typeof raw.device_name === 'string' && raw.device_name) ||
      (typeof raw.deviceName === 'string' ? raw.deviceName : undefined),
    device_serial:
      (typeof raw.device_serial === 'string' && raw.device_serial) ||
      (typeof raw.deviceSerial === 'string' ? raw.deviceSerial : undefined),
    actor_type:
      (typeof raw.actor_type === 'string' && raw.actor_type) ||
      (typeof actor?.type === 'string' ? actor.type : undefined),
  };
}

export function accessLogFromActivityWsData(data: unknown): AccessLog | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (record.accessLog && typeof record.accessLog === 'object') {
    return normalizeAccessLogRow(record.accessLog as Record<string, unknown>);
  }

  if (record.activity && typeof record.activity === 'object') {
    return normalizeAccessLogRow(record.activity as Record<string, unknown>);
  }

  return null;
}

export function matchesAccessHistoryLiveFilters(
  log: AccessLog,
  filters: AccessHistoryLiveFilters,
): boolean {
  if (filters.facility_id && log.facility_id !== filters.facility_id) return false;
  if (filters.unit_id && log.unit_id !== filters.unit_id) return false;
  if (filters.user_id && log.user_id !== filters.user_id) return false;
  if (filters.action) {
    const normalizedFilter = filters.action === 'access_denied' ? 'unlock_attempt' : filters.action;
    if (log.action !== normalizedFilter) return false;
  }
  if (filters.method) {
    if (!accessHistoryMethodMatchesFilter(log.method, filters.method)) return false;
  }
  if (filters.denial_reason && log.denial_reason !== filters.denial_reason) return false;
  if (filters.success !== undefined && log.success !== filters.success) return false;

  const occurredMs = new Date(log.occurred_at).getTime();
  if (filters.date_from) {
    const fromMs = queryDateFromMs(filters.date_from);
    if (fromMs !== null && occurredMs < fromMs) return false;
  }
  if (filters.date_to) {
    const toMs = queryDateToMs(filters.date_to);
    if (toMs !== null && occurredMs > toMs) return false;
  }

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      log.user_name,
      log.unit_number,
      log.facility_name,
      log.device_name,
      log.action,
      log.method,
      log.reason,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

export function prependUniqueAccessLog(
  existing: AccessLog[],
  incoming: AccessLog,
  maxRows: number,
): AccessLog[] {
  if (existing.some((row) => row.id === incoming.id)) {
    return existing;
  }
  return [incoming, ...existing].slice(0, maxRows);
}

const SESSION_STATES = new Set<AccessSessionState>([
  'pending',
  'open',
  'closed',
  'timed_out',
  'denied',
  'failed',
]);

function normalizeAccessSessionRow(raw: Record<string, unknown>): AccessSession | null {
  const id = typeof raw.id === 'string' ? raw.id : null;
  if (!id) return null;

  const stateRaw = typeof raw.state === 'string' ? raw.state : '';
  if (!SESSION_STATES.has(stateRaw as AccessSessionState)) return null;

  const deviceId =
    (typeof raw.device_id === 'string' && raw.device_id)
    || (typeof raw.deviceId === 'string' && raw.deviceId)
    || null;
  if (!deviceId) return null;

  const startedAt =
    (typeof raw.started_at === 'string' && raw.started_at)
    || (typeof raw.startedAt === 'string' && raw.startedAt)
    || new Date().toISOString();

  const optionalIso = (snake: string, camel: string): string | undefined => {
    const a = raw[snake];
    const b = raw[camel];
    if (typeof a === 'string' && a) return a;
    if (typeof b === 'string' && b) return b;
    return undefined;
  };

  return {
    id,
    kind: typeof raw.kind === 'string' ? raw.kind : 'access',
    origin: typeof raw.origin === 'string' ? raw.origin : 'system',
    method: typeof raw.method === 'string' ? raw.method : 'unknown',
    outcome: typeof raw.outcome === 'string' ? raw.outcome : null,
    state: stateRaw as AccessSessionState,
    device_id: deviceId,
    device_type: raw.device_type === 'access_control' ? 'access_control' : 'blulok',
    facility_id:
      (typeof raw.facility_id === 'string' && raw.facility_id)
      || (typeof raw.facilityId === 'string' ? raw.facilityId : undefined),
    unit_id:
      (typeof raw.unit_id === 'string' && raw.unit_id)
      || (typeof raw.unitId === 'string' ? raw.unitId : undefined),
    user_id:
      (typeof raw.user_id === 'string' && raw.user_id)
      || (typeof raw.actor_id === 'string' ? raw.actor_id : undefined),
    actor_type: typeof raw.actor_type === 'string' ? raw.actor_type : undefined,
    actor_role: typeof raw.actor_role === 'string' ? raw.actor_role : undefined,
    denial_reason: typeof raw.denial_reason === 'string' ? raw.denial_reason : undefined,
    reason:
      (typeof raw.reason === 'string' && raw.reason)
      || (typeof raw.reason_message === 'string' ? raw.reason_message : undefined),
    attempt_count: typeof raw.attempt_count === 'number' ? raw.attempt_count : 1,
    started_at: startedAt,
    opened_at: optionalIso('opened_at', 'openedAt'),
    closed_at: optionalIso('closed_at', 'closedAt'),
    expires_at: optionalIso('expires_at', 'expiresAt'),
    settled_at: optionalIso('settled_at', 'settledAt'),
    open_duration_sec:
      typeof raw.open_duration_sec === 'number'
        ? raw.open_duration_sec
        : undefined,
    remote_command_id:
      typeof raw.remote_command_id === 'string' ? raw.remote_command_id : undefined,
    correlation_id:
      typeof raw.correlation_id === 'string' ? raw.correlation_id : undefined,
    metadata:
      raw.metadata && typeof raw.metadata === 'object'
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
    facility_name:
      (typeof raw.facility_name === 'string' && raw.facility_name)
      || (typeof raw.facilityName === 'string' ? raw.facilityName : undefined),
    unit_number:
      (typeof raw.unit_number === 'string' && raw.unit_number)
      || (typeof raw.unitNumber === 'string' ? raw.unitNumber : undefined),
    user_name:
      (typeof raw.user_name === 'string' && raw.user_name)
      || (typeof raw.actor_name === 'string' ? raw.actor_name : undefined),
    user_email:
      (typeof raw.user_email === 'string' && raw.user_email)
      || (typeof raw.actor_user_email === 'string' ? raw.actor_user_email : undefined),
    device_name:
      (typeof raw.device_name === 'string' && raw.device_name)
      || (typeof raw.deviceName === 'string' ? raw.deviceName : undefined),
    device_serial:
      (typeof raw.device_serial === 'string' && raw.device_serial)
      || (typeof raw.deviceSerial === 'string' ? raw.deviceSerial : undefined),
  };
}

/** Parse `access_session_upsert` WS payload → AccessSession | null. */
export function accessSessionFromWsData(data: unknown): AccessSession | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;

  if (record.session && typeof record.session === 'object') {
    return normalizeAccessSessionRow(record.session as Record<string, unknown>);
  }

  return normalizeAccessSessionRow(record);
}

/**
 * Replace by id when present; otherwise prepend. Cap list length.
 */
export function upsertAccessSession(
  existing: AccessSession[],
  incoming: AccessSession,
  maxRows: number,
): AccessSession[] {
  const idx = existing.findIndex((row) => row.id === incoming.id);
  if (idx >= 0) {
    const next = existing.slice();
    next[idx] = incoming;
    return next;
  }
  return [incoming, ...existing].slice(0, maxRows);
}

export function matchesAccessSessionLiveFilters(
  session: AccessSession,
  filters: AccessHistoryLiveFilters,
): boolean {
  if (filters.facility_id && session.facility_id !== filters.facility_id) return false;
  if (filters.unit_id && session.unit_id !== filters.unit_id) return false;
  if (filters.user_id && session.user_id !== filters.user_id) return false;
  if (filters.state && session.state !== filters.state) return false;
  if (filters.method) {
    if (!accessHistoryMethodMatchesFilter(session.method, filters.method)) return false;
  }
  if (filters.denial_reason && session.denial_reason !== filters.denial_reason) return false;
  if (filters.success !== undefined) {
    const ok =
      session.outcome === 'granted'
      && (session.state === 'open' || session.state === 'closed' || session.state === 'pending');
    if (filters.success !== ok) return false;
  }

  const startedMs = new Date(session.started_at).getTime();
  if (filters.date_from) {
    const fromMs = queryDateFromMs(filters.date_from);
    if (fromMs !== null && startedMs < fromMs) return false;
  }
  if (filters.date_to) {
    const toMs = queryDateToMs(filters.date_to);
    if (toMs !== null && startedMs > toMs) return false;
  }

  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [
      session.user_name,
      session.unit_number,
      session.facility_name,
      session.device_name,
      session.method,
      session.state,
      session.reason,
      session.denial_reason,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }

  return true;
}

export function parseActivityWsEnvelope(data: unknown): ActivityWsEvent {
  if (!data || typeof data !== 'object') return {};
  const record = data as Record<string, unknown>;
  if (typeof record.eventType === 'string') {
    return {
      eventType: record.eventType,
      payload:
        record.payload && typeof record.payload === 'object'
          ? (record.payload as Record<string, unknown>)
          : undefined,
    };
  }
  return { payload: record };
}
