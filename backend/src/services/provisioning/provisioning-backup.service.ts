/**
 * Gateway provisioning backup upload finalize, catalog, delete, and upload requests.
 */

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  GatewayProvisioningBackupModel,
  sanitizeProvisioningBackup,
  type ProvisioningUploadSource,
  type SanitizedGatewayProvisioningBackup,
} from '@/models/gateway-provisioning-backup.model';
import { GatewayModel } from '@/models/gateway.model';
import {
  getProvisioningStorageProvider,
  validateProvisioningFilename,
  validateProvisioningFileSize,
  type ProvisioningSignedUploadSession,
} from '@/services/provisioning/provisioning-storage.factory';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import {
  PROVISIONING_PENDING_UPLOAD_TTL_MS,
  PROVISIONING_UPLOAD_RATE_LIMIT_MAX,
  PROVISIONING_UPLOAD_RATE_LIMIT_WINDOW_MS,
  PROVISIONING_UPLOAD_REQUEST_TTL_SEC,
} from '@/constants/provisioning.constants';
import { logger } from '@/utils/logger';

interface PendingUploadSession {
  gatewayId: string;
  facilityId: string;
  backupId: string;
  filename: string;
  sizeBytes: number;
  storagePath: string;
  uploadToken?: string;
  createdAt: number;
}

interface PendingCloudUploadRequest {
  gatewayId: string;
  facilityId: string;
  userId: string;
  requestId: string;
  expiresAtMs: number;
}

const pendingUploads = new Map<string, PendingUploadSession>();
const pendingCloudUploadRequests = new Map<string, PendingCloudUploadRequest>();
const uploadRateBuckets = new Map<string, { count: number; windowStart: number }>();

export class ProvisioningBackupService {
  private static backupModel = new GatewayProvisioningBackupModel();
  private static gatewayModel = new GatewayModel();

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

  static async prepareUpload(
    facilityId: string,
    filename: string,
    sizeBytes: number,
    clientOrigin?: string,
  ): Promise<ProvisioningSignedUploadSession & { gateway_id: string }> {
    this.assertUploadRateLimit(facilityId);

    const filenameErrors = validateProvisioningFilename(filename);
    const sizeErrors = validateProvisioningFileSize(sizeBytes);
    const errors = [...filenameErrors, ...sizeErrors];
    if (errors.length > 0) {
      throw new Error(`Provisioning validation failed: ${errors.join('; ')}`);
    }

    const gateway = await this.gatewayModel.findByFacilityId(facilityId);
    if (!gateway) {
      throw new Error('Gateway not found for facility');
    }
    if (gateway.facility_id !== facilityId) {
      throw new Error('Gateway facility mismatch');
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    if (!storage.supportsSignedUpload()) {
      throw new Error('Signed upload is not supported for provisioning storage');
    }

    const backupId = uuidv4();
    const safeFilename = path.basename(filename);
    const session = await storage.createSignedUploadSession(
      gateway.id,
      backupId,
      safeFilename,
      clientOrigin,
    );

    pendingUploads.set(backupId, {
      gatewayId: gateway.id,
      facilityId,
      backupId,
      filename: safeFilename,
      sizeBytes,
      storagePath: session.storage_path,
      uploadToken: session.upload_token,
      createdAt: Date.now(),
    });
    await this.pruneExpiredPendingUploads();

    logger.info(`Provisioning upload prepared backupId=${backupId} gateway=${gateway.id} facility=${facilityId} size=${sizeBytes}`);
    return { ...session, gateway_id: gateway.id };
  }

  static async completeUpload(
    facilityId: string,
    uploadId: string,
    filename: string,
    sizeBytes: number,
    uploadSource: ProvisioningUploadSource = 'gateway_push',
    createdBy?: string | null,
  ): Promise<SanitizedGatewayProvisioningBackup> {
    this.assertUploadRateLimit(facilityId);

    const pending = pendingUploads.get(uploadId);
    if (!pending) {
      throw new Error('Unknown or expired upload session');
    }
    if (pending.facilityId !== facilityId) {
      throw new Error('Upload session facility mismatch');
    }

    const safeFilename = path.basename(filename);
    if (safeFilename !== pending.filename) {
      throw new Error('Filename does not match prepared upload session');
    }
    if (sizeBytes !== pending.sizeBytes) {
      throw new Error('Size does not match prepared upload session');
    }

    const filenameErrors = validateProvisioningFilename(safeFilename);
    const sizeErrors = validateProvisioningFileSize(sizeBytes);
    const errors = [...filenameErrors, ...sizeErrors];
    if (errors.length > 0) {
      throw new Error(`Provisioning validation failed: ${errors.join('; ')}`);
    }

    let resolvedCreatedBy = createdBy ?? null;
    if (uploadSource === 'cloud_requested' && !resolvedCreatedBy) {
      const cloudRequest = this.consumeCloudUploadRequest(pending.gatewayId, facilityId);
      if (cloudRequest) {
        resolvedCreatedBy = cloudRequest.userId;
      }
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    const storagePath = pending.storagePath;

    if (!(await storage.fileExists(storagePath))) {
      throw new Error('Uploaded provisioning backup not found in storage. Complete the signed URL upload first.');
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
      const row = await this.backupModel.create({
        id: uploadId,
        gateway_id: pending.gatewayId,
        facility_id: facilityId,
        filename: safeFilename,
        size_bytes: sizeBytes,
        sha256_hash: sha256Hash,
        storage_path: storagePath,
        upload_source: uploadSource,
        created_by: resolvedCreatedBy,
      });
      pendingUploads.delete(uploadId);
      logger.info(`Provisioning backup completed backupId=${uploadId} gateway=${pending.gatewayId} facility=${facilityId} source=${uploadSource}`);
      return sanitizeProvisioningBackup(row);
    } catch (err) {
      try {
        await storage.remove(storagePath);
      } catch {
        /* best effort */
      }
      throw err;
    }
  }

  static async listBackups(
    gatewayId: string,
    limit = 50,
    offset = 0,
  ): Promise<{ backups: SanitizedGatewayProvisioningBackup[]; total: number }> {
    const [backups, total] = await Promise.all([
      this.backupModel.findByGatewayId(gatewayId, limit, offset),
      this.backupModel.countByGatewayId(gatewayId),
    ]);
    return {
      backups: backups.map(sanitizeProvisioningBackup),
      total,
    };
  }

  static async getBackup(backupId: string): Promise<SanitizedGatewayProvisioningBackup | null> {
    const row = await this.backupModel.findById(backupId);
    return row ? sanitizeProvisioningBackup(row) : null;
  }

  static async deleteBackup(backupId: string): Promise<boolean> {
    const row = await this.backupModel.findById(backupId);
    if (!row) return false;

    const deleted = await this.backupModel.deleteById(backupId);
    if (deleted && row.storage_path) {
      try {
        const storage = await getProvisioningStorageProvider();
        await storage.initialize();
        await storage.remove(row.storage_path);
      } catch (err) {
        logger.warn(`Failed to remove provisioning backup from storage backupId=${backupId}:`, err);
      }
    }
    logger.info(`Provisioning backup deleted backupId=${backupId} gateway=${row.gateway_id}`);
    return deleted;
  }

  static async requestUploadFromGateway(
    gatewayId: string,
    facilityId: string,
    userId: string,
  ): Promise<{ request_id: string; expires_at: number }> {
    const gateway = await this.gatewayModel.findById(gatewayId);
    if (!gateway) {
      throw new Error('Gateway not found');
    }
    if (gateway.facility_id !== facilityId) {
      throw new Error('Gateway facility mismatch');
    }

    const connStatus = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
    if (!connStatus.connected) {
      throw new Error('Gateway is offline — cannot request provisioning upload');
    }

    const requestId = uuidv4();
    const expiresAt = Math.floor(Date.now() / 1000) + PROVISIONING_UPLOAD_REQUEST_TTL_SEC;
    pendingCloudUploadRequests.set(gatewayId, {
      gatewayId,
      facilityId,
      userId,
      requestId,
      expiresAtMs: expiresAt * 1000,
    });

    const payload = {
      cmd_type: 'PROVISIONING_UPLOAD_REQUEST',
      request_id: requestId,
      expires_at: expiresAt,
    };
    const jwt = await Ed25519Service.signCommandJwt(payload);

    GatewayEventsService.getInstance().unicastToFacility(facilityId, {
      type: 'PROVISIONING_UPLOAD_REQUEST',
      jwt,
    });

    logger.info(`Provisioning upload requested requestId=${requestId} gateway=${gatewayId} facility=${facilityId} by=${userId}`);
    return { request_id: requestId, expires_at: expiresAt };
  }

  static async receiveDirectUpload(uploadId: string, uploadToken: string, data: Buffer): Promise<void> {
    const pending = pendingUploads.get(uploadId);
    if (!pending) {
      throw new Error('Unknown or expired upload session');
    }
    if (!pending.uploadToken || pending.uploadToken !== uploadToken) {
      throw new Error('Invalid provisioning upload token');
    }
    if (data.length !== pending.sizeBytes) {
      throw new Error(`Upload size mismatch: expected ${pending.sizeBytes} bytes, got ${data.length}`);
    }

    const storage = await getProvisioningStorageProvider();
    await storage.initialize();
    await storage.writePreparedUpload(pending.storagePath, data);
    logger.info(`Provisioning direct upload received backupId=${uploadId} bytes=${data.length}`);
  }

  private static consumeCloudUploadRequest(
    gatewayId: string,
    facilityId: string,
  ): PendingCloudUploadRequest | null {
    const pending = pendingCloudUploadRequests.get(gatewayId);
    if (!pending) return null;
    if (pending.facilityId !== facilityId) return null;
    if (Date.now() > pending.expiresAtMs) {
      pendingCloudUploadRequests.delete(gatewayId);
      return null;
    }
    pendingCloudUploadRequests.delete(gatewayId);
    return pending;
  }

  private static async pruneExpiredPendingUploads(): Promise<void> {
    const now = Date.now();
    let storage: Awaited<ReturnType<typeof getProvisioningStorageProvider>> | null = null;

    for (const [id, session] of pendingUploads.entries()) {
      if (now - session.createdAt <= PROVISIONING_PENDING_UPLOAD_TTL_MS) continue;
      pendingUploads.delete(id);
      try {
        storage = storage || await getProvisioningStorageProvider();
        await storage.initialize();
        if (await storage.fileExists(session.storagePath)) {
          await storage.remove(session.storagePath);
          logger.info(`Cleaned up expired provisioning upload session backupId=${id} path=${session.storagePath}`);
        }
      } catch (err) {
        logger.warn(`Failed to clean up expired provisioning upload session backupId=${id}:`, err);
      }
    }

    for (const [gatewayId, request] of pendingCloudUploadRequests.entries()) {
      if (now > request.expiresAtMs) {
        pendingCloudUploadRequests.delete(gatewayId);
      }
    }
  }
}
