import type {
  SerializedSchedule,
  SerializedScheduleTimeWindow,
} from '@/services/schedules/schedule-serialization.service';

export type AuthMessage = {
  type: 'AUTH';
  token: string;
  facilityId: string;
  /**
   * Gateway GUID — the device's stable, self-generated UUID (persisted across reboots).
   * Required for swap/recovery identity binding. An unknown GUID is auto-registered:
   * parked as an unbound swap candidate when the facility already has a bound gateway,
   * or auto-bound as the active gateway when the facility has none (first install).
   */
  gatewayId?: string;
  /**
   * Running gateway firmware version reported on connect/reconnect.
   * Canonical seed for gateways.firmware_version — always overwrites the stored
   * value when present. OTA may update the row between AUTHs; the next AUTH wins.
   */
  firmware_version?: string;
};

export type GatewaySessionRole = 'active' | 'swap_candidate' | 'legacy';

export type AuthOkMessage = {
  type: 'AUTH_OK';
  facilityId: string;
  gatewayId?: string;
  sessionRole?: GatewaySessionRole;
  /** True when this AUTH created a new gateway record (first time the device was seen). */
  autoRegistered?: boolean;
  ops_public_key?: string;
  ops_public_key_jwk?: { kty: string; crv: string; x: string };
  ops_public_key_pem?: string;
};

export type ErrorMessage = {
  type: 'ERROR';
  code: string;
  message: string;
};

export type PingMessage = { type: 'PING' };
export type PongMessage = { type: 'PONG' };

export type ProxyRequestMessage = {
  type: 'PROXY_REQUEST';
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
};

export type ProxyResponseMessage = {
  type: 'PROXY_RESPONSE';
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
};

export type CommandMessage = {
  type: 'COMMAND';
  id: string;
  commandType: string;
  payload: any;
};

export type CommandAckMessage = {
  type: 'COMMAND_ACK';
  id: string;
  status: 'ok' | 'error';
  message?: string;
};

// Firmware OTA Messages (Cloud -> Gateway)
export type FirmwareManifestMessage = {
  type: 'FIRMWARE_MANIFEST';
  jwt: string;
};

export type FirmwareChunkMessage = {
  type: 'FIRMWARE_CHUNK';
  jwt: string;
};

export type AccessCodeUpdateMessage = {
  type: 'ACCESS_CODE_UPDATE';
  jwt: string;
};

export type AccessCodeUpdateAckMessage = {
  type: 'ACCESS_CODE_UPDATE_ACK';
  nonce: string;
  accepted?: boolean;
  message?: string;
};

export type DeviceDeletedAckMessage = {
  type: 'DEVICE_DELETED_ACK';
  nonce: string;
  success?: boolean;
  accepted?: boolean;
  message?: string;
  error?: string;
};

export type AccessCodeScheduleWindow = SerializedScheduleTimeWindow;

export type AccessCodeUpdateValidCodeEntry = {
  code: string;
  valid_from?: string;
  valid_until: string;
  schedule_id?: string | null;
  schedule?: SerializedSchedule | null;
  schedule_name?: string | null;
  time_windows?: AccessCodeScheduleWindow[];
};

export type AccessCodeUpdateCodeEntry = {
  device_id: string;
  access_id: string;
  relay_channel: number;
  valid_codes: AccessCodeUpdateValidCodeEntry[];
};

// Firmware OTA Messages (Gateway -> Cloud)
export type FirmwareChunkAckMessage = {
  type: 'FIRMWARE_CHUNK_ACK';
  nonce: string;
  chunkIndex: number;
  status: 'ok' | 'error';
  message?: string;
};

export type FirmwareUpdateStatusMessage = {
  type: 'FIRMWARE_UPDATE_STATUS';
  push_id: string;
  status: string;
  version?: string;
  target_type?: 'gateway' | 'lock' | 'friend_node' | 'access_control';
  error?: string;
  message?: string;
};

export type FirmwareUpdateStatusAckMessage = {
  type: 'FIRMWARE_UPDATE_STATUS_ACK';
  push_id?: string;
  accepted: boolean;
  push_status?: 'pending' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';
  reason?: string;
};

/** Cloud → gateway: sent after reconnect when pushes await final FIRMWARE_UPDATE_STATUS. */
export type FirmwarePushResumeMessage = {
  type: 'FIRMWARE_PUSH_RESUME';
  pushes: Array<{
    push_id: string;
    target_type: 'gateway' | 'lock' | 'friend_node' | 'access_control';
    status: 'verifying';
    progress_percent?: number;
  }>;
};

export type FirmwareProgressDeviceReport = {
  device_id?: string;
  deviceId?: string;
  status: 'pending' | 'downloading' | 'installing' | 'complete' | 'failed' | 'skipped';
  progress_percent?: number;
  progressPercent?: number;
  error?: string;
};

export type FirmwareProgressMessage = {
  type: 'FIRMWARE_PROGRESS';
  push_id: string;
  target_type?: string;
  targetType?: string;
  progress_percent?: number;
  phase?: string;
  message?: string;
  devices?: FirmwareProgressDeviceReport[];
  error?: {
    code: string;
    message: string;
    severity: 'warning' | 'critical';
  };
};

export type InventorySnapshotManifestMessage = {
  type: 'INVENTORY_SNAPSHOT_MANIFEST';
  jwt: string;
};

export type InventorySnapshotChunkMessage = {
  type: 'INVENTORY_SNAPSHOT_CHUNK';
  jwt: string;
};

export type InventorySnapshotChunkAckMessage = {
  type: 'INVENTORY_SNAPSHOT_CHUNK_ACK';
  nonce: string;
  chunkIndex: number;
  status: 'ok' | 'error';
  message?: string;
};

export type InventorySnapshotStatusMessage = {
  type: 'INVENTORY_SNAPSHOT_STATUS';
  recovery_id?: string;
  snapshot_id?: string;
  status: string;
  error?: string;
  message?: string;
};

export type InventorySnapshotStatusAckMessage = {
  type: 'INVENTORY_SNAPSHOT_STATUS_ACK';
  recovery_id?: string;
  accepted: boolean;
  recovery_status?: 'detected' | 'awaiting_config' | 'firmware' | 'inventory_push' | 'complete' | 'failed' | 'cancelled' | 'bypassed';
  reason?: string;
};

export type InventorySnapshotResumeMessage = {
  type: 'INVENTORY_SNAPSHOT_RESUME';
  recoveries: Array<{
    recovery_id: string;
    snapshot_id: string | null;
    status: 'verifying';
    chunks_sent?: number;
    chunks_total?: number | null;
  }>;
};

export type GatewayInboundMessage = AuthMessage | PongMessage | ProxyRequestMessage | CommandAckMessage | FirmwareChunkAckMessage | FirmwareUpdateStatusMessage | FirmwareProgressMessage | AccessCodeUpdateAckMessage | InventorySnapshotChunkAckMessage | InventorySnapshotStatusMessage;
export type GatewayOutboundMessage =
  | AuthOkMessage
  | ErrorMessage
  | PingMessage
  | ProxyResponseMessage
  | CommandMessage
  | FirmwareManifestMessage
  | FirmwareChunkMessage
  | FirmwarePushResumeMessage
  | AccessCodeUpdateMessage
  | InventorySnapshotManifestMessage
  | InventorySnapshotChunkMessage
  | InventorySnapshotResumeMessage;

// Minimal runtime guards (no zod dependency)
export function isAuthMessage(m: any): m is AuthMessage {
  return m && m.type === 'AUTH' && typeof m.token === 'string' && typeof m.facilityId === 'string';
}
export function isPong(m: any): m is PongMessage { return m && m.type === 'PONG'; }
export function isProxyRequest(m: any): m is ProxyRequestMessage {
  return m && m.type === 'PROXY_REQUEST' && typeof m.id === 'string' && typeof m.method === 'string' && typeof m.path === 'string';
}
export function isFirmwareProgress(m: any): m is FirmwareProgressMessage {
  return m && m.type === 'FIRMWARE_PROGRESS' && typeof m.push_id === 'string' && m.push_id.length > 0;
}


