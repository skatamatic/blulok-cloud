export interface SecureTimeSyncPayload {
  cmd_type: 'SECURE_TIME_SYNC';
  ts: number;
}

export interface SecureTimeSyncPacket {
  payload: SecureTimeSyncPayload;
  signature: string;
}

export interface DenylistAddEntry {
  sub: string;
  exp: number;
}

export interface DenylistUpdatePayload {
  cmd_type: 'DENYLIST_ADD';
  denylist_add: DenylistAddEntry[];
  targets?: { device_ids: string[] };
}

export interface DenylistUpdatePacket {
  payload: DenylistUpdatePayload;
  signature: string;
}


