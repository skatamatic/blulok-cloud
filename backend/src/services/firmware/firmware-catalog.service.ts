/**
 * FirmwareCatalogService
 *
 * Handles firmware binary upload, catalog management, retention/pruning, and
 * delivery capability queries. Does not handle push execution or real-time state.
 *
 * Extracted from FirmwareService to isolate catalog CRUD from push runtime.
 */

import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { FirmwareModel, FirmwareImage, CreateFirmwareImageData, FirmwareTargetType } from '@/models/firmware.model';
import { FirmwarePushModel } from '@/models/firmware-push.model';
import { getFirmwareStorageProvider, validateFirmwareFile, FirmwareSignedUploadSession } from './firmware-storage.factory';
import { logger } from '@/utils/logger';
import { FIRMWARE_IMAGES_RETENTION_PER_TARGET } from '@/constants/firmware-retention.constants';

export class FirmwareCatalogService {
  private static firmwareModel = new FirmwareModel();
  private static pushModel = new FirmwarePushModel();

  // =========================================================================
  // Upload
  // =========================================================================

  /**
   * Upload a firmware binary to storage and create a catalog entry.
   */
  static async uploadFirmware(
    file: { originalname: string; buffer: Buffer; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    userId: string,
  ): Promise<FirmwareImage> {
    const targetType: FirmwareTargetType = metadata.target_type || 'gateway';

    const errors = validateFirmwareFile(file.originalname, file.size);
    if (errors.length > 0) {
      throw new Error(`Firmware validation failed: ${errors.join('; ')}`);
    }

    const existing = await this.firmwareModel.findByVersion(metadata.version, targetType);
    if (existing) {
      throw new Error(`Firmware version '${metadata.version}' already exists for target type '${targetType}'`);
    }

    const sha256Hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    const storage = await getFirmwareStorageProvider();
    await storage.initialize();
    const firmwareId = uuidv4();
    const storagePath = await storage.upload(firmwareId, file.originalname, file.buffer);

    const data: CreateFirmwareImageData = {
      version: metadata.version,
      target_type: targetType,
      filename: file.originalname,
      sha256_hash: sha256Hash,
      size_bytes: file.size,
      description: metadata.description,
      release_notes: metadata.release_notes,
      compatible_models: metadata.compatible_models,
      minimum_version: metadata.minimum_version,
      storage_path: storagePath,
      uploaded_by: userId,
    };

    try {
      const created = await this.firmwareModel.create(data);
      this.scheduleRetentionPrune(targetType);
      return created;
    } catch (err) {
      try {
        await storage.remove(storagePath);
        logger.info(`Cleaned up orphaned firmware binary after failed DB insert: ${storagePath}`);
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up orphaned firmware binary at ${storagePath}:`, cleanupErr);
      }
      throw err;
    }
  }

  /**
   * Begin a large firmware upload. When storage is GCS, the client PUTs the binary
   * to a resumable upload session — required on Cloud Run (32 MiB HTTP/1 limit).
   */
  static async initFirmwareUpload(
    file: { originalname: string; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    clientOrigin?: string,
  ): Promise<
    | { upload_mode: 'direct_multipart' }
    | ({ upload_mode: 'signed_url' } & FirmwareSignedUploadSession)
  > {
    const targetType: FirmwareTargetType = metadata.target_type || 'gateway';
    const errors = validateFirmwareFile(file.originalname, file.size);
    if (errors.length > 0) {
      throw new Error(`Firmware validation failed: ${errors.join('; ')}`);
    }

    const existing = await this.firmwareModel.findByVersion(metadata.version, targetType);
    if (existing) {
      throw new Error(`Firmware version '${metadata.version}' already exists for target type '${targetType}'`);
    }

    const storage = await getFirmwareStorageProvider();
    await storage.initialize();

    if (!storage.supportsSignedUpload()) {
      return { upload_mode: 'direct_multipart' };
    }

    const uploadId = uuidv4();
    const session = await storage.createSignedUploadSession(
      uploadId,
      file.originalname,
      file.size,
      clientOrigin,
    );
    return { upload_mode: 'signed_url', ...session };
  }

  /**
   * Finalize a signed-URL firmware upload after the client PUTs the binary to GCS.
   */
  static async completeFirmwareUpload(
    uploadId: string,
    file: { originalname: string; size: number },
    metadata: {
      version: string;
      target_type?: FirmwareTargetType;
      description?: string;
      release_notes?: string;
      compatible_models?: string[];
      minimum_version?: string;
    },
    userId: string,
  ): Promise<FirmwareImage> {
    const targetType: FirmwareTargetType = metadata.target_type || 'gateway';
    const errors = validateFirmwareFile(file.originalname, file.size);
    if (errors.length > 0) {
      throw new Error(`Firmware validation failed: ${errors.join('; ')}`);
    }

    const existing = await this.firmwareModel.findByVersion(metadata.version, targetType);
    if (existing) {
      throw new Error(`Firmware version '${metadata.version}' already exists for target type '${targetType}'`);
    }

    const storage = await getFirmwareStorageProvider();
    await storage.initialize();
    const storagePath = storage.buildStoragePath(uploadId, file.originalname);

    if (!(await storage.fileExists(storagePath))) {
      throw new Error('Uploaded firmware binary not found in storage. Complete the signed URL upload first.');
    }

    const storedSize = await storage.getStoredFileSize(storagePath);
    if (storedSize !== file.size) {
      try {
        await storage.remove(storagePath);
      } catch {
        /* best effort */
      }
      throw new Error(`Uploaded size mismatch: expected ${file.size} bytes, found ${storedSize}`);
    }

    const sha256Hash = await storage.hashStoredFile(storagePath);

    const data: CreateFirmwareImageData = {
      id: uploadId,
      version: metadata.version,
      target_type: targetType,
      filename: file.originalname,
      sha256_hash: sha256Hash,
      size_bytes: file.size,
      description: metadata.description,
      release_notes: metadata.release_notes,
      compatible_models: metadata.compatible_models,
      minimum_version: metadata.minimum_version,
      storage_path: storagePath,
      uploaded_by: userId,
    };

    try {
      const created = await this.firmwareModel.create(data);
      this.scheduleRetentionPrune(targetType);
      return created;
    } catch (err) {
      try {
        await storage.remove(storagePath);
        logger.info(`Cleaned up orphaned firmware binary after failed DB insert: ${storagePath}`);
      } catch (cleanupErr) {
        logger.warn(`Failed to clean up orphaned firmware binary at ${storagePath}:`, cleanupErr);
      }
      throw err;
    }
  }

  // =========================================================================
  // Catalog Queries
  // =========================================================================

  static async listFirmware(targetType?: FirmwareTargetType): Promise<FirmwareImage[]> {
    return this.firmwareModel.findActive(targetType);
  }

  static async getFirmware(id: string): Promise<FirmwareImage | null> {
    return this.firmwareModel.findById(id);
  }

  /**
   * Which OTA delivery modes are available given current firmware storage config.
   * v2 requires GCS signed-read (may still fail at runtime without IAM signBlob).
   */
  static async getDeliveryCapabilities(): Promise<{
    v1_available: boolean;
    v2_available: boolean;
    v2_unavailable_reason?: string;
  }> {
    try {
      const storage = await getFirmwareStorageProvider();
      if (storage.supportsSignedDownload()) {
        return { v1_available: true, v2_available: true };
      }
      return {
        v1_available: true,
        v2_available: false,
        v2_unavailable_reason:
          'v2 requires GCS firmware storage — the current provider cannot issue signed download URLs',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        v1_available: true,
        v2_available: false,
        v2_unavailable_reason: `Unable to resolve firmware storage: ${message}`,
      };
    }
  }

  // =========================================================================
  // Delete / Retention
  // =========================================================================

  /**
   * Soft-delete firmware and clean up the stored binary from disk.
   */
  static async deleteFirmware(id: string): Promise<boolean> {
    const firmware = await this.firmwareModel.findById(id);
    if (!firmware) return false;

    const deleted = await this.firmwareModel.softDelete(id);
    if (deleted && firmware.storage_path) {
      try {
        const storage = await getFirmwareStorageProvider();
        await storage.initialize();
        await storage.remove(firmware.storage_path);
        logger.info(`Firmware binary removed from storage: ${firmware.storage_path}`);
      } catch (err) {
        logger.warn(`Failed to remove firmware binary from storage (id=${id}):`, err);
      }
    }
    return deleted;
  }

  /**
   * Keep the newest {@link FIRMWARE_IMAGES_RETENTION_PER_TARGET} active packages per
   * target type. Excess packages are hard-deleted (storage + DB; push history CASCADE).
   * Packages with an in-flight push are skipped until the push terminates.
   */
  static async pruneFirmwareRetention(targetType?: FirmwareTargetType): Promise<number> {
    const types = targetType
      ? [targetType]
      : await this.firmwareModel.listDistinctTargetTypes();
    let pruned = 0;

    for (const type of types) {
      const excessIds = await this.firmwareModel.findActiveIdsBeyondRetention(
        type,
        FIRMWARE_IMAGES_RETENTION_PER_TARGET,
      );
      for (const id of excessIds) {
        try {
          if (await this.pushModel.hasNonTerminalForFirmware(id)) {
            logger.info(`Skipping firmware retention prune id=${id} — active push in progress`);
            continue;
          }
          const firmware = await this.firmwareModel.findById(id);
          if (!firmware) continue;

          if (firmware.storage_path) {
            try {
              const storage = await getFirmwareStorageProvider();
              await storage.initialize();
              await storage.remove(firmware.storage_path);
            } catch (err) {
              logger.warn(`Firmware retention: failed to remove binary id=${id}:`, err);
            }
          }

          const deleted = await this.firmwareModel.hardDelete(id);
          if (deleted) {
            pruned += 1;
            logger.info(
              `Firmware retention pruned id=${id} version=${firmware.version} target_type=${type}`,
            );
          }
        } catch (err) {
          logger.warn(`Firmware retention prune failed id=${id}:`, err);
        }
      }
    }

    return pruned;
  }

  /** Startup / fire-and-forget wrapper around {@link pruneFirmwareRetention}. */
  static scheduleRetentionPrune(targetType?: FirmwareTargetType): void {
    void this.pruneFirmwareRetention(targetType).catch((err) => {
      logger.warn('Firmware retention prune failed:', err);
    });
  }

  static async pruneFirmwareRetentionOnStartup(): Promise<void> {
    try {
      const pruned = await this.pruneFirmwareRetention();
      if (pruned > 0) {
        logger.info(`Firmware retention startup prune removed ${pruned} package(s)`);
      }
    } catch (err) {
      logger.warn('Firmware retention startup prune failed:', err);
    }
  }
}
