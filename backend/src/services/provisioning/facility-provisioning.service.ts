/**
 * Facility provisioning file upload finalize, catalog, delete, and download.
 */

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  FacilityProvisioningFileModel,
  sanitizeFacilityProvisioningFile,
  type FacilityProvisioningUploadSource,
  type SanitizedFacilityProvisioningFile,
} from '@/models/facility-provisioning-file.model';
import { FacilityModel } from '@/models/facility.model';
import {
  getProvisioningStorageProvider,
  validateProvisioningFilename,
  validateProvisioningFileSize,
  type PublicProvisioningUploadSession,
} from '@/services/provisioning/provisioning-storage.factory';
import {
  PROVISIONING_PENDING_UPLOAD_TTL_MS,
  PROVISIONING_UPLOAD_RATE_LIMIT_MAX,
  PROVISIONING_UPLOAD_RATE_LIMIT_WINDOW_MS,
} from '@/constants/provisioning.constants';
import { logger } from '@/utils/logger';

interface PendingUploadSession {
  facilityId: string;
  fileId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  storagePath: string;
  uploadToken?: string;
  createdAt: number;
}

const pendingUploads = new Map<string, PendingUploadSession>();
const uploadRateBuckets = new Map<string, { count: number; windowStart: number }>();

export class FacilityProvisioningService {
  private static fileModel = new FacilityProvisioningFileModel();
  private static facilityModel = new FacilityModel();

  static assertUploadRateLimit(facilityId: string): void {
    const now = Date.now();
    const bucket = uploadRateBuckets.get(facilityId);
    if (!bucket || now - bucket.windowStart >= PROVISIONING_UPLOAD_RATE_LIMIT_WINDOW_MS) {
      uploadRateBuckets.set(facilityId, { count: 1, windowStart: now });
      return;
    }
    if (bucket.count >= PROVISIONING_UPLOAD_RATE_LIMIT_MAX) {
      throw new Error('Too many provisioning upload requests for this facility — try again shortly');
    }
    bucket.count += 1;
  }

  private static async assertFacilityExists(facilityId: string): Promise<void> {
    const facility = await this.facilityModel.findById(facilityId);
    if (!facility) {
      throw new Error('Facility not found');
    }
  }

  static async prepareUpload(
    facilityId: string,
    filename: string,
    sizeBytes: number,
    contentType?: string,
    clientOrigin?: string,
  ): Promise<PublicProvisioningUploadSession> {
    this.assertUploadRateLimit(facilityId);
    await this.assertFacilityExists(facilityId);

    const filenameErrors = validateProvisioningFilename(filename);
    const sizeErrors = validateProvisioningFileSize(sizeBytes);
    const errors = [...filenameErrors, ...sizeErrors];
    if (errors.length > 0) {
      throw new Error(`Provisioning validation failed: ${errors.join('; ')}`);
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    if (!storage.supportsSignedUpload()) {
      throw new Error('Signed upload is not supported for provisioning storage');
    }

    const fileId = uuidv4();
    const safeFilename = path.basename(filename);
    const resolvedContentType = contentType?.trim() || 'application/octet-stream';

    const session = await storage.createSignedUploadSession(
      facilityId,
      fileId,
      safeFilename,
      resolvedContentType,
      clientOrigin,
    );

    pendingUploads.set(fileId, {
      facilityId,
      fileId,
      filename: safeFilename,
      contentType: resolvedContentType,
      sizeBytes,
      storagePath: session.storage_path,
      uploadToken: session.upload_token,
      createdAt: Date.now(),
    });
    await this.pruneExpiredPendingUploads();

    logger.info(
      `Facility provisioning upload prepared fileId=${fileId} facility=${facilityId} size=${sizeBytes}`,
    );

    const { storage_path: _storagePath, ...publicSession } = session;
    return { ...publicSession, facility_id: facilityId };
  }

  static async completeUpload(
    facilityId: string,
    uploadId: string,
    filename: string,
    sizeBytes: number,
    uploadSource: FacilityProvisioningUploadSource = 'dashboard',
    createdBy?: string | null,
    contentType?: string | null,
  ): Promise<SanitizedFacilityProvisioningFile> {
    await this.assertFacilityExists(facilityId);

    const safeFilename = path.basename(filename);
    const filenameErrors = validateProvisioningFilename(safeFilename);
    const sizeErrors = validateProvisioningFileSize(sizeBytes);
    const errors = [...filenameErrors, ...sizeErrors];
    if (errors.length > 0) {
      throw new Error(`Provisioning validation failed: ${errors.join('; ')}`);
    }

    const existing = await this.fileModel.findById(uploadId);
    if (existing && existing.facility_id === facilityId) {
      pendingUploads.delete(uploadId);
      return sanitizeFacilityProvisioningFile(existing);
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();

    const pending = pendingUploads.get(uploadId);
    let storagePath: string;
    let resolvedContentType: string;

    if (pending) {
      if (pending.facilityId !== facilityId) {
        throw new Error('Upload session facility mismatch');
      }
      if (safeFilename !== pending.filename) {
        throw new Error('Filename does not match prepared upload session');
      }
      if (sizeBytes !== pending.sizeBytes) {
        throw new Error('Size does not match prepared upload session');
      }
      storagePath = pending.storagePath;
      resolvedContentType = contentType ?? pending.contentType ?? 'application/octet-stream';
    } else {
      // Stateless finalize (GCS / multi-instance): path is deterministic from upload_id + filename.
      storagePath = storage.buildStoragePath(facilityId, uploadId, safeFilename);
      resolvedContentType = contentType?.trim() || 'application/octet-stream';
    }

    if (!(await storage.fileExists(storagePath))) {
      throw new Error('Uploaded provisioning file not found in storage. Complete the signed URL upload first.');
    }

    const storedSize = await storage.getStoredFileSize(storagePath);
    if (storedSize !== sizeBytes) {
      try {
        await storage.remove(storagePath);
      } catch {
        /* best effort */
      }
      throw new Error(`Uploaded size mismatch: expected ${sizeBytes} bytes, found ${storedSize}`);
    }

    const sha256Hash = await storage.hashStoredFile(storagePath);

    try {
      const row = await this.fileModel.create({
        id: uploadId,
        facility_id: facilityId,
        filename: safeFilename,
        content_type: resolvedContentType,
        size_bytes: sizeBytes,
        sha256_hash: sha256Hash,
        storage_path: storagePath,
        upload_source: uploadSource,
        created_by: createdBy ?? null,
      });
      pendingUploads.delete(uploadId);
      logger.info(
        `Facility provisioning file completed fileId=${uploadId} facility=${facilityId} source=${uploadSource}`,
      );
      return sanitizeFacilityProvisioningFile(row);
    } catch (err) {
      try {
        await storage.remove(storagePath);
      } catch {
        /* best effort */
      }
      throw err;
    }
  }

  static async listFiles(
    facilityId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ files: SanitizedFacilityProvisioningFile[]; total: number }> {
    const [files, total] = await Promise.all([
      this.fileModel.findByFacilityId(facilityId, limit, offset),
      this.fileModel.countByFacilityId(facilityId),
    ]);
    return {
      files: files.map(sanitizeFacilityProvisioningFile),
      total,
    };
  }

  static async getFile(fileId: string): Promise<SanitizedFacilityProvisioningFile | null> {
    const row = await this.fileModel.findById(fileId);
    return row ? sanitizeFacilityProvisioningFile(row) : null;
  }

  static async streamDownload(
    fileId: string,
    facilityId: string,
  ): Promise<{ buffer: Buffer; filename: string; content_type: string; size_bytes: number }> {
    const row = await this.fileModel.findById(fileId);
    if (!row || row.facility_id !== facilityId) {
      throw new Error('Provisioning file not found');
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    const buffer = await storage.download(row.storage_path);

    return {
      buffer,
      filename: row.filename,
      content_type: row.content_type || 'application/octet-stream',
      size_bytes: row.size_bytes,
    };
  }

  static async deleteFile(fileId: string): Promise<boolean> {
    const row = await this.fileModel.findById(fileId);
    if (!row) return false;

    const deleted = await this.fileModel.deleteById(fileId);
    if (deleted && row.storage_path) {
      try {
        const storage = await getProvisioningStorageProvider();
        await storage.initialize();
        await storage.remove(row.storage_path);
      } catch (err) {
        logger.warn(`Failed to remove facility provisioning file from storage fileId=${fileId}:`, err);
      }
    }
    logger.info(`Facility provisioning file deleted fileId=${fileId} facility=${row.facility_id}`);
    return deleted;
  }

  static async receiveDirectUpload(
    facilityId: string,
    uploadId: string,
    uploadToken: string,
    data: Buffer,
  ): Promise<void> {
    const pending = pendingUploads.get(uploadId);
    if (!pending) {
      throw new Error('Unknown or expired upload session');
    }
    if (pending.facilityId !== facilityId) {
      throw new Error('Upload session facility mismatch');
    }
    if (!pending.uploadToken || pending.uploadToken !== uploadToken) {
      throw new Error('Invalid provisioning upload token');
    }
    if (data.length !== pending.sizeBytes) {
      throw new Error(`Upload size mismatch: expected ${pending.sizeBytes} bytes, got ${data.length}`);
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    await storage.writePreparedUpload(pending.storagePath, data, pending.contentType);
    logger.info(`Facility provisioning direct upload received fileId=${uploadId} bytes=${data.length}`);
  }

  private static async pruneExpiredPendingUploads(): Promise<void> {
    const now = Date.now();
    let storage: Awaited<ReturnType<typeof getProvisioningStorageProvider>> | null = null;

    for (const [id, session] of pendingUploads.entries()) {
      if (now - session.createdAt <= PROVISIONING_PENDING_UPLOAD_TTL_MS) continue;
      pendingUploads.delete(id);
      try {
        storage = storage || (await getProvisioningStorageProvider());
        await storage.initialize();
        if (await storage.fileExists(session.storagePath)) {
          await storage.remove(session.storagePath);
          logger.info(
            `Cleaned up expired facility provisioning upload session fileId=${id} path=${session.storagePath}`,
          );
        }
      } catch (err) {
        logger.warn(`Failed to clean up expired facility provisioning upload session fileId=${id}:`, err);
      }
    }
  }
}

/** Safe filename for Content-Disposition attachment headers. */
export function sanitizeContentDispositionFilename(filename: string): string {
  const sanitized = filename.replace(/[\r\n"\\]/g, '').trim();
  return sanitized || 'download';
}
