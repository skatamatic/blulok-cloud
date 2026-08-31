import type { GatewayEventEntry } from '@protocol/ipc-channels';
import type { AppRealtimeEventEntry } from '@protocol/user-simulator-state';

const HEARTBEAT_TYPES = new Set(['PING', 'PONG', 'PONG_OK']);

export function isHeartbeatEvent(entry: GatewayEventEntry): boolean {
  if (HEARTBEAT_TYPES.has(entry.summary)) return true;
  if (entry.payload && typeof entry.payload === 'object' && 'type' in entry.payload) {
    const type = (entry.payload as { type?: string }).type;
    return typeof type === 'string' && HEARTBEAT_TYPES.has(type);
  }
  return false;
}

export function isAppRealtimeHeartbeatEvent(entry: Pick<AppRealtimeEventEntry, 'summary' | 'payload'>): boolean {
  if (entry.summary.startsWith('heartbeat')) return true;
  if (entry.payload && typeof entry.payload === 'object' && 'type' in entry.payload) {
    return (entry.payload as { type?: string }).type === 'heartbeat';
  }
  return false;
}

export const HIDE_HEARTBEAT_LOGS_KEY = 'simulator.hidePingPong';

export function readHideHeartbeatLogsPreference(): boolean {
  try {
    const raw = localStorage.getItem(HIDE_HEARTBEAT_LOGS_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function writeHideHeartbeatLogsPreference(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_HEARTBEAT_LOGS_KEY, String(hide));
  } catch {
    // ignore storage failures
  }
}

/** HH:MM:SS (or locale equivalent) in the user's local timezone. */
export function formatEventLogLocalTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp.length >= 19 ? isoTimestamp.slice(11, 19) : isoTimestamp;
  }
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
