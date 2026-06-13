export type ProvisioningUploadSource = 'gateway_push' | 'cloud_requested';

export type ProvisioningRestoreStatus =
  | 'pending'
  | 'transferring'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'cancelled';

export interface GatewayProvisioningBackup {
  id: string;
  gateway_id: string;
  facility_id: string;
  filename: string;
  size_bytes: number;
  sha256_hash: string;
  upload_source: ProvisioningUploadSource;
  created_by: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface GatewayProvisioningRestore {
  id: string;
  backup_id: string;
  gateway_id: string;
  facility_id: string;
  status: ProvisioningRestoreStatus;
  chunks_total: number | null;
  chunks_sent: number;
  nonce: string | null;
  error_message: string | null;
  initiated_by: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProvisioningRestoreStatusResponse {
  active: GatewayProvisioningRestore | null;
  history: GatewayProvisioningRestore[];
}

export const PROVISIONING_TERMINAL_STATUSES: ProvisioningRestoreStatus[] = ['complete', 'failed', 'cancelled'];

export const UPLOAD_SOURCE_LABELS: Record<ProvisioningUploadSource, string> = {
  gateway_push: 'Gateway push',
  cloud_requested: 'Cloud requested',
};

export const RESTORE_STATUS_LABELS: Record<ProvisioningRestoreStatus, string> = {
  pending: 'Pending',
  transferring: 'Transferring',
  verifying: 'Verifying on gateway',
  complete: 'Complete',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export interface ProvisioningRestoreProgress {
  restoreId: string;
  backupId: string;
  backupFilename: string;
  gatewayId: string;
  facilityId: string;
  step: ProvisioningRestoreStatus;
  percent: number;
  chunksTotal?: number;
  chunksSent?: number;
  message?: string;
  timestamp?: string;
}

export function formatProvisioningSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
