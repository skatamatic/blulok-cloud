export type DeviceSyncAction = 'added' | 'removed' | 'unchanged' | 'skipped_manual' | 'error';

export type DeviceSyncKind = 'blulok' | 'access_control';

export interface DeviceSyncLogEntry {
  action: DeviceSyncAction;
  device_kind: DeviceSyncKind;
  identifier: string;
  label?: string;
  reason?: string;
}

export interface InventorySyncSummary {
  added: number;
  removed: number;
  unchanged: number;
  skipped_manual?: number;
  errors: string[];
}

export interface GatewayDeviceSyncLogRecord {
  id: string;
  gateway_id: string;
  facility_id: string;
  sync_kind: 'inventory' | 'state';
  source: string;
  summary: {
    locks?: InventorySyncSummary | null;
    access_control?: InventorySyncSummary | null;
  };
  entries: DeviceSyncLogEntry[];
  created_at: string;
}
