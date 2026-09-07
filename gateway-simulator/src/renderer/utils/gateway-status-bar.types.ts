export type StatusBarPhase = 'idle' | 'sending' | 'in-progress' | 'success' | 'failed';

export type StatusBarOperationKind =
  | 'proxy'
  | 'firmware-push'
  | 'inventory-snapshot'
  | 'command'
  | 'command-ack'
  | 'access-code-ack'
  | 'device-deleted-ack'
  | 'auth'
  | 'system';

export type PendingProxyOperation = {
  id: string;
  label: string;
  path: string;
  method: string;
  startedAt: string;
  deviceKey?: string;
};

export type StatefulPushOperation = {
  kind: 'firmware-push' | 'inventory-snapshot';
  phase: string;
  startedAt: string;
  pushId?: string;
  version?: string;
  targetType?: string;
  chunksReceived?: number;
  chunkCount?: number;
  error?: string;
};

export type StatusBarHistoryEntry = {
  phase: Exclude<StatusBarPhase, 'idle'>;
  message: string;
  timestamp: string;
  tooltipLines: string[];
};

export type GatewayStatusBarState = {
  pendingProxies: Record<string, PendingProxyOperation>;
  firmwarePush: StatefulPushOperation | null;
  inventorySnapshot: StatefulPushOperation | null;
  activeCommand: { label: string; startedAt: string } | null;
  current: StatusBarHistoryEntry | null;
  history: StatusBarHistoryEntry[];
  /** Wall-clock ms when activity last changed — used for display TTL. */
  lastActivityAt?: number;
};

export const STATUS_BAR_SUCCESS_MS = 4000;
export const STATUS_BAR_FAILURE_MS = 6500;
export const STATUS_BAR_HISTORY_LIMIT = 8;

export function createInitialGatewayStatusBarState(): GatewayStatusBarState {
  return {
    pendingProxies: {},
    firmwarePush: null,
    inventorySnapshot: null,
    activeCommand: null,
    current: null,
    history: [],
  };
}
