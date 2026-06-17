import { AccessLog } from '@/types/access-history.types';
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
};

const TERMINAL_ACTIVITY_TYPES = new Set(['access_attempt', 'lock', 'unlock']);

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
    denial_reason:
      (typeof raw.denial_reason === 'string' && raw.denial_reason) ||
      (typeof metadata.denial_reason === 'string' ? metadata.denial_reason : undefined),
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
    const normalized = filters.method === 'automatic' ? 'local_device' : filters.method;
    const logMethod = log.method === 'automatic' ? 'local_device' : log.method;
    if (logMethod !== normalized) return false;
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
