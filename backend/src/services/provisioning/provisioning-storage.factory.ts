/**
 * Facility provisioning file storage — reuses firmware GCS bucket with `facility-provisioning/` prefix.
 */

import * as path from 'path';
import * as crypto from 'crypto';
import {
  BaseStorageProvider,
  StorageProviderType,
  createBaseStorageProvider,
} from '@/services/storage';
import { getFirmwareStorageProvider } from '@/services/firmware/firmware-storage.factory';
import { PROVISIONING_MAX_SIZE_BYTES, PROVISIONING_MAX_SIZE_MB } from '@/constants/provisioning.constants';
import { logger } from '@/utils/logger';

export interface ProvisioningSignedUploadSession {
  upload_id: string;
  storage_path: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_in_seconds: number;
  upload_token?: string;
}

/** Client-visible prepare response — omits internal storage_path. */
export type PublicProvisioningUploadSession = Omit<ProvisioningSignedUploadSession, 'storage_path'> & {
  facility_id: string;
};

export interface ProvisioningStorageProvider {
  initialize(): Promise<void>;
  supportsSignedUpload(): boolean;
  buildStoragePath(facilityId: string, fileId: string, filename: string): string;
  createSignedUploadSession(
    facilityId: string,
    fileId: string,
    filename: string,
    contentType: string,
    clientOrigin?: string,
    directUploadPath?: string,
  ): Promise<ProvisioningSignedUploadSession>;
  fileExists(storagePath: string): Promise<boolean>;
  getStoredFileSize(storagePath: string): Promise<number>;
  hashStoredFile(storagePath: string): Promise<string>;
  download(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
  writePreparedUpload(storagePath: string, data: Buffer, contentType?: string): Promise<void>;
}

class ProvisioningStorageAdapter implements ProvisioningStorageProvider {
  constructor(private base: BaseStorageProvider) {}

  async initialize(): Promise<void> {
    await this.base.initialize();
    logger.info(`Facility provisioning storage initialized (${this.base.type})`);
  }

  supportsSignedUpload(): boolean {
    return this.base.type === StorageProviderType.GCS || this.base.type === StorageProviderType.LOCAL;
  }

  private resolveDirectUploadBaseUrl(): string {
    const explicit = process.env.API_BASE_URL?.trim();
    if (explicit) {
      return explicit.replace(/\/api\/v1\/?$/, '');
    }
    const port = process.env.PORT || '3000';
    const host = process.env.HOST || '127.0.0.1';
    return `http://${host}:${port}`;
  }

  buildStoragePath(facilityId: string, fileId: string, filename: string): string {
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
      throw new Error('Invalid provisioning filename');
    }
    return `facility-provisioning/${facilityId}/${fileId}/${safeFilename}`;
  }

  async createSignedUploadSession(
    facilityId: string,
    fileId: string,
    filename: string,
    contentType: string,
    clientOrigin?: string,
    directUploadPath?: string,
  ): Promise<ProvisioningSignedUploadSession> {
    const storagePath = this.buildStoragePath(facilityId, fileId, filename);
    const resolvedContentType = contentType || 'application/octet-stream';

    if (this.base.type === StorageProviderType.LOCAL) {
      const uploadToken = crypto.randomBytes(32).toString('hex');
      const uploadPath =
        directUploadPath ||
        `${this.resolveDirectUploadBaseUrl()}/api/v1/facilities/${facilityId}/provisioning-data/direct-upload/${fileId}`;
      return {
        upload_id: fileId,
        storage_path: storagePath,
        upload_url: uploadPath,
        upload_headers: {
          'Content-Type': resolvedContentType,
          'X-Provisioning-Upload-Token': uploadToken,
        },
        expires_in_seconds: 3600,
        upload_token: uploadToken,
      };
    }

    if (this.base.type !== StorageProviderType.GCS) {
      throw new Error('Signed upload is not supported for this storage provider');
    }

    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    const session = await gcs.createResumableUploadSession(storagePath, {
      contentType: resolvedContentType,
      origin: clientOrigin,
    });
    return {
      upload_id: fileId,
      storage_path: storagePath,
      upload_url: session.url,
      upload_headers: session.headers,
      expires_in_seconds: 3600,
    };
  }

  async fileExists(storagePath: string): Promise<boolean> {
    this.assertValidPath(storagePath);
    return this.base.fileExists(storagePath);
  }

  async getStoredFileSize(storagePath: string): Promise<number> {
    this.assertValidPath(storagePath);
    if (this.base.type !== StorageProviderType.GCS) {
      const buffer = await this.base.downloadFile(storagePath);
      return buffer.length;
    }
    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    return gcs.getFileSize(storagePath);
  }

  async hashStoredFile(storagePath: string): Promise<string> {
    this.assertValidPath(storagePath);
    if (this.base.type !== StorageProviderType.GCS) {
      const buffer = await this.base.downloadFile(storagePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }
    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    return gcs.hashFileSha256(storagePath);
  }

  async download(storagePath: string): Promise<Buffer> {
    this.assertValidPath(storagePath);
    return this.base.downloadFile(storagePath);
  }

  async writePreparedUpload(storagePath: string, data: Buffer, contentType?: string): Promise<void> {
    this.assertValidPath(storagePath);
    await this.base.uploadFile(storagePath, data, contentType || 'application/octet-stream');
  }

  async remove(storagePath: string): Promise<void> {
    try {
      this.assertValidPath(storagePath);
      await this.base.deleteFile(storagePath);
    } catch (err) {
      logger.warn(`Failed to remove provisioning file at ${storagePath}:`, err);
    }
  }

  private assertValidPath(storagePath: string): void {
    const valid =
      storagePath.startsWith('facility-provisioning/')
      || storagePath.startsWith('provisioning/')
      || storagePath.startsWith('inventory-snapshots/');
    if (!valid) {
      throw new Error('Path does not reference provisioning storage');
    }
    if (storagePath.includes('..')) {
      throw new Error('Path traversal detected in provisioning storage path');
    }
  }
}

let cachedProvider: ProvisioningStorageProvider | null = null;

export async function getProvisioningStorageProvider(): Promise<ProvisioningStorageProvider> {
  if (cachedProvider) {
    return cachedProvider;
  }
  const firmwareProvider = await getFirmwareStorageProvider();
  await firmwareProvider.initialize();
  const dbConfig = await loadFirmwareStorageConfigForProvisioning();
  let base: BaseStorageProvider;
  if (dbConfig) {
    base = createBaseStorageProvider({
      type: dbConfig.providerType as StorageProviderType,
      config: dbConfig.providerConfig,
    });
  } else {
    const projectId = process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev';
    const bucketName = process.env.GCS_BUCKET_NAME || 'blulok-develop';
    base = createBaseStorageProvider({
      type: StorageProviderType.GCS,
      config: { projectId, bucketName },
    });
  }
  cachedProvider = new ProvisioningStorageAdapter(base);
  await cachedProvider.initialize();
  return cachedProvider;
}

async function loadFirmwareStorageConfigForProvisioning(): Promise<{
  providerType: string;
  providerConfig: Record<string, unknown>;
} | null> {
  try {
    const { DatabaseService } = await import('@/services/database.service');
    const db = DatabaseService.getInstance().connection;
    const typeRow = await db('system_settings').where({ key: 'storage.firmware.provider_type' }).first();
    const configRow = await db('system_settings').where({ key: 'storage.firmware.provider_config' }).first();
    if (!typeRow) return null;
    return {
      providerType: typeRow.value,
      providerConfig: configRow ? JSON.parse(configRow.value) : {},
    };
  } catch {
    return null;
  }
}

export function validateProvisioningFilename(filename: string): string[] {
  const errors: string[] = [];
  const base = path.basename(filename || '');
  if (!base || base === '.' || base === '..') {
    errors.push('Invalid filename');
  }
  if (base !== (filename || '').trim()) {
    errors.push('Filename must not contain path separators');
  }
  if (/[\0<>:"|?*]/.test(base)) {
    errors.push('Filename contains invalid characters');
  }
  return errors;
}

export function validateProvisioningFileSize(sizeBytes: number): string[] {
  const errors: string[] = [];
  if (sizeBytes <= 0) {
    errors.push('File is empty');
  }
  if (sizeBytes > PROVISIONING_MAX_SIZE_BYTES) {
    errors.push(
      `File size ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB exceeds maximum ${PROVISIONING_MAX_SIZE_MB}MB`,
    );
  }
  return errors;
}

export function clearProvisioningStorageCache(): void {
  cachedProvider = null;
}
