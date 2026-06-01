/**
 * Firmware Storage Factory
 *
 * Provides file storage for firmware binaries using the shared base storage
 * providers (Local, GCS, Google Drive).  Configuration is read from the
 * `system_settings` DB table with a GCS fallback using Application Default Credentials.
 *
 * This is intentionally a thin adapter: upload, download, remove.
 */

import * as path from 'path';
import * as crypto from 'crypto';
import {
  BaseStorageProvider,
  StorageProviderType,
  createBaseStorageProvider,
  clearBaseProviderCache,
} from '@/services/storage';
import { logger } from '@/utils/logger';

const FIRMWARE_MAX_SIZE_MB = 250;
const FIRMWARE_MAX_SIZE_BYTES = FIRMWARE_MAX_SIZE_MB * 1024 * 1024;

// ============================================================================
// Public interface (unchanged from before – no callers need to change)
// ============================================================================

export interface FirmwareSignedUploadSession {
  upload_id: string;
  storage_path: string;
  upload_url: string;
  upload_headers: Record<string, string>;
  expires_in_seconds: number;
}

export interface FirmwareStorageProvider {
  initialize(): Promise<void>;
  supportsSignedUpload(): boolean;
  buildStoragePath(firmwareId: string, filename: string): string;
  createSignedUploadSession(firmwareId: string, filename: string, sizeBytes: number): Promise<FirmwareSignedUploadSession>;
  fileExists(storagePath: string): Promise<boolean>;
  getStoredFileSize(storagePath: string): Promise<number>;
  hashStoredFile(storagePath: string): Promise<string>;
  upload(firmwareId: string, filename: string, data: Buffer): Promise<string>;
  download(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}

// ============================================================================
// Adapter that wraps any BaseStorageProvider
// ============================================================================

class FirmwareStorageAdapter implements FirmwareStorageProvider {
  constructor(private base: BaseStorageProvider) {}

  async initialize(): Promise<void> {
    await this.base.initialize();
    logger.info(`Firmware storage initialized (${this.base.type})`);
  }

  supportsSignedUpload(): boolean {
    return this.base.type === StorageProviderType.GCS;
  }

  buildStoragePath(firmwareId: string, filename: string): string {
    const safeFilename = path.basename(filename);
    if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
      throw new Error('Invalid firmware filename');
    }
    return `firmware/${firmwareId}/${safeFilename}`;
  }

  async createSignedUploadSession(
    firmwareId: string,
    filename: string,
    sizeBytes: number,
  ): Promise<FirmwareSignedUploadSession> {
    if (!this.supportsSignedUpload()) {
      throw new Error('Signed upload is not supported for this storage provider');
    }
    const storagePath = this.buildStoragePath(firmwareId, filename);
    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    const signed = await gcs.getSignedUploadUrl(storagePath, {
      contentType: 'application/octet-stream',
      minBytes: 1,
      maxBytes: sizeBytes,
      expiresSeconds: 3600,
    });
    return {
      upload_id: firmwareId,
      storage_path: storagePath,
      upload_url: signed.url,
      upload_headers: signed.headers,
      expires_in_seconds: 3600,
    };
  }

  async fileExists(storagePath: string): Promise<boolean> {
    this.assertValidFirmwarePath(storagePath);
    return this.base.fileExists(storagePath);
  }

  async getStoredFileSize(storagePath: string): Promise<number> {
    this.assertValidFirmwarePath(storagePath);
    if (this.base.type !== StorageProviderType.GCS) {
      const buffer = await this.base.downloadFile(storagePath);
      return buffer.length;
    }
    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    return gcs.getFileSize(storagePath);
  }

  async hashStoredFile(storagePath: string): Promise<string> {
    this.assertValidFirmwarePath(storagePath);
    if (this.base.type !== StorageProviderType.GCS) {
      const buffer = await this.base.downloadFile(storagePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }
    const gcs = this.base as import('@/services/storage/gcs-base.provider').GCSBaseStorage;
    return gcs.hashFileSha256(storagePath);
  }

  async upload(firmwareId: string, filename: string, data: Buffer): Promise<string> {
    const logicalPath = this.buildStoragePath(firmwareId, filename);
    await this.base.uploadFile(logicalPath, data, 'application/octet-stream');
    return logicalPath;
  }

  async download(storagePath: string): Promise<Buffer> {
    this.assertValidFirmwarePath(storagePath);
    return this.base.downloadFile(storagePath);
  }

  async remove(storagePath: string): Promise<void> {
    try {
      this.assertValidFirmwarePath(storagePath);
      await this.base.deleteFile(storagePath);
    } catch (err) {
      logger.warn(`Failed to remove firmware file at ${storagePath}:`, err);
    }
  }

  /** Ensure the storage path looks like a firmware path, not a traversal attempt */
  private assertValidFirmwarePath(storagePath: string): void {
    if (!storagePath.startsWith('firmware/')) {
      throw new Error('Path does not reference firmware storage');
    }
    if (storagePath.includes('..')) {
      throw new Error('Path traversal detected in firmware storage path');
    }
  }
}

// ============================================================================
// Provider cache and factory
// ============================================================================

let cachedProvider: FirmwareStorageProvider | null = null;
let cachedConfigJson: string | null = null;

/**
 * Build a firmware storage provider from a config object.
 * Used internally and by the admin "test config" endpoint.
 */
export function buildFirmwareStorageProvider(
  providerType: StorageProviderType | string,
  providerConfig: Record<string, unknown>,
): FirmwareStorageProvider {
  const base = createBaseStorageProvider({
    type: providerType as StorageProviderType,
    config: providerConfig,
  });
  return new FirmwareStorageAdapter(base);
}

/**
 * Get the firmware storage provider (creates and caches on first call).
 *
 * Resolution order:
 *  1. Cached instance (if config hasn't changed)
 *  2. DB system_settings keys `storage.firmware.provider_type` / `storage.firmware.provider_config`
 *  3. GCS fallback using GCS_PROJECT_ID / GCS_BUCKET_NAME env vars (or BluLok-Cloud-Dev / blulok-develop)
 */
export async function getFirmwareStorageProvider(): Promise<FirmwareStorageProvider> {
  // Try reading from DB
  const dbConfig = await loadFirmwareStorageConfig();
  const configJson = JSON.stringify(dbConfig);

  // Return cached if config unchanged
  if (cachedProvider && cachedConfigJson === configJson) {
    return cachedProvider;
  }

  let provider: FirmwareStorageProvider;

  if (dbConfig) {
    provider = buildFirmwareStorageProvider(dbConfig.providerType, dbConfig.providerConfig);
    logger.info(`Firmware storage configured from DB: ${dbConfig.providerType}`);
  } else {
    // Fallback to GCS with Application Default Credentials
    const projectId = process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev';
    const bucketName = process.env.GCS_BUCKET_NAME || 'blulok-develop';
    provider = buildFirmwareStorageProvider(StorageProviderType.GCS, { projectId, bucketName });
    logger.info(`Firmware storage using GCS fallback: ${bucketName}`);
  }

  cachedProvider = provider;
  cachedConfigJson = configJson;
  return provider;
}

/**
 * Synchronous getter for backward compatibility with existing callers.
 * Returns the cached provider or creates a GCS fallback synchronously.
 * Prefer the async version for new code.
 */
export function getFirmwareStorageProviderSync(): FirmwareStorageProvider {
  if (cachedProvider) return cachedProvider;
  // Synchronous fallback – GCS with Application Default Credentials
  const projectId = process.env.GCS_PROJECT_ID || 'BluLok-Cloud-Dev';
  const bucketName = process.env.GCS_BUCKET_NAME || 'blulok-develop';
  const provider = buildFirmwareStorageProvider(StorageProviderType.GCS, { projectId, bucketName });
  cachedProvider = provider;
  cachedConfigJson = null;
  return provider;
}

// ============================================================================
// DB config helpers
// ============================================================================

interface FirmwareStorageDbConfig {
  providerType: string;
  providerConfig: Record<string, unknown>;
}

async function loadFirmwareStorageConfig(): Promise<FirmwareStorageDbConfig | null> {
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
    // DB not available yet (e.g. during tests or startup) – fall back to local
    return null;
  }
}

/**
 * Save firmware storage config to the DB.
 */
export async function saveFirmwareStorageConfig(
  providerType: string,
  providerConfig: Record<string, unknown>,
): Promise<void> {
  const { DatabaseService } = await import('@/services/database.service');
  const db = DatabaseService.getInstance().connection;

  // Upsert provider_type
  const existingType = await db('system_settings').where({ key: 'storage.firmware.provider_type' }).first();
  if (existingType) {
    await db('system_settings').where({ key: 'storage.firmware.provider_type' }).update({ value: providerType, updated_at: db.fn.now() });
  } else {
    await db('system_settings').insert({ id: db.raw('(UUID())'), key: 'storage.firmware.provider_type', value: providerType, created_at: db.fn.now(), updated_at: db.fn.now() });
  }

  // Upsert provider_config
  const configJson = JSON.stringify(providerConfig);
  const existingConfig = await db('system_settings').where({ key: 'storage.firmware.provider_config' }).first();
  if (existingConfig) {
    await db('system_settings').where({ key: 'storage.firmware.provider_config' }).update({ value: configJson, updated_at: db.fn.now() });
  } else {
    await db('system_settings').insert({ id: db.raw('(UUID())'), key: 'storage.firmware.provider_config', value: configJson, created_at: db.fn.now(), updated_at: db.fn.now() });
  }

  // Invalidate cache so next call picks up new config
  invalidateFirmwareStorageCache();
}

// ============================================================================
// Validation helpers (unchanged)
// ============================================================================

export function validateFirmwareFile(_filename: string, sizeBytes: number): string[] {
  const errors: string[] = [];

  if (sizeBytes > FIRMWARE_MAX_SIZE_BYTES) {
    errors.push(`File size ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB exceeds maximum ${FIRMWARE_MAX_SIZE_MB}MB`);
  }
  if (sizeBytes === 0) {
    errors.push('File is empty');
  }

  return errors;
}

/** Clear the cached provider (for testing) */
export function clearFirmwareStorageCache(): void {
  cachedProvider = null;
  cachedConfigJson = null;
}

// Alias for internal use
function invalidateFirmwareStorageCache(): void {
  cachedProvider = null;
  cachedConfigJson = null;
}

export { FIRMWARE_MAX_SIZE_BYTES, FIRMWARE_MAX_SIZE_MB };
