/** Gateway WebSocket message type literals (inbound: gateway → cloud). */
export const GATEWAY_INBOUND_MESSAGE_TYPES = [
  'AUTH',
  'PONG',
  'PROXY_REQUEST',
  'COMMAND_ACK',
  'FIRMWARE_CHUNK_ACK',
  'FIRMWARE_UPDATE_STATUS',
  'FIRMWARE_PROGRESS',
  'ACCESS_CODE_UPDATE_ACK',
  'DEVICE_DELETED_ACK',
  'INVENTORY_SNAPSHOT_CHUNK_ACK',
  'INVENTORY_SNAPSHOT_STATUS',
] as const;

/** Gateway WebSocket message type literals (outbound: cloud → gateway). */
export const GATEWAY_OUTBOUND_MESSAGE_TYPES = [
  'AUTH_OK',
  'ERROR',
  'PING',
  'PONG_OK',
  'PROXY_RESPONSE',
  'COMMAND',
  'FIRMWARE_MANIFEST',
  'FIRMWARE_CHUNK',
  'FIRMWARE_PUSH_RESUME',
  'ACCESS_CODE_UPDATE',
  'INVENTORY_SNAPSHOT_MANIFEST',
  'INVENTORY_SNAPSHOT_CHUNK',
  'INVENTORY_SNAPSHOT_RESUME',
  'FIRMWARE_UPDATE_STATUS_ACK',
  'INVENTORY_SNAPSHOT_STATUS_ACK',
] as const;

export type GatewayInboundMessageType = (typeof GATEWAY_INBOUND_MESSAGE_TYPES)[number];
export type GatewayOutboundMessageType = (typeof GATEWAY_OUTBOUND_MESSAGE_TYPES)[number];

export type GatewaySessionRole = 'active' | 'swap_candidate' | 'legacy';

export type AuthMessage = {
  type: 'AUTH';
  token: string;
  facilityId: string;
  gatewayId?: string;
};

export type AuthOkMessage = {
  type: 'AUTH_OK';
  facilityId: string;
  gatewayId?: string;
  sessionRole?: GatewaySessionRole;
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
export type PongOkMessage = { type: 'PONG_OK'; ts?: number };

export type ProxyRequestMessage = {
  type: 'PROXY_REQUEST';
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
};

export type ProxyResponseMessage = {
  type: 'PROXY_RESPONSE';
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type CommandEnvelopeMessage = {
  type: 'COMMAND';
  jwt?: string;
  id?: string;
  commandType?: string;
  payload?: unknown;
};

export type FirmwareManifestMessage = { type: 'FIRMWARE_MANIFEST'; jwt: string };
export type FirmwareChunkMessage = { type: 'FIRMWARE_CHUNK'; jwt: string };

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
  target_type?: FirmwareTargetType;
  error?: string;
  message?: string;
};

export type FirmwareProgressMessage = {
  type: 'FIRMWARE_PROGRESS';
  push_id: string;
  target_type?: string;
  progress_percent?: number;
  phase?: string;
  message?: string;
  devices?: Array<{
    device_id?: string;
    status: string;
    progress_percent?: number;
    error?: string;
  }>;
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

export type FirmwareTargetType = 'gateway' | 'lock' | 'friend_node' | 'access_control';

export type GatewayWsMessage =
  | AuthMessage
  | AuthOkMessage
  | ErrorMessage
  | PingMessage
  | PongMessage
  | PongOkMessage
  | ProxyRequestMessage
  | ProxyResponseMessage
  | CommandEnvelopeMessage
  | FirmwareManifestMessage
  | FirmwareChunkMessage
  | FirmwareChunkAckMessage
  | FirmwareUpdateStatusMessage
  | FirmwareProgressMessage
  | AccessCodeUpdateAckMessage
  | DeviceDeletedAckMessage;

export function parseJsonMessage(raw: string | Buffer): unknown {
  const text = typeof raw === 'string' ? raw : raw.toString('utf8');
  return JSON.parse(text);
}

export function isPingMessage(m: unknown): m is PingMessage {
  return !!m && typeof m === 'object' && (m as PingMessage).type === 'PING';
}

export function isInventorySyncRequestMessage(m: unknown): m is { type: 'INVENTORY_SYNC_REQUEST' } {
  return !!m && typeof m === 'object' && (m as { type?: string }).type === 'INVENTORY_SYNC_REQUEST';
}

export function isAuthOkMessage(m: unknown): m is AuthOkMessage {
  return !!m && typeof m === 'object' && (m as AuthOkMessage).type === 'AUTH_OK';
}

export function isProxyResponseMessage(m: unknown): m is ProxyResponseMessage {
  return (
    !!m &&
    typeof m === 'object' &&
    (m as ProxyResponseMessage).type === 'PROXY_RESPONSE' &&
    typeof (m as ProxyResponseMessage).id === 'string'
  );
}

export function isErrorMessage(m: unknown): m is ErrorMessage {
  return !!m && typeof m === 'object' && (m as ErrorMessage).type === 'ERROR';
}
