import type { GatewayEventEntry } from '@protocol/ipc-channels';
import { isHeartbeatEvent } from './event-log.utils';
import {
  createInitialGatewayStatusBarState,
  STATUS_BAR_FAILURE_MS,
  STATUS_BAR_HISTORY_LIMIT,
  STATUS_BAR_SUCCESS_MS,
  type GatewayStatusBarState,
  type PendingProxyOperation,
  type StatefulPushOperation,
  type StatusBarHistoryEntry,
} from './gateway-status-bar.types';
import {
  decodeJwtCommandType,
  humanizeCommandType,
  parseHttpStatus,
  proxyPathLabel,
  readInboundCommandLabel,
  readPayloadType,
} from './gateway-status-bar-labels.utils';
import {
  buildFirmwareTooltip,
  buildSnapshotTooltip,
  formatPayloadDetails,
  formatStatusBarTimestamp,
} from './gateway-status-bar-format.utils';

export type {
  GatewayStatusBarState,
  PendingProxyOperation,
  StatefulPushOperation,
  StatusBarHistoryEntry,
  StatusBarOperationKind,
  StatusBarPhase,
} from './gateway-status-bar.types';
export {
  createInitialGatewayStatusBarState,
  STATUS_BAR_FAILURE_MS,
  STATUS_BAR_HISTORY_LIMIT,
  STATUS_BAR_SUCCESS_MS,
} from './gateway-status-bar.types';
export { humanizeCommandType, proxyPathLabel, readPayloadType } from './gateway-status-bar-labels.utils';
export { formatStatusBarTimestamp } from './gateway-status-bar-format.utils';

export function isStatusBarExcludedEvent(entry: GatewayEventEntry): boolean {
  if (isHeartbeatEvent(entry)) return true;
  if (entry.summary === 'AUTH sent') return false;
  if (entry.direction === 'in') {
    const type = readPayloadType(entry.payload);
    if (type === 'AUTH_OK' || type === 'ERROR' || type === 'PONG_OK') return true;
  }
  return false;
}

function pushHistory(state: GatewayStatusBarState, entry: StatusBarHistoryEntry): GatewayStatusBarState {
  return {
    ...state,
    current: entry,
    lastActivityAt: Date.now(),
    history: [entry, ...state.history].slice(0, STATUS_BAR_HISTORY_LIMIT),
  };
}

function setCurrent(state: GatewayStatusBarState, entry: StatusBarHistoryEntry): GatewayStatusBarState {
  return pushHistory(state, entry);
}

function completeProxyById(
  state: GatewayStatusBarState,
  id: string,
  ok: boolean,
  detail?: string,
): GatewayStatusBarState {
  const pending = state.pendingProxies[id];
  if (!pending) return state;
  const nextPending = { ...state.pendingProxies };
  delete nextPending[id];
  const message = ok ? `Sent ${pending.label} OK` : `Sent ${pending.label} failed`;
  const tooltipLines = [
    `Operation: ${pending.label}`,
    `Method: ${pending.method}`,
    `Path: ${pending.path}`,
    `Request ID: ${id}`,
    ...(pending.deviceKey ? [`Device: ${pending.deviceKey}`] : []),
    ...(detail ? [detail] : []),
  ];
  return setCurrent(
    { ...state, pendingProxies: nextPending },
    {
      phase: ok ? 'success' : 'failed',
      message,
      timestamp: new Date().toISOString(),
      tooltipLines,
    },
  );
}

function applySystemEvent(state: GatewayStatusBarState, entry: GatewayEventEntry): GatewayStatusBarState {
  const { summary } = entry;

  if (summary.startsWith('Inventory sync HTTP ')) {
    const status = parseHttpStatus(summary) ?? 500;
    const pending = findPendingProxyByPath(state, '/devices/inventory');
    if (pending) return completeProxyById(state, pending.id, status < 400, `HTTP ${status}`);
    return setCurrent(state, {
      phase: status < 400 ? 'success' : 'failed',
      message: status < 400 ? 'Sent inventory sync OK' : 'Sent inventory sync failed',
      timestamp: entry.timestamp,
      tooltipLines: [`HTTP ${status}`, summary],
    });
  }

  if (summary.startsWith('State sync HTTP ')) {
    const status = parseHttpStatus(summary) ?? 500;
    const pending = findPendingProxyByPath(state, '/devices/state');
    if (pending) {
      return completeProxyById(state, pending.id, status < 400, `HTTP ${status}`);
    }
    return setCurrent(state, {
      phase: status < 400 ? 'success' : 'failed',
      message: status < 400 ? 'Sent state sync OK' : 'Sent state sync failed',
      timestamp: entry.timestamp,
      tooltipLines: [`HTTP ${status}`, summary],
    });
  }

  const liveMatch = /^Live state sync HTTP (\d+) \((.+)\)$/.exec(summary);
  if (liveMatch) {
    const status = Number.parseInt(liveMatch[1], 10);
    const deviceKey = liveMatch[2];
    const pending = findPendingProxyByPath(state, '/devices/state');
    const label = 'live state sync';
    if (pending) {
      return completeProxyById(state, pending.id, status < 400, `HTTP ${status} · ${deviceKey}`);
    }
    return setCurrent(state, {
      phase: status < 400 ? 'success' : 'failed',
      message: status < 400 ? `Sent ${label} OK` : `Sent ${label} failed`,
      timestamp: entry.timestamp,
      tooltipLines: [`Device: ${deviceKey}`, `HTTP ${status}`],
    });
  }

  if (summary.startsWith('Live state sync failed:')) {
    const pending = findPendingProxyByPath(state, '/devices/state');
    const detail = summary.replace('Live state sync failed:', '').trim();
    if (pending) return completeProxyById(state, pending.id, false, detail);
    return setCurrent(state, {
      phase: 'failed',
      message: 'Sent live state sync failed',
      timestamp: entry.timestamp,
      tooltipLines: [detail || summary],
    });
  }

  if (summary.startsWith('Access event HTTP ')) {
    const status = parseHttpStatus(summary) ?? 500;
    const pending = findPendingProxyByPath(state, '/access-events');
    if (pending) return completeProxyById(state, pending.id, status < 400, `HTTP ${status}`);
    return setCurrent(state, {
      phase: status < 400 ? 'success' : 'failed',
      message: status < 400 ? 'Sent access event OK' : 'Sent access event failed',
      timestamp: entry.timestamp,
      tooltipLines: [`HTTP ${status}`],
    });
  }

  if (summary.startsWith('Telemetry sync failed:')) {
    const pending = findPendingProxyByPath(state, '/add_log');
    const detail = summary.replace('Telemetry sync failed:', '').trim();
    if (pending) return completeProxyById(state, pending.id, false, detail);
    return setCurrent(state, {
      phase: 'failed',
      message: 'Sent telemetry log failed',
      timestamp: entry.timestamp,
      tooltipLines: [detail || summary],
    });
  }

  if (summary.startsWith('Applied ') && summary.includes('→ state sync HTTP ')) {
    const status = parseHttpStatus(summary) ?? 500;
    const ok = status < 400;
    return setCurrent(
      { ...state, activeCommand: null },
      {
        phase: ok ? 'success' : 'failed',
        message: ok ? 'Sent command response OK' : 'Sent command response failed',
        timestamp: entry.timestamp,
        tooltipLines: [summary, `HTTP ${status}`],
      },
    );
  }

  if (summary.startsWith('State sync failed after ')) {
    return setCurrent(
      { ...state, activeCommand: null },
      {
        phase: 'failed',
        message: 'Sent command response failed',
        timestamp: entry.timestamp,
        tooltipLines: [summary],
      },
    );
  }

  if (summary.startsWith('Inventory snapshot applied —')) {
    return setCurrent(
      { ...state, inventorySnapshot: null },
      {
        phase: 'success',
        message: 'Sent inventory snapshot OK',
        timestamp: entry.timestamp,
        tooltipLines: [summary, formatPayloadDetails(entry.payload)],
      },
    );
  }

  if (summary.startsWith('Inventory sync deferred:')) {
    return setCurrent(state, {
      phase: 'failed',
      message: 'Inventory sync deferred',
      timestamp: entry.timestamp,
      tooltipLines: [summary.replace('Inventory sync deferred:', '').trim()],
    });
  }

  if (summary.startsWith('Inbound ')) {
    const label = summary.replace(/^Inbound /, '').replace(/ for device_id=.+$/, '');
    return {
      ...state,
      activeCommand: { label, startedAt: entry.timestamp },
      current: {
        phase: 'in-progress',
        message: `Processing ${label}`,
        timestamp: entry.timestamp,
        tooltipLines: [summary],
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  return state;
}

function findPendingProxyByPath(state: GatewayStatusBarState, fragment: string): PendingProxyOperation | null {
  return (
    Object.values(state.pendingProxies).find((pending) => pending.path.includes(fragment)) ?? null
  );
}

function applyOutboundEvent(state: GatewayStatusBarState, entry: GatewayEventEntry): GatewayStatusBarState {
  const type = readPayloadType(entry.payload);

  if (entry.summary === 'AUTH sent') {
    return setCurrent(state, {
      phase: 'sending',
      message: 'Sending authentication',
      timestamp: entry.timestamp,
      tooltipLines: ['Gateway AUTH handshake'],
    });
  }

  if (type === 'PROXY_REQUEST') {
    const payload = entry.payload as {
      id?: string;
      path?: string;
      method?: string;
    };
    const id = payload.id ?? entry.id;
    const path = payload.path ?? 'unknown';
    const method = payload.method ?? 'POST';
    const label = proxyPathLabel(path, method);
    const pending: PendingProxyOperation = {
      id,
      label,
      path,
      method,
      startedAt: entry.timestamp,
    };
    return setCurrent(
      {
        ...state,
        pendingProxies: { ...state.pendingProxies, [id]: pending },
      },
      {
        phase: 'sending',
        message: `Sending ${label}`,
        timestamp: entry.timestamp,
        tooltipLines: [`Method: ${method}`, `Path: ${path}`, `Request ID: ${id}`],
      },
    );
  }

  if (type === 'FIRMWARE_UPDATE_STATUS') {
    const payload = entry.payload as {
      status?: string;
      push_id?: string;
      version?: string;
      target_type?: string;
      error?: string;
      message?: string;
    };
    const phase = payload.status ?? 'unknown';
    const nextPush: StatefulPushOperation = {
      kind: 'firmware-push',
      phase,
      startedAt: state.firmwarePush?.startedAt ?? entry.timestamp,
      pushId: payload.push_id,
      version: payload.version,
      targetType: payload.target_type,
      chunksReceived: state.firmwarePush?.chunksReceived,
      chunkCount: state.firmwarePush?.chunkCount,
      error: payload.error ?? payload.message,
    };

    if (phase === 'success') {
      return setCurrent(
        { ...state, firmwarePush: null },
        {
          phase: 'success',
          message: 'Sent firmware update OK',
          timestamp: entry.timestamp,
          tooltipLines: buildFirmwareTooltip(nextPush),
        },
      );
    }

    if (phase === 'failed') {
      return setCurrent(
        { ...state, firmwarePush: null },
        {
          phase: 'failed',
          message: 'Sent firmware update failed',
          timestamp: entry.timestamp,
          tooltipLines: buildFirmwareTooltip(nextPush),
        },
      );
    }

    return {
      ...state,
      firmwarePush: nextPush,
      current: {
        phase: 'in-progress',
        message: `Firmware push in progress (${phase})`,
        timestamp: entry.timestamp,
        tooltipLines: buildFirmwareTooltip(nextPush),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  if (type === 'FIRMWARE_CHUNK_ACK') {
    const payload = entry.payload as { status?: string; chunkIndex?: number; message?: string };
    const failed = payload.status === 'error';
    const firmwarePush = state.firmwarePush ?? {
      kind: 'firmware-push' as const,
      phase: 'transferring',
      startedAt: entry.timestamp,
    };
    const chunksReceived = (firmwarePush.chunksReceived ?? 0) + 1;
    const nextPush = { ...firmwarePush, chunksReceived, error: payload.message };

    if (failed) {
      return setCurrent(
        { ...state, firmwarePush: null },
        {
          phase: 'failed',
          message: 'Sent firmware chunk ACK failed',
          timestamp: entry.timestamp,
          tooltipLines: buildFirmwareTooltip(nextPush),
        },
      );
    }

    return {
      ...state,
      firmwarePush: nextPush,
      current: {
        phase: 'in-progress',
        message: 'Firmware push in progress (transferring)',
        timestamp: entry.timestamp,
        tooltipLines: buildFirmwareTooltip(nextPush),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  if (type === 'INVENTORY_SNAPSHOT_STATUS') {
    const payload = entry.payload as { status?: string; error?: string; message?: string };
    const phase = payload.status ?? 'unknown';
    const nextPush: StatefulPushOperation = {
      kind: 'inventory-snapshot',
      phase,
      startedAt: state.inventorySnapshot?.startedAt ?? entry.timestamp,
      pushId: (entry.payload as { snapshot_id?: string }).snapshot_id,
      chunksReceived: state.inventorySnapshot?.chunksReceived,
      chunkCount: state.inventorySnapshot?.chunkCount,
      error: payload.error ?? payload.message,
    };

    if (phase === 'success') {
      return setCurrent(
        { ...state, inventorySnapshot: null },
        {
          phase: 'success',
          message: 'Sent inventory snapshot OK',
          timestamp: entry.timestamp,
          tooltipLines: buildSnapshotTooltip(nextPush),
        },
      );
    }

    if (phase === 'failed') {
      return setCurrent(
        { ...state, inventorySnapshot: null },
        {
          phase: 'failed',
          message: 'Sent inventory snapshot failed',
          timestamp: entry.timestamp,
          tooltipLines: buildSnapshotTooltip(nextPush),
        },
      );
    }

    return {
      ...state,
      inventorySnapshot: nextPush,
      current: {
        phase: 'in-progress',
        message: `Inventory snapshot in progress (${phase})`,
        timestamp: entry.timestamp,
        tooltipLines: buildSnapshotTooltip(nextPush),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  if (type === 'INVENTORY_SNAPSHOT_CHUNK_ACK') {
    const payload = entry.payload as { status?: string; chunkIndex?: number; message?: string };
    const failed = payload.status === 'error';
    const inventorySnapshot = state.inventorySnapshot ?? {
      kind: 'inventory-snapshot' as const,
      phase: 'transferring',
      startedAt: entry.timestamp,
    };
    const chunksReceived = (inventorySnapshot.chunksReceived ?? 0) + 1;
    const nextPush = { ...inventorySnapshot, chunksReceived, error: payload.message };

    if (failed) {
      return setCurrent(
        { ...state, inventorySnapshot: null },
        {
          phase: 'failed',
          message: 'Sent inventory snapshot chunk ACK failed',
          timestamp: entry.timestamp,
          tooltipLines: buildSnapshotTooltip(nextPush),
        },
      );
    }

    return {
      ...state,
      inventorySnapshot: nextPush,
      current: {
        phase: 'in-progress',
        message: 'Inventory snapshot in progress (transferring)',
        timestamp: entry.timestamp,
        tooltipLines: buildSnapshotTooltip(nextPush),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  if (type === 'COMMAND_ACK') {
    return setCurrent(state, {
      phase: 'success',
      message: 'Sent command ACK OK',
      timestamp: entry.timestamp,
      tooltipLines: [entry.summary, formatPayloadDetails(entry.payload)],
    });
  }

  if (type === 'ACCESS_CODE_UPDATE_ACK' || type === 'DEVICE_DELETED_ACK') {
    const label = type === 'ACCESS_CODE_UPDATE_ACK' ? 'access code update ACK' : 'device deleted ACK';
    return setCurrent(state, {
      phase: 'success',
      message: `Sent ${label} OK`,
      timestamp: entry.timestamp,
      tooltipLines: [entry.summary, formatPayloadDetails(entry.payload)],
    });
  }

  if (type && type !== 'PONG') {
    return setCurrent(state, {
      phase: 'sending',
      message: `Sending ${humanizeCommandType(type)}`,
      timestamp: entry.timestamp,
      tooltipLines: [entry.summary, formatPayloadDetails(entry.payload)],
    });
  }

  return state;
}

function applyInboundPushEvent(
  state: GatewayStatusBarState,
  entry: GatewayEventEntry,
  kind: 'firmware-push' | 'inventory-snapshot',
  cmdType: string,
): GatewayStatusBarState {
  const isManifest = cmdType.endsWith('MANIFEST');
  const labelPrefix = kind === 'firmware-push' ? 'Firmware push' : 'Inventory snapshot';
  const push: StatefulPushOperation = {
    kind,
    phase: isManifest ? 'receiving' : 'transferring',
    startedAt: entry.timestamp,
    chunksReceived: isManifest ? 0 : ((kind === 'firmware-push' ? state.firmwarePush : state.inventorySnapshot)?.chunksReceived ?? 0) + 1,
  };

  const nextState =
    kind === 'firmware-push'
      ? { ...state, firmwarePush: push }
      : { ...state, inventorySnapshot: push };

  return {
    ...nextState,
    current: {
      phase: 'in-progress',
      message: isManifest
        ? `${labelPrefix} in progress (receiving manifest)`
        : `${labelPrefix} in progress (receiving chunks)`,
      timestamp: entry.timestamp,
      tooltipLines: kind === 'firmware-push' ? buildFirmwareTooltip(push) : buildSnapshotTooltip(push),
    },
    history: state.history,
  };
}

function applyInboundEvent(state: GatewayStatusBarState, entry: GatewayEventEntry): GatewayStatusBarState {
  const type = readPayloadType(entry.payload);

  if (type === 'PROXY_RESPONSE') {
    const payload = entry.payload as { id?: string; status?: number; body?: unknown };
    if (!payload.id) return state;
    const ok = (payload.status ?? 500) < 400;
    const detail =
      typeof payload.body === 'object' && payload.body !== null
        ? `HTTP ${payload.status ?? 'unknown'} · ${formatPayloadDetails(payload.body)}`
        : `HTTP ${payload.status ?? 'unknown'}`;
    return completeProxyById(state, payload.id, ok, detail);
  }

  if (type === 'FIRMWARE_MANIFEST' || type === 'FIRMWARE_CHUNK') {
    const manifestPayload = entry.payload as { chunk_count?: number };
    const firmwarePush: StatefulPushOperation = {
      kind: 'firmware-push',
      phase: type === 'FIRMWARE_MANIFEST' ? 'receiving' : 'transferring',
      startedAt: entry.timestamp,
      chunkCount: manifestPayload.chunk_count ?? state.firmwarePush?.chunkCount,
      chunksReceived: type === 'FIRMWARE_CHUNK' ? (state.firmwarePush?.chunksReceived ?? 0) + 1 : 0,
    };
    return {
      ...state,
      firmwarePush,
      current: {
        phase: 'in-progress',
        message:
          type === 'FIRMWARE_MANIFEST'
            ? 'Firmware push in progress (receiving manifest)'
            : 'Firmware push in progress (receiving chunks)',
        timestamp: entry.timestamp,
        tooltipLines: buildFirmwareTooltip(firmwarePush),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  if (type === 'INVENTORY_SNAPSHOT_MANIFEST' || type === 'INVENTORY_SNAPSHOT_CHUNK') {
    const manifestPayload = entry.payload as { chunk_count?: number };
    const inventorySnapshot: StatefulPushOperation = {
      kind: 'inventory-snapshot',
      phase: type === 'INVENTORY_SNAPSHOT_MANIFEST' ? 'receiving' : 'transferring',
      startedAt: entry.timestamp,
      chunkCount: manifestPayload.chunk_count ?? state.inventorySnapshot?.chunkCount,
      chunksReceived:
        type === 'INVENTORY_SNAPSHOT_CHUNK'
          ? (state.inventorySnapshot?.chunksReceived ?? 0) + 1
          : 0,
    };
    return {
      ...state,
      inventorySnapshot,
      current: {
        phase: 'in-progress',
        message:
          type === 'INVENTORY_SNAPSHOT_MANIFEST'
            ? 'Inventory snapshot in progress (receiving manifest)'
            : 'Inventory snapshot in progress (receiving chunks)',
        timestamp: entry.timestamp,
        tooltipLines: buildSnapshotTooltip(inventorySnapshot),
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  const inboundLabel = readInboundCommandLabel(entry.payload);
  const cmdType = decodeJwtCommandType(entry.payload);

  if (cmdType === 'FIRMWARE_MANIFEST' || cmdType === 'FIRMWARE_CHUNK') {
    return applyInboundPushEvent(state, entry, 'firmware-push', cmdType);
  }

  if (cmdType === 'INVENTORY_SNAPSHOT_MANIFEST' || cmdType === 'INVENTORY_SNAPSHOT_CHUNK') {
    return applyInboundPushEvent(state, entry, 'inventory-snapshot', cmdType);
  }

  if (inboundLabel || entry.summary.startsWith('COMMAND ')) {
    const label = inboundLabel ?? entry.summary.replace(/^COMMAND /, '');
    return {
      ...state,
      activeCommand: { label, startedAt: entry.timestamp },
      current: {
        phase: 'in-progress',
        message: `Processing ${label}`,
        timestamp: entry.timestamp,
        tooltipLines: [entry.summary, formatPayloadDetails(entry.payload)],
      },
      history: state.history,
      lastActivityAt: Date.now(),
    };
  }

  return state;
}

export function applyStatusBarEvent(
  state: GatewayStatusBarState,
  entry: GatewayEventEntry,
): GatewayStatusBarState {
  if (isStatusBarExcludedEvent(entry)) return state;

  if (entry.direction === 'system') return applySystemEvent(state, entry);
  if (entry.direction === 'out') return applyOutboundEvent(state, entry);
  if (entry.direction === 'in') return applyInboundEvent(state, entry);
  return state;
}

export function reduceStatusBarEvents(
  state: GatewayStatusBarState,
  events: GatewayEventEntry[],
  fromIndex = 0,
): { state: GatewayStatusBarState; nextIndex: number } {
  let next = state;
  for (let index = fromIndex; index < events.length; index += 1) {
    next = applyStatusBarEvent(next, events[index]);
  }
  return { state: next, nextIndex: events.length };
}

export function applyUnprocessedStatusBarEvents(
  state: GatewayStatusBarState,
  events: GatewayEventEntry[],
  processedIds: ReadonlySet<string>,
): { state: GatewayStatusBarState; processedIds: Set<string> } {
  let next = state;
  const nextProcessed = new Set(processedIds);
  for (const event of events) {
    if (nextProcessed.has(event.id)) continue;
    nextProcessed.add(event.id);
    next = applyStatusBarEvent(next, event);
  }
  return { state: next, processedIds: nextProcessed };
}

export function hasActiveStatusOperations(state: GatewayStatusBarState): boolean {
  return (
    Object.keys(state.pendingProxies).length > 0 ||
    state.firmwarePush !== null ||
    state.inventorySnapshot !== null ||
    state.activeCommand !== null
  );
}

function pendingProxyDisplay(state: GatewayStatusBarState): StatusBarHistoryEntry | null {
  const pending = Object.values(state.pendingProxies).at(-1);
  if (!pending) return null;
  return {
    phase: 'sending',
    message: `Sending ${pending.label}`,
    timestamp: pending.startedAt,
    tooltipLines: [`Method: ${pending.method}`, `Path: ${pending.path}`, `Request ID: ${pending.id}`],
  };
}

export function resolveStatusBarDisplay(
  state: GatewayStatusBarState,
  now = Date.now(),
): StatusBarHistoryEntry | null {
  if (Object.keys(state.pendingProxies).length > 0) {
    return state.current?.phase === 'sending' ? state.current : pendingProxyDisplay(state);
  }

  if (state.firmwarePush) {
    return (
      state.current ?? {
        phase: 'in-progress',
        message: `Firmware push in progress (${state.firmwarePush.phase})`,
        timestamp: state.firmwarePush.startedAt,
        tooltipLines: buildFirmwareTooltip(state.firmwarePush),
      }
    );
  }

  if (state.inventorySnapshot) {
    return (
      state.current ?? {
        phase: 'in-progress',
        message: `Inventory snapshot in progress (${state.inventorySnapshot.phase})`,
        timestamp: state.inventorySnapshot.startedAt,
        tooltipLines: buildSnapshotTooltip(state.inventorySnapshot),
      }
    );
  }

  if (state.activeCommand) {
    return (
      state.current ?? {
        phase: 'in-progress',
        message: `Processing ${state.activeCommand.label}`,
        timestamp: state.activeCommand.startedAt,
        tooltipLines: [`Command: ${state.activeCommand.label}`],
      }
    );
  }

  if (!state.current) return null;

  if (state.current.phase === 'sending' || state.current.phase === 'in-progress') {
    return state.current;
  }

  const activityAt = state.lastActivityAt ?? Date.parse(state.current.timestamp);
  const elapsed = now - activityAt;
  const ttl = state.current.phase === 'failed' ? STATUS_BAR_FAILURE_MS : STATUS_BAR_SUCCESS_MS;
  if (Number.isNaN(elapsed) || elapsed <= ttl) return state.current;
  return null;
}

export function buildStatusBarTooltip(
  state: GatewayStatusBarState,
  display: StatusBarHistoryEntry | null,
): string[] {
  if (!display) return ['No recent gateway activity'];
  const lines = [...display.tooltipLines];
  if (state.history.length > 1) {
    lines.push('', 'Recent activity:');
    for (const item of state.history.slice(1, 5)) {
      lines.push(`• ${item.message}`);
    }
  }
  return lines;
}
