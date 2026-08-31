/** `gateway_telemetry_logs.source` for BluLok cloud–originated operational lines. */
export const GATEWAY_TELEMETRY_CLOUD_SYSTEM_SOURCE = 'cloud_system';

/**
 * Hex-style headers aligned with gateway log lines (Header/Payload tail).
 * Cloud system events use the CLD* prefix.
 */
export const GATEWAY_TELEMETRY_SYSTEM_HEADERS = {
  GATEWAY_CONNECTED: 'CLD01',
  GATEWAY_DISCONNECTED: 'CLD02',
  GATEWAY_STATUS_CHANGED: 'CLD03',
  DEVICE_INVENTORY_SYNC: 'CLD04',
} as const;

export type GatewayTelemetrySystemEventType =
  | 'gateway_connected'
  | 'gateway_disconnected'
  | 'gateway_status_changed'
  | 'device_inventory_sync_completed';

/** Hide inbound WS disconnect→connect pairs closer than this (routine Cloud Run recycle). */
export const GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS = 30_000;
