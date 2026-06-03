import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';

/** Match backend GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS — hide routine Cloud Run recycle pairs. */
export const GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS = 30_000;

const SYSTEM_HEADERS = {
  CONNECTED: 'CLD01',
  DISCONNECTED: 'CLD02',
} as const;

function getGatewayWsLifecycleEvent(
  log: GatewayTelemetryLogRecord,
): 'gateway_connected' | 'gateway_disconnected' | null {
  const payload = log.payload;
  if (!payload) return null;

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
  if (header === SYSTEM_HEADERS.CONNECTED) return 'gateway_connected';
  if (header === SYSTEM_HEADERS.DISCONNECTED) return 'gateway_disconnected';
  return null;
}

function sortAscending(logs: GatewayTelemetryLogRecord[]): GatewayTelemetryLogRecord[] {
  return [...logs].sort((a, b) => {
    const ta = new Date(a.logged_at).getTime();
    const tb = new Date(b.logged_at).getTime();
    if (ta !== tb) return ta - tb;
    const ca = a.created_at ? new Date(a.created_at).getTime() : 0;
    const cb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ca - cb;
  });
}

/** Hide cloud disconnect→connect pairs that occur within 30s (normal GCP teardown/recycle).
 *  Keep in sync with backend `filterRoutineGatewayWsReconnectLogs` (used on list API + live WS merge). */
export function filterRoutineGatewayWsReconnectLogs(
  logs: GatewayTelemetryLogRecord[],
  thresholdMs: number = GATEWAY_WS_ROUTINE_RECONNECT_MAX_MS,
): GatewayTelemetryLogRecord[] {
  if (logs.length === 0) return logs;

  const hidden = new Set<string>();
  const sorted = sortAscending(logs);

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

  if (hidden.size === 0) return logs;
  return logs.filter((log) => !hidden.has(log.id));
}
