import {
  GATEWAY_TELEMETRY_SYSTEM_HEADERS,
  type GatewayTelemetrySystemEventType,
  GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS,
} from '@/constants/gateway-telemetry-system-log.constants';
import type { GatewayTelemetryLogPayload } from '@/utils/gateway-telemetry-log.parser';

export { GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS };

export interface BuildGatewayTelemetrySystemLogInput {
  event: GatewayTelemetrySystemEventType;
  message: string;
  facility_id: string;
  gateway_id: string;
  header?: string;
  reason?: string;
  user_id?: string;
  remote_address?: string;
  last_activity_at?: string | number;
  previous_status?: string;
  next_status?: string;
  inventory_summary?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

const HEADER_BY_EVENT: Record<GatewayTelemetrySystemEventType, string> = {
  gateway_connected: GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_CONNECTED,
  gateway_disconnected: GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_DISCONNECTED,
  gateway_status_changed: GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_STATUS_CHANGED,
  device_inventory_sync_completed: GATEWAY_TELEMETRY_SYSTEM_HEADERS.DEVICE_INVENTORY_SYNC,
};

const DISCONNECT_REASON_LABELS: Record<string, string> = {
  auth_ok: 'Authenticated successfully',
  close_event: 'WebSocket closed',
  socket_error: 'WebSocket error',
  heartbeat_timeout: 'Heartbeat timeout (no gateway activity)',
  socket_not_open: 'Socket no longer open',
  replaced: 'Superseded by a newer gateway connection',
};

export function formatGatewayDisconnectReason(reason?: string): string {
  if (!reason) return 'Disconnected';
  return DISCONNECT_REASON_LABELS[reason] ?? reason.replace(/_/g, ' ');
}

/** Build a telemetry payload matching gateway Header/message/data shape with cloud provenance. */
export function buildGatewayTelemetrySystemLogPayload(
  input: BuildGatewayTelemetrySystemLogInput,
): GatewayTelemetryLogPayload {
  const header = input.header ?? HEADER_BY_EVENT[input.event];
  const data: Record<string, unknown> = {
    cloud_system: true,
    event: input.event,
    facility_id: input.facility_id,
    gateway_id: input.gateway_id,
  };

  if (input.reason !== undefined) {
    data.reason = input.reason;
    if (input.event === 'gateway_disconnected') {
      data.reason_label = formatGatewayDisconnectReason(input.reason);
    }
  }
  if (input.user_id) data.user_id = input.user_id;
  if (input.remote_address) data.remote_address = input.remote_address;
  if (input.last_activity_at !== undefined) {
    data.last_activity_at =
      typeof input.last_activity_at === 'number'
        ? new Date(input.last_activity_at).toISOString()
        : input.last_activity_at;
  }
  if (input.previous_status !== undefined) data.previous_status = input.previous_status;
  if (input.next_status !== undefined) data.next_status = input.next_status;
  if (input.inventory_summary) data.inventory_summary = input.inventory_summary;
  if (input.extra) Object.assign(data, input.extra);

  return {
    header,
    message: input.message,
    cloud_system: true,
    data,
  };
}

type GatewayWsLifecycleLog = {
  id: string;
  logged_at: Date | string;
  created_at?: Date | string;
  source?: string;
  payload?: GatewayTelemetryLogPayload | Record<string, unknown> | null;
};

export function getGatewayWsLifecycleEvent(
  log: GatewayWsLifecycleLog,
): 'gateway_connected' | 'gateway_disconnected' | null {
  const payload = log.payload;
  if (!payload || typeof payload !== 'object') return null;

  const isCloud = log.source === 'cloud_system' || payload.cloud_system === true;
  if (!isCloud) return null;

  const data = payload.data;
  if (data && typeof data === 'object') {
    const event = (data as { event?: string }).event;
    if (event === 'gateway_connected' || event === 'gateway_disconnected') {
      return event;
    }
  }

  const header = payload.header != null ? String(payload.header) : '';
  if (header === GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_CONNECTED) {
    return 'gateway_connected';
  }
  if (header === GATEWAY_TELEMETRY_SYSTEM_HEADERS.GATEWAY_DISCONNECTED) {
    return 'gateway_disconnected';
  }

  return null;
}

function sortTelemetryLogsAscending<T extends GatewayWsLifecycleLog>(logs: T[]): T[] {
  return [...logs].sort((a, b) => {
    const ta = new Date(a.logged_at).getTime();
    const tb = new Date(b.logged_at).getTime();
    if (ta !== tb) return ta - tb;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ca - cb;
  });
}

/** IDs of routine disconnect→connect pairs within the threshold (both legs hidden in the UI). */
export function collectRoutineGatewayWsReconnectLogIds<T extends GatewayWsLifecycleLog>(
  logs: T[],
  thresholdMs: number = GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS,
): Set<string> {
  const hidden = new Set<string>();
  const sorted = sortTelemetryLogsAscending(logs);

  for (let i = 0; i < sorted.length; i += 1) {
    const disconnect = sorted[i];
    if (hidden.has(disconnect.id)) continue;
    if (getGatewayWsLifecycleEvent(disconnect) !== 'gateway_disconnected') continue;

    const disconnectAt = new Date(disconnect.logged_at).getTime();
    for (let j = i + 1; j < sorted.length; j += 1) {
      const candidate = sorted[j];
      if (getGatewayWsLifecycleEvent(candidate) !== 'gateway_connected') continue;

      const gapMs = new Date(candidate.logged_at).getTime() - disconnectAt;
      if (gapMs <= thresholdMs) {
        hidden.add(disconnect.id);
        hidden.add(candidate.id);
      }
      break;
    }
  }

  return hidden;
}

export function filterRoutineGatewayWsReconnectLogs<T extends GatewayWsLifecycleLog>(
  logs: T[],
  thresholdMs: number = GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS,
): T[] {
  if (logs.length === 0) return logs;
  const hidden = collectRoutineGatewayWsReconnectLogIds(logs, thresholdMs);
  if (hidden.size === 0) return logs;
  return logs.filter((log) => !hidden.has(log.id));
}
