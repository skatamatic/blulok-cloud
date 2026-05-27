import {
  GATEWAY_TELEMETRY_SYSTEM_HEADERS,
  type GatewayTelemetrySystemEventType,
} from '@/constants/gateway-telemetry-system-log.constants';
import type { GatewayTelemetryLogPayload } from '@/utils/gateway-telemetry-log.parser';

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
