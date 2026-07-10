/** JWT cmd_type literals used on the gateway WebSocket command channel. */
export const COMMAND_TYPES = [
  'LOCK',
  'UNLOCK',
  'DENYLIST_ADD',
  'DENYLIST_REMOVE',
  'ACCESS_CODE_UPDATE',
  'DEVICE_DELETED',
  'SECURE_TIME_SYNC',
  'ROTATE_OPERATIONS_KEY',
  'FIRMWARE_MANIFEST',
  'FIRMWARE_CHUNK',
  'INVENTORY_SNAPSHOT_MANIFEST',
  'INVENTORY_SNAPSHOT_CHUNK',
] as const;

export type CommandType = (typeof COMMAND_TYPES)[number];

export type JwtCommandPayload = {
  iss?: string;
  iat?: number;
  exp?: number;
  cmd_type: string;
  [key: string]: unknown;
};

export type LockUnlockPayload = JwtCommandPayload & {
  cmd_type: 'LOCK' | 'UNLOCK';
  device_id: string;
  expires_at?: number;
  /** Wall time (unix UTC seconds) until an access-control open should remain active. */
  open_until?: number;
};

export type DenylistAddPayload = JwtCommandPayload & {
  cmd_type: 'DENYLIST_ADD';
  denylist_add: Array<{ sub: string; exp?: number }>;
  target?: string[];
};

export type DenylistRemovePayload = JwtCommandPayload & {
  cmd_type: 'DENYLIST_REMOVE';
  denylist_remove: Array<{ sub: string; exp?: number }>;
  target?: string[];
};

export type AccessCodeUpdatePayload = JwtCommandPayload & {
  cmd_type: 'ACCESS_CODE_UPDATE';
  facility_id: string;
  nonce: string;
  codes: Array<{
    device_id: string;
    access_id: string;
    relay_channel: number;
    valid_codes: Array<{
      code: string;
      valid_until: string;
      valid_from?: string;
      schedule_id?: string | null;
      schedule_name?: string | null;
      schedule?: { facility_id?: string; time_windows?: Array<{ day_of_week: number; start_time: string; end_time: string }> } | null;
      time_windows?: Array<{ day_of_week: number; start_time: string; end_time: string }>;
    }>;
  }>;
};

export type DeviceDeletedPayload = JwtCommandPayload & {
  cmd_type: 'DEVICE_DELETED';
  facility_id: string;
  gateway_id?: string;
  nonce: string;
  device_kind: string;
  lock_id?: string;
  access_id?: string;
  relay_channel?: number;
  serial?: string;
};

export type FirmwareManifestPayload = JwtCommandPayload & {
  cmd_type: 'FIRMWARE_MANIFEST';
  push_id: string;
  target_type: string;
  filename: string;
  version: string;
  sha256: string;
  size: number;
  chunk_count: number;
  chunk_size: number;
  nonce: string;
  compatible_models?: string[];
};

export type FirmwareChunkPayload = JwtCommandPayload & {
  cmd_type: 'FIRMWARE_CHUNK';
  target_type: string;
  nonce: string;
  chunk_index: number;
  chunk_sha256: string;
  data: string;
};

export type RotateOperationsKeyPayload = JwtCommandPayload & {
  cmd_type: 'ROTATE_OPERATIONS_KEY';
  new_ops_pubkey: string;
  ts: number;
};

export type SecureTimeSyncPayload = JwtCommandPayload & {
  cmd_type: 'SECURE_TIME_SYNC';
  ts?: number;
  lock_id?: string;
};

export type InventorySnapshotManifestPayload = JwtCommandPayload & {
  cmd_type: 'INVENTORY_SNAPSHOT_MANIFEST';
  recovery_id: string;
  snapshot_id: string;
  sha256: string;
  size_bytes: number;
  device_count: number;
  chunk_count: number;
  chunk_size: number;
  nonce: string;
};

export type InventorySnapshotChunkPayload = JwtCommandPayload & {
  cmd_type: 'INVENTORY_SNAPSHOT_CHUNK';
  nonce: string;
  chunk_index: number;
  chunk_sha256: string;
  data: string;
};

export function isCommandType(value: string): value is CommandType {
  return (COMMAND_TYPES as readonly string[]).includes(value);
}
