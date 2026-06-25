import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

export type FacilityProvisioningUploadSource = 'app' | 'dashboard';

export interface FacilityProvisioningFile {
  id: string;
  facility_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  sha256_hash: string;
  storage_path: string;
  upload_source: FacilityProvisioningUploadSource;
  created_by: string | null;
  uploaded_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateFacilityProvisioningFileData {
  id?: string;
  facility_id: string;
  filename: string;
  content_type?: string | null;
  size_bytes: number;
  sha256_hash: string;
  storage_path: string;
  upload_source?: FacilityProvisioningUploadSource;
  created_by?: string | null;
}

export type SanitizedFacilityProvisioningFile = Omit<FacilityProvisioningFile, 'storage_path'>;

export function sanitizeFacilityProvisioningFile(
  row: FacilityProvisioningFile,
): SanitizedFacilityProvisioningFile {
  const { storage_path: _storagePath, ...rest } = row;
  return rest;
}

export class FacilityProvisioningFileModel {
  private db = DatabaseService.getInstance();

  async findById(id: string): Promise<FacilityProvisioningFile | null> {
    const row = await this.db.connection('facility_provisioning_files').where('id', id).first();
    return row || null;
  }

  async findByFacilityId(
    facilityId: string,
    limit = 50,
    offset = 0,
  ): Promise<FacilityProvisioningFile[]> {
    return this.db.connection('facility_provisioning_files')
      .where('facility_id', facilityId)
      .orderBy('uploaded_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async countByFacilityId(facilityId: string): Promise<number> {
    const result = await this.db.connection('facility_provisioning_files')
      .where('facility_id', facilityId)
      .count({ count: '*' })
      .first();
    return Number(result?.count ?? 0);
  }

  async create(data: CreateFacilityProvisioningFileData): Promise<FacilityProvisioningFile> {
    const id = data.id || uuidv4();
    const now = new Date();
    await this.db.connection('facility_provisioning_files').insert({
      id,
      facility_id: data.facility_id,
      filename: data.filename,
      content_type: data.content_type ?? null,
      size_bytes: data.size_bytes,
      sha256_hash: data.sha256_hash,
      storage_path: data.storage_path,
      upload_source: data.upload_source || 'dashboard',
      created_by: data.created_by ?? null,
      uploaded_at: now,
      created_at: now,
      updated_at: now,
    });
    return (await this.findById(id))!;
  }

  async deleteById(id: string): Promise<boolean> {
    const deleted = await this.db.connection('facility_provisioning_files').where('id', id).delete();
    return deleted > 0;
  }
}
