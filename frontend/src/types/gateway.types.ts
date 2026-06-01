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

export interface GatewayTelemetryLogRecord {
  id: string;
  gateway_id: string;
  facility_id: string;
  logged_at: string;
  payload: Record<string, unknown> | null;
  source: string;
  created_at: string;
}

export interface GatewayTelemetryLogFilters {
  from?: string;
  to?: string;
  search?: string;
  source?: string;
  payload_path?: string;
  payload_value?: string;
  payload_op?: 'eq' | 'contains';
}

export interface GatewayTelemetryLogsResponse {
  success: boolean;
  logs: GatewayTelemetryLogRecord[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
