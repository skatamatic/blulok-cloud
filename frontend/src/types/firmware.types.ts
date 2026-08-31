export type FirmwareTargetType = 'gateway' | 'lock' | 'friend_node' | 'bridge' | 'access_control';

/** Tab / filter order used by DevTools and Gateway firmware UIs */
export const FIRMWARE_TARGET_TYPES: readonly FirmwareTargetType[] = [
  'gateway',
  'lock',
  'friend_node',
  'bridge',
  'access_control',
] as const;

export type FirmwarePushStatus = 'pending' | 'transferring' | 'verifying' | 'complete' | 'failed' | 'cancelled';

/** v1 = WebSocket chunking; v2 = GCS signed download URL */
export type FirmwareDeliveryMode = 'v1' | 'v2';

export interface FirmwareImage {
  id: string;
  version: string;
  target_type: FirmwareTargetType;
  filename: string;
  sha256_hash: string;
  size_bytes: number;
  description?: string;
  release_notes?: string;
  compatible_models?: string[];
  minimum_version?: string;
  created_at: string;
}

export interface FirmwarePush {
  id: string;
  firmware_id: string;
  gateway_id: string;
  facility_id: string;
  target_type: FirmwareTargetType;
  delivery_mode?: FirmwareDeliveryMode;
  status: FirmwarePushStatus;
  chunks_total: number | null;
  chunks_sent: number;
  progress_percent: number;
  phase?: string;
  devices_total?: number;
  devices_complete: number;
  devices_failed: number;
  error_message?: string;
  initiated_by: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export type FirmwarePushEventType = 'progress' | 'device_status' | 'error' | 'info';

export interface FirmwarePushEvent {
  id: string;
  push_id: string;
  event_type: FirmwarePushEventType;
  progress_percent?: number;
  phase?: string;
  device_id?: string;
  device_status?: string;
  error_code?: string;
  error_message?: string;
  error_severity?: 'warning' | 'critical';
  message?: string;
  metadata?: Record<string, unknown>;
  reported_at: string;
  created_at: string;
}

export interface FirmwareDeviceStatus {
  device_id: string;
  status: string;
  progress_percent?: number;
  error?: string;
  reported_at: string;
}

export interface FirmwarePushWithEvents extends FirmwarePush {
  recent_events?: FirmwarePushEvent[];
  device_statuses?: FirmwareDeviceStatus[];
}

/** Step values that a firmware push progress can report */
export type FirmwarePushStep = FirmwarePushStatus | 'manifest_sent' | 'distributing' | 'installing';

/** Live progress payload from WebSocket subscription */
export interface FirmwarePushProgress {
  pushId: string;
  firmwareId: string;
  gatewayId: string;
  facilityId: string;
  targetType?: FirmwareTargetType;
  step: FirmwarePushStep;
  percent: number;
  chunksTotal?: number;
  chunksSent?: number;
  message?: string;
  timestamp?: string;
  phase?: string;
  devicesTotal?: number;
  devicesComplete?: number;
  devicesFailed?: number;
  devices?: FirmwareDeviceStatus[];
  error?: {
    code?: string;
    message: string;
    severity?: 'warning' | 'critical';
  };
}

export const TARGET_TYPE_LABELS: Record<FirmwareTargetType, string> = {
  gateway: 'Gateway',
  lock: 'Lock',
  friend_node: 'Friend Node',
  bridge: 'Bridge',
  access_control: 'Access Control',
};

export const TARGET_TYPE_COLORS: Record<FirmwareTargetType, string> = {
  gateway: 'text-blue-600 dark:text-blue-400',
  lock: 'text-emerald-600 dark:text-emerald-400',
  friend_node: 'text-purple-600 dark:text-purple-400',
  bridge: 'text-cyan-600 dark:text-cyan-400',
  access_control: 'text-amber-600 dark:text-amber-400',
};

export const TERMINAL_STATUSES: FirmwarePushStatus[] = ['complete', 'failed', 'cancelled'];

export const PHASE_ORDER = ['transferring', 'distributing', 'installing', 'verifying', 'complete'] as const;

export const PHASE_LABELS: Record<string, string> = {
  transferring: 'Transferring',
  distributing: 'Distributing',
  installing: 'Installing',
  verifying: 'Verifying',
  complete: 'Complete',
};

export const STEP_LABELS: Record<string, string> = {
  pending: 'Preparing...',
  manifest_sent: 'Sending manifest...',
  transferring: 'Transferring to gateway...',
  distributing: 'Distributing to devices...',
  installing: 'Installing on devices...',
  verifying: 'Verifying...',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const DEVICE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-700' },
  downloading: { label: 'Downloading', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
  installing: { label: 'Installing', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
  verifying: { label: 'Verifying', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  complete: { label: 'Complete', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
  failed: { label: 'Failed', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  skipped: { label: 'Skipped', color: 'text-gray-400', bg: 'bg-gray-50 dark:bg-gray-800' },
};
