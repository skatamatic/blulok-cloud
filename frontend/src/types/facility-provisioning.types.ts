export type FacilityProvisioningUploadSource = 'app' | 'dashboard';

export interface FacilityProvisioningFile {
  id: string;
  facility_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  sha256_hash: string;
  upload_source: FacilityProvisioningUploadSource;
  created_by: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface FacilityProvisioningUploadSession {
  upload_id: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_in_seconds: number;
  upload_token?: string;
  facility_id: string;
}

export interface FacilityProvisioningListResult {
  files: FacilityProvisioningFile[];
  total: number;
}

export const PROVISIONING_MAX_SIZE_MB = 500;
export const PROVISIONING_MAX_SIZE_BYTES = PROVISIONING_MAX_SIZE_MB * 1024 * 1024;

export const UPLOAD_SOURCE_LABELS: Record<FacilityProvisioningUploadSource, string> = {
  app: 'Mobile app',
  dashboard: 'Dashboard',
};

export function formatProvisioningSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
