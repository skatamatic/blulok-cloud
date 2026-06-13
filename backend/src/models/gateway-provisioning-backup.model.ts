import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

export type ProvisioningUploadSource = 'gateway_push' | 'cloud_requested';

export interface GatewayProvisioningBackup {
  id: string;
  gateway_id: string;
  facility_id: string;
  filename: string;
  size_bytes: number;
  sha256_hash: string;
  storage_path: string;
  upload_source: ProvisioningUploadSource;
  created_by: string | null;
  uploaded_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateGatewayProvisioningBackupData {
  id?: string;
  gateway_id: string;
  facility_id: string;
  filename: string;
  size_bytes: number;
  sha256_hash: string;
  storage_path: string;
  upload_source?: ProvisioningUploadSource;
  created_by?: string | null;
}

export type SanitizedGatewayProvisioningBackup = Omit<GatewayProvisioningBackup, 'storage_path'>;

export function sanitizeProvisioningBackup(
  row: GatewayProvisioningBackup,
): SanitizedGatewayProvisioningBackup {
  const { storage_path: _storagePath, ...rest } = row;
  return rest;
}

export class GatewayProvisioningBackupModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<GatewayProvisioningBackup | null> {
    const row = await this.db.connection('gateway_provisioning_backups').where('id', id).first();
    return row || null;
  }

  async findByGatewayId(
    gatewayId: string,
    limit = 50,
    offset = 0,
  ): Promise<GatewayProvisioningBackup[]> {
    return this.db.connection('gateway_provisioning_backups')
      .where('gateway_id', gatewayId)
      .orderBy('uploaded_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async countByGatewayId(gatewayId: string): Promise<number> {
    const result = await this.db.connection('gateway_provisioning_backups')
      .where('gateway_id', gatewayId)
      .count({ count: '*' })
      .first();
    return Number(result?.count ?? 0);
  }

  async create(data: CreateGatewayProvisioningBackupData): Promise<GatewayProvisioningBackup> {
    const id = data.id || uuidv4();
    const now = new Date();
    await this.db.connection('gateway_provisioning_backups').insert({
      id,
      gateway_id: data.gateway_id,
      facility_id: data.facility_id,
      filename: data.filename,
      size_bytes: data.size_bytes,
      sha256_hash: data.sha256_hash,
      storage_path: data.storage_path,
      upload_source: data.upload_source || 'gateway_push',
      created_by: data.created_by ?? null,
      uploaded_at: now,
      created_at: now,
      updated_at: now,
    });
    return (await this.findById(id))!;
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db.connection('gateway_provisioning_backups').where('id', id).delete();
    return deleted > 0;
  }
}
