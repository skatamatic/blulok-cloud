/**
 * FirmwareService
 *
 * Handles firmware binary upload, catalog management, and chunked signed
 * delivery to gateways. Push operations run as background tasks with
 * progress broadcast via FirmwarePushSubscriptionManager.
 */

import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { FirmwareModel, FirmwareImage, CreateFirmwareImageData, FirmwareTargetType } from '@/models/firmware.model';
import { FirmwarePushModel, FirmwarePush, FirmwarePushStatus } from '@/models/firmware-push.model';
import { FirmwarePushEventModel, CreateFirmwarePushEventData } from '@/models/firmware-push-event.model';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayModel } from '@/models/gateway.model';
import { getFirmwareStorageProvider, validateFirmwareFile } from './firmware-storage.factory';
import { logger } from '@/utils/logger';

/** 128KB raw chunk size — base64 encoding yields ~171KB, well within 512KB WS limit */
const CHUNK_SIZE_BYTES = 128 * 1024;
const MAX_CHUNK_RETRIES = 3;
/** ACK timeout per chunk in milliseconds */
const CHUNK_ACK_TIMEOUT_MS = 30_000;
const VERIFY_TIMEOUT_MS = (Number(process.env.FIRMWARE_VERIFY_TIMEOUT_SEC) || 900) * 1000;
const GATEWAY_VERIFY_TIMEOUT_MS = (Number(process.env.FIRMWARE_GATEWAY_VERIFY_TIMEOUT_SEC) || 300) * 1000;
const VERIFY_DISCONNECT_GRACE_MS = (Number(process.env.FIRMWARE_VERIFY_DISCONNECT_GRACE_SEC) || 180) * 1000;
const VALID_TARGET_TYPES: FirmwareTargetType[] = ['gateway', 'lock', 'friend_node', 'access_control'];

/** Grace window to resume chunk transfer after a gateway WS drop (shorter than verify/reboot grace). */
function transferDisconnectGraceMs(): number {
  const explicit = Number(process.env.FIRMWARE_TRANSFER_DISCONNECT_GRACE_SEC);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit * 1000;
  }
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return 10_000;
  }
  return VERIFY_DISCONNECT_GRACE_MS;
}

const GATEWAY_STATUS_FAILED = new Set([
  'failed', 'error', 'failure', 'aborted',
]);
/** Intermediate gateway reports while install/relay is in progress. */
const GATEWAY_STATUS_VERIFYING = new Set(['verifying', 'applying']);
const DEVICE_STATUS_FAILED = new Set(['failed', 'error', 'failure', 'aborted']);

function resolvePushId(msg: Record<string, unknown>): string | null {
  const raw = msg.push_id ?? msg.pushId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return null;
  return trimmed;
}

function resolveTargetType(msg: Record<string, unknown>): FirmwareTargetType | undefined {
  const raw = msg.target_type ?? msg.targetType;
  if (typeof raw !== 'string') return undefined;
  return VALID_TARGET_TYPES.includes(raw as FirmwareTargetType) ? (raw as FirmwareTargetType) : undefined;
}

function verifyTimeoutForTarget(targetType: FirmwareTargetType): number {
  return targetType === 'gateway' ? GATEWAY_VERIFY_TIMEOUT_MS : VERIFY_TIMEOUT_MS;
}

/**
 * In-memory state for active push tasks.
 * Maps pushId -> resolver/rejector + cancellation flag + nonce + facilityId.
 */
interface ActivePush {
  cancel: boolean;
  nonce: string;
  facilityId: string;
  chunkAckResolvers: Map<number, { resolve: () => void; reject: (err: Error) => void }>;
}

const activePushes = new Map<string, ActivePush>();
const verifyingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const transferDisconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const resumeInFlightPushes = new Set<string>();
const resumeFacilityRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const resumeFacilityRunsInFlight = new Set<string>();

/** Exposed for unit tests only — allows tests to set up handleChunkAck state. */
export const _testActivePushes = activePushes;
export const _testResumeInFlightPushes = resumeInFlightPushes;

export interface FirmwareUpdateStatusResult {
  accepted: boolean;
  push_id?: string;
  push_status?: FirmwarePushStatus;
  reason?: string;
}

export class FirmwareService {
  private static firmwareModel = new FirmwareModel();
  private static pushModel = new FirmwarePushModel();
  private static pushEventModel = new FirmwarePushEventModel();
  private static gatewayModel = new GatewayModel();

  // =========================================================================
  // Upload
  // =========================================================================

  /**
   * Upload a firmware binary to storage and create a catalog entry.
   */
  static async uploadFirmware(
    file: { originalname: string; buffer: Buffer; size: number },
    metadata: { version: string; target_type?: FirmwareTargetType; description?: string; release_notes?: string; compatible_models?: string[]; minimum_version?: string },
    userId: string,
  ): Promise<FirmwareImage> {
    const targetType: FirmwareTargetType = metadata.target_type || 'gateway';

    // Validate file
    const errors = validateFirmwareFile(file.originalname, file.size);
    if (errors.length > 0) {
      throw new Error(`Firmware validation failed: ${errors.join('; ')}`);
    }

    // Check for duplicate version scoped to target type
    const existing = await this.firmwareModel.findByVersion(metadata.version, targetType);
    if (existing) {
      throw new Error(`Firmware version '${metadata.version}' already exists for target type '${targetType}'`);
    }

    // Compute SHA-256
    const sha256Hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    // Store binary
    const storage = await getFirmwareStorageProvider();
    await storage.initialize();
    const firmwareId = uuidv4();
    const storagePath = await storage.upload(firmwareId, file.originalname, file.buffer);

    // Create DB record — clean up stored binary if insert fails (e.g. unique constraint race)
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
      return await this.firmwareModel.create(data);
    } catch (err) {
      // Clean up orphaned binary on disk
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
   * Begin a large firmware upload. When storage supports signed URLs (GCS), the client
   * PUTs the binary directly to object storage — required on Cloud Run (32 MiB HTTP/1 limit).
   */
  static async initFirmwareUpload(
    file: { originalname: string; size: number },
    metadata: { version: string; target_type?: FirmwareTargetType; description?: string; release_notes?: string; compatible_models?: string[]; minimum_version?: string },
  ): Promise<
    | { upload_mode: 'direct_multipart' }
    | ({ upload_mode: 'signed_url' } & import('./firmware-storage.factory').FirmwareSignedUploadSession)
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
    const session = await storage.createSignedUploadSession(uploadId, file.originalname, file.size);
    return { upload_mode: 'signed_url', ...session };
  }

  /**
   * Finalize a signed-URL firmware upload after the client PUTs the binary to GCS.
   */
  static async completeFirmwareUpload(
    uploadId: string,
    file: { originalname: string; size: number },
    metadata: { version: string; target_type?: FirmwareTargetType; description?: string; release_notes?: string; compatible_models?: string[]; minimum_version?: string },
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
      return await this.firmwareModel.create(data);
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
  // Catalog
  // =========================================================================

  static async listFirmware(targetType?: FirmwareTargetType): Promise<FirmwareImage[]> {
    return this.firmwareModel.findActive(targetType);
  }

  static async getFirmware(id: string): Promise<FirmwareImage | null> {
    return this.firmwareModel.findById(id);
  }

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

  // =========================================================================
  // Push Lifecycle
  // =========================================================================

  /**
   * Expose push lookup for route-level RBAC checks (e.g. cancel).
   */
  static async getPushById(pushId: string): Promise<FirmwarePush | null> {
    return this.pushModel.findById(pushId);
  }

  /**
   * Initiate a firmware push to a gateway. Creates a push record and
   * spawns the background delivery task immediately.
   *
   * Pre-checks:
   * - Firmware exists and is active
   * - Gateway exists
   * - Gateway has an active WebSocket connection (is online)
   * - No duplicate active push for the same target type on this gateway
   * - compatible_models check (warning only — does not block)
   */
  static async initiatePush(
    firmwareId: string,
    gatewayId: string,
    facilityId: string,
    userId: string,
  ): Promise<FirmwarePush> {
    // Validate firmware exists
    const firmware = await this.firmwareModel.findById(firmwareId);
    if (!firmware || !firmware.is_active) {
      throw new Error('Firmware not found or inactive');
    }

    const targetType = firmware.target_type;

    // Validate gateway exists
    const gateway = await this.gatewayModel.findById(gatewayId);
    if (!gateway) {
      throw new Error('Gateway not found');
    }

    // Pre-check: gateway must be online (has active WebSocket connection)
    try {
      const gwEvents = GatewayEventsService.getInstance();
      const connStatus = gwEvents.getFacilityConnectionStatus(facilityId);
      if (!connStatus.connected) {
        throw new Error('Gateway is offline — cannot initiate firmware push. Ensure the gateway is connected and try again.');
      }
    } catch (err: any) {
      if (err.message?.includes('offline')) throw err;
      // If connection check fails for infrastructure reasons, log but allow push
      logger.warn(`Could not verify gateway connectivity for facility=${facilityId}: ${err.message}`);
    }

    // Warn if compatible_models doesn't match gateway model (non-blocking)
    if (firmware.compatible_models && firmware.compatible_models.length > 0 && gateway.model) {
      if (!firmware.compatible_models.includes(gateway.model)) {
        logger.warn(`Firmware ${firmware.version} compatible_models [${firmware.compatible_models.join(',')}] may not match gateway model '${gateway.model}' — proceeding anyway`);
      }
    }

    // Create push record atomically with active-push check.
    const creation = await this.pushModel.createIfNoActiveByGatewayTarget({
      firmware_id: firmwareId,
      gateway_id: gatewayId,
      facility_id: facilityId,
      target_type: targetType,
      initiated_by: userId,
    });
    if (!creation.push) {
      const existing = creation.existingPush;
      throw new Error(`Gateway already has an active ${targetType} firmware push (id=${existing?.id}, status=${existing?.status})`);
    }
    const push = creation.push;

    // Spawn background task (detached from HTTP response)
    this.executePush(push.id).catch(async err => {
      logger.error(`Firmware push task failed unexpectedly pushId=${push.id}:`, err);
      // Ensure push record does not remain orphaned in 'pending'
      try {
        const current = await this.pushModel.findById(push.id);
        if (current && !['complete', 'failed', 'cancelled'].includes(current.status)) {
          await this.pushModel.updateStatus(push.id, 'failed', `Unexpected error: ${String(err?.message || err)}`);
          this.broadcastProgress(push, 'failed', 0, undefined, undefined, 'Push failed unexpectedly');
        }
      } catch (cleanupErr) {
        logger.error(`Failed to clean up orphaned push pushId=${push.id}:`, cleanupErr);
      }
    });

    return push;
  }

  /**
   * Get the current/latest push status for a gateway, optionally scoped by target type.
   */
  static async getPushStatus(gatewayId: string, targetType?: FirmwareTargetType): Promise<FirmwarePush | null> {
    const active = await this.pushModel.findActiveByGateway(gatewayId, targetType);
    if (active) return active;
    return this.pushModel.findLatestByGateway(gatewayId, targetType);
  }

  /**
   * Get push history for a gateway, optionally scoped by target type, with pagination.
   */
  static async getPushHistory(gatewayId: string, targetType?: FirmwareTargetType, limit = 50, offset = 0): Promise<FirmwarePush[]> {
    return this.pushModel.findByGatewayId(gatewayId, targetType, limit, offset);
  }

  /**
   * Cancel an in-progress push.
   * Uses atomic status transition to prevent TOCTOU race.
   */
  static async cancelPush(pushId: string): Promise<void> {
    const push = await this.pushModel.findById(pushId);
    if (!push) throw new Error('Push not found');
    if (['complete', 'failed', 'cancelled'].includes(push.status)) {
      throw new Error(`Cannot cancel push with status '${push.status}'`);
    }

    // Atomically set cancelled — only succeeds if status is still non-terminal
    const updated = await this.pushModel.atomicCancel(pushId);
    if (!updated) {
      throw new Error('Push already completed or cancelled');
    }

    // Set cancellation flag for background task
    const active = activePushes.get(pushId);
    if (active) {
      active.cancel = true;
    }
    this.clearVerifyingTimeout(pushId);

    this.broadcastProgress(push, 'cancelled', 0);
  }

  // =========================================================================
  // Background Push Task
  // =========================================================================

  /**
   * Execute the firmware push as a background task.
   * Reads binary from storage, verifies integrity, chunks it, signs each
   * chunk, and sends over the gateway WebSocket with flow control
   * (ACK between chunks).
   */
  static async executePush(pushId: string): Promise<void> {
    let push: FirmwarePush | null = null;
    try {
      push = await this.pushModel.findById(pushId);
    } catch (err) {
      logger.error(`executePush: failed to look up push pushId=${pushId}:`, err);
      // Best-effort: try to mark as failed
      try { await this.pushModel.updateStatus(pushId, 'failed', 'Internal error during push setup'); } catch {}
      return;
    }
    if (!push) {
      logger.error(`executePush: push not found pushId=${pushId}`);
      return;
    }

    const firmware = await this.firmwareModel.findById(push.firmware_id);
    if (!firmware) {
      await this.pushModel.updateStatus(pushId, 'failed', 'Firmware record not found');
      this.broadcastProgress(push, 'failed', 0, undefined, undefined, 'Firmware record not found');
      return;
    }

    // Generate nonce for replay protection and ACK correlation
    const nonce = uuidv4();

    // Register active push with nonce and facilityId for ACK validation
    const pushState: ActivePush = {
      cancel: false,
      nonce,
      facilityId: push.facility_id,
      chunkAckResolvers: new Map(),
    };
    activePushes.set(pushId, pushState);

    try {
      if (!this.isFacilityGatewayOnline(push.facility_id)) {
        const offlineMsg = 'Gateway offline before firmware push start';
        await this.pushModel.updateStatus(pushId, 'failed', offlineMsg);
        this.broadcastProgress(push, 'failed', 0, undefined, undefined, offlineMsg);
        logger.warn(`executePush: ${offlineMsg} pushId=${pushId} facility=${push.facility_id}`);
        return;
      }

      this.clearTransferDisconnectGrace(pushId);

      // Read binary from storage
      const storage = await getFirmwareStorageProvider();
      await storage.initialize();
      const binary = await storage.download(firmware.storage_path);

      // Re-verify SHA-256 integrity of stored binary before pushing
      const storedHash = crypto.createHash('sha256').update(binary).digest('hex');
      if (storedHash !== firmware.sha256_hash) {
        const msg = `Stored binary SHA-256 mismatch: expected ${firmware.sha256_hash}, got ${storedHash}`;
        logger.error(`executePush: ${msg} pushId=${pushId}`);
        await this.pushModel.updateStatus(pushId, 'failed', msg);
        this.broadcastProgress(push, 'failed', 0, undefined, undefined, msg);
        return;
      }

      // Compute chunks
      const totalChunks = Math.ceil(binary.length / CHUNK_SIZE_BYTES);
      if (!push.chunks_total) {
        await this.pushModel.updateChunksTotal(pushId, totalChunks);
      }
      const startChunkIndex =
        push.status === 'transferring' && (push.chunks_sent ?? 0) > 0
          ? push.chunks_sent!
          : 0;
      const isResume = startChunkIndex > 0;

      // Sign and send manifest
      const manifestPayload = {
        cmd_type: 'FIRMWARE_MANIFEST',
        push_id: pushId,
        target_type: firmware.target_type,
        filename: firmware.filename,
        version: firmware.version,
        sha256: firmware.sha256_hash,
        size: firmware.size_bytes,
        chunk_count: totalChunks,
        chunk_size: CHUNK_SIZE_BYTES,
        nonce,
        compatible_models: firmware.compatible_models || [],
      };
      const manifestJwt = await Ed25519Service.signCommandJwt(manifestPayload);

      if (!isResume) {
        await this.pushModel.updateStatus(pushId, 'transferring');
      }

      // Send manifest with retry (fire-and-wait for first chunk ACK to confirm receipt)
      let manifestDelivered = false;
      for (let attempt = 0; attempt < MAX_CHUNK_RETRIES && !manifestDelivered; attempt++) {
        if (pushState.cancel) {
          logger.info(`Firmware push cancelled during manifest delivery pushId=${pushId}`);
          return;
        }
        if (!this.isFacilityGatewayOnline(push.facility_id)) {
          const offlineMsg = 'Gateway went offline during manifest delivery';
          await this.pushModel.updateStatus(pushId, 'failed', offlineMsg);
          this.broadcastProgress(push, 'failed', 0, totalChunks, 0, offlineMsg);
          logger.warn(`executePush: ${offlineMsg} pushId=${pushId} facility=${push.facility_id}`);
          return;
        }

        GatewayEventsService.getInstance().unicastToFacility(push.facility_id, {
          type: 'FIRMWARE_MANIFEST',
          jwt: manifestJwt,
        });

        // Brief pause before sending chunk 0 to give gateway time to process manifest
        await new Promise(r => setTimeout(r, 200));
        manifestDelivered = true;
      }

      if (isResume) {
        logger.info(
          `Resuming firmware push from chunk ${startChunkIndex}/${totalChunks} pushId=${pushId} facility=${push.facility_id}`,
        );
        this.broadcastProgress(
          push,
          'transferring',
          Math.round((startChunkIndex / totalChunks) * 100),
          totalChunks,
          startChunkIndex,
        );
      } else {
        this.broadcastProgress(push, 'manifest_sent', 0, totalChunks, 0);
      }

      // Send chunks with flow control
      for (let i = startChunkIndex; i < totalChunks; i++) {
        // Check cancellation
        if (pushState.cancel) {
          logger.info(`Firmware push cancelled pushId=${pushId} at chunk ${i}/${totalChunks}`);
          return;
        }

        const start = i * CHUNK_SIZE_BYTES;
        const end = Math.min(start + CHUNK_SIZE_BYTES, binary.length);
        const chunkData = binary.subarray(start, end);
        const chunkSha256 = crypto.createHash('sha256').update(chunkData).digest('hex');
        const chunkBase64 = chunkData.toString('base64');

        const chunkPayload = {
          cmd_type: 'FIRMWARE_CHUNK',
          target_type: firmware.target_type,
          nonce,
          chunk_index: i,
          chunk_sha256: chunkSha256,
          data: chunkBase64,
        };
        const chunkJwt = await Ed25519Service.signCommandJwt(chunkPayload);

        // Send chunk and wait for ACK with retries
        let acked = false;
        for (let attempt = 0; attempt < MAX_CHUNK_RETRIES && !acked; attempt++) {
          if (pushState.cancel) return;
          if (!this.isFacilityGatewayOnline(push.facility_id)) {
            const offlineMsg = `Gateway went offline before chunk ${i} delivery`;
            await this.pushModel.updateStatus(pushId, 'failed', offlineMsg);
            this.broadcastProgress(push, 'failed', 0, totalChunks, i, offlineMsg);
            logger.warn(`executePush: ${offlineMsg} pushId=${pushId} facility=${push.facility_id}`);
            return;
          }

          GatewayEventsService.getInstance().unicastToFacility(push.facility_id, {
            type: 'FIRMWARE_CHUNK',
            jwt: chunkJwt,
          });

          try {
            await this.waitForChunkAck(pushId, i, pushState, CHUNK_ACK_TIMEOUT_MS);
            acked = true;
          } catch (err) {
            logger.warn(`Firmware chunk ACK timeout pushId=${pushId} chunk=${i} attempt=${attempt + 1}/${MAX_CHUNK_RETRIES}`);
            if (attempt === MAX_CHUNK_RETRIES - 1) {
              await this.pushModel.updateStatus(pushId, 'failed', `Chunk ${i} ACK failed after ${MAX_CHUNK_RETRIES} retries`);
              this.broadcastProgress(push, 'failed', 0, totalChunks, i);
              return;
            }
          }
        }

        // Update progress
        const chunksSent = i + 1;
        await this.pushModel.updateProgress(pushId, chunksSent);
        const percent = Math.round((chunksSent / totalChunks) * 100);
        this.broadcastProgress(push, 'transferring', percent, totalChunks, chunksSent);
      }

      // All chunks delivered — transition to 'verifying' while gateway applies/relays
      // For gateway target: gateway applies directly; for lock/friend_node: BLE relay needed.
      // Final 'complete' status is set by handleUpdateStatus when the gateway reports success.
      await this.pushModel.updateStatus(pushId, 'verifying');
      this.scheduleVerifyingTimeout(push, verifyTimeoutForTarget(firmware.target_type));
      this.broadcastProgress(push, 'verifying', 100, totalChunks, totalChunks);
      logger.info(`Firmware push delivered, awaiting verification pushId=${pushId} firmware=${firmware.version} target=${firmware.target_type}`);
    } catch (err) {
      logger.error(`Firmware push failed pushId=${pushId}:`, err);
      await this.pushModel.updateStatus(pushId, 'failed', String(err));
      this.broadcastProgress(push, 'failed', 0);
    } finally {
      activePushes.delete(pushId);
    }
  }

  // =========================================================================
  // Chunk ACK Handling (called by WS transport)
  // =========================================================================

  /**
   * Handle an inbound FIRMWARE_CHUNK_ACK from the gateway.
   * Validates nonce and facilityId to prevent cross-push ACK confusion.
   */
  static async handleChunkAck(facilityId: string, msg: any): Promise<void> {
    const { nonce, chunkIndex, status, message } = msg;

    // Schema validation: enforce field types and limits
    if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 128) {
      logger.warn(`FIRMWARE_CHUNK_ACK: invalid nonce (type=${typeof nonce}, len=${String(nonce)?.length}) facility=${facilityId}`);
      return;
    }
    if (typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100_000) {
      logger.warn(`FIRMWARE_CHUNK_ACK: invalid chunkIndex=${chunkIndex} facility=${facilityId}`);
      return;
    }
    if (status !== undefined && typeof status !== 'string') {
      logger.warn(`FIRMWARE_CHUNK_ACK: invalid status type=${typeof status} facility=${facilityId}`);
      return;
    }
    if (message !== undefined && typeof message !== 'string') {
      logger.warn(`FIRMWARE_CHUNK_ACK: invalid message type=${typeof message} facility=${facilityId}`);
      return;
    }

    logger.info(`Firmware chunk ACK received facility=${facilityId} nonce=${nonce} chunk=${chunkIndex} status=${status}`);

    // Find the active push that matches both nonce AND facilityId
    for (const [pushId, pushState] of activePushes.entries()) {
      if (pushState.nonce !== nonce) continue;
      if (pushState.facilityId !== facilityId) {
        logger.warn(`Firmware chunk ACK facility mismatch: push expects ${pushState.facilityId}, got ${facilityId} (pushId=${pushId})`);
        continue;
      }

      const resolver = pushState.chunkAckResolvers.get(chunkIndex);
      if (resolver) {
        if (status === 'ok') {
          resolver.resolve();
        } else {
          resolver.reject(new Error(message || `Chunk ${chunkIndex} NAK`));
        }
        pushState.chunkAckResolvers.delete(chunkIndex);
        return;
      }
    }

    logger.warn(`Firmware chunk ACK received but no active push matches nonce=${nonce} facility=${facilityId} chunk=${chunkIndex}`);
  }

  /**
   * Handle an inbound FIRMWARE_UPDATE_STATUS from the gateway.
   * Updates the push record based on the gateway's report of whether
   * the firmware was successfully applied to the target device(s).
   */
  static async handleUpdateStatus(facilityId: string, msg: any): Promise<FirmwareUpdateStatusResult> {
    const pushId = resolvePushId(msg);
    const gwStatus = msg?.status;
    const normalizedStatus = typeof gwStatus === 'string' ? gwStatus.trim().toLowerCase() : '';
    const version = msg?.version;
    const gwError = msg?.error;
    const targetType = resolveTargetType(msg);

    const reject = (reason: string, id?: string): FirmwareUpdateStatusResult => {
      logger.warn(`FIRMWARE_UPDATE_STATUS rejected facility=${facilityId} push_id=${id || pushId || 'n/a'} reason=${reason}`);
      return { accepted: false, push_id: id || pushId || undefined, reason };
    };

    if (!normalizedStatus || normalizedStatus.length > 64) {
      return reject(`invalid status (type=${typeof gwStatus})`);
    }
    if (version !== undefined && (typeof version !== 'string' || version.length > 64)) {
      return reject('invalid version');
    }
    if (gwError !== undefined && (typeof gwError !== 'string' || gwError.length > 2000)) {
      return reject('invalid error field');
    }

    const matchedPush = await this.resolvePushForGatewayMessage(facilityId, pushId, targetType);
    if (!matchedPush) {
      if (pushId) {
        return reject('push not found', pushId);
      }
      return reject(`no matching push (missing push_id) target=${targetType || 'n/a'}`);
    }

    if (targetType && matchedPush.target_type !== targetType) {
      logger.warn(
        `FIRMWARE_UPDATE_STATUS: target_type mismatch push_id=${matchedPush.id} expected=${matchedPush.target_type} actual=${targetType} — applying via push_id`,
      );
    }

    logger.info(
      `Firmware update status from facility=${facilityId}: push_id=${matchedPush.id} status=${gwStatus} version=${version} target=${targetType || matchedPush.target_type}`,
    );

    if (normalizedStatus === 'success') {
      await this.recordGatewayStatusEvent(matchedPush.id, String(gwStatus), version, true);
      if (matchedPush.status !== 'complete') {
        await this.pushModel.updateStatus(matchedPush.id, 'complete');
        this.clearVerifyingTimeout(matchedPush.id);
        this.broadcastProgress(matchedPush, 'complete', 100);
        logger.info(`Firmware update confirmed by gateway pushId=${matchedPush.id} version=${version}`);
      }
      return { accepted: true, push_id: matchedPush.id, push_status: 'complete' };
    }

    if (GATEWAY_STATUS_FAILED.has(normalizedStatus)) {
      await this.recordGatewayStatusEvent(matchedPush.id, String(gwStatus), version, true);
      const errorMsg = gwError || `Gateway reported firmware update failure: ${gwStatus}`;
      await this.pushModel.updateStatus(matchedPush.id, 'failed', errorMsg);
      this.clearVerifyingTimeout(matchedPush.id);
      this.broadcastProgress(matchedPush, 'failed', 0, undefined, undefined, errorMsg);
      logger.error(`Firmware update failed on gateway pushId=${matchedPush.id}: ${errorMsg}`);
      return { accepted: true, push_id: matchedPush.id, push_status: 'failed' };
    }

    if (GATEWAY_STATUS_VERIFYING.has(normalizedStatus)) {
      await this.recordGatewayStatusEvent(matchedPush.id, String(gwStatus), version, true);
      if (matchedPush.status !== 'complete') {
        await this.pushModel.updateStatus(matchedPush.id, 'verifying');
        this.scheduleVerifyingTimeout(matchedPush, verifyTimeoutForTarget(matchedPush.target_type));
        this.broadcastProgress(matchedPush, 'verifying', 100);
      }
      return { accepted: true, push_id: matchedPush.id, push_status: 'verifying' };
    }

    await this.recordGatewayStatusEvent(
      matchedPush.id,
      String(gwStatus),
      version,
      false,
      `unknown status '${gwStatus}'`,
    );
    return reject(`unknown status '${gwStatus}'`, matchedPush.id);
  }

  // =========================================================================
  // Gateway Progress Reports (called by WS transport)
  // =========================================================================

  /**
   * Handle an inbound FIRMWARE_PROGRESS from the gateway.
   * Persists events and updates aggregate push state.
   * This message is entirely optional — gateways that don't send it
   * still work via FIRMWARE_CHUNK_ACK / FIRMWARE_UPDATE_STATUS.
   */
  static async handleProgress(facilityId: string, msg: any): Promise<void> {
    const pushId = resolvePushId(msg);
    const {
      progress_percent,
      phase,
      message: gwMessage,
      devices,
      error: gwError,
    } = msg;
    const targetType = resolveTargetType(msg);

    if (!pushId) {
      logger.warn(`FIRMWARE_PROGRESS: invalid push_id facility=${facilityId}`);
      return;
    }

    const normalizedDevices = (() => {
      if (!Array.isArray(devices)) return [] as Array<{ device_id: string; status: string; progress_percent?: number; error?: string }>;
      const byDeviceId = new Map<string, { device_id: string; status: string; progress_percent?: number; error?: string }>();
      for (const dev of devices) {
        const rawDeviceId = typeof dev?.device_id === 'string' ? dev.device_id : dev?.deviceId;
        if (!rawDeviceId || typeof rawDeviceId !== 'string') continue;
        const normalized = {
          device_id: rawDeviceId,
          status: typeof dev?.status === 'string' ? dev.status : 'pending',
          progress_percent: typeof dev?.progress_percent === 'number'
            ? dev.progress_percent
            : (typeof dev?.progressPercent === 'number' ? dev.progressPercent : undefined),
          error: typeof dev?.error === 'string' ? dev.error : undefined,
        };
        // Last report for a device in this payload wins.
        byDeviceId.set(rawDeviceId, normalized);
      }
      return Array.from(byDeviceId.values());
    })();

    const matchedPush = await this.resolvePushForGatewayMessage(facilityId, pushId, targetType);
    if (!matchedPush) {
      logger.warn(`FIRMWARE_PROGRESS: push not found push_id=${pushId} facility=${facilityId}`);
      return;
    }

    if (targetType && matchedPush.target_type !== targetType) {
      logger.warn(
        `FIRMWARE_PROGRESS: target_type mismatch push_id=${matchedPush.id} expected=${matchedPush.target_type} actual=${targetType} — applying via push_id`,
      );
    }

    // Skip progress on terminal pushes to prevent stale/duplicate updates
    const TERMINAL: FirmwarePushStatus[] = ['complete', 'failed', 'cancelled'];
    if (TERMINAL.includes(matchedPush.status)) {
      logger.info(`FIRMWARE_PROGRESS ignored for terminal push pushId=${matchedPush.id} status=${matchedPush.status}`);
      return;
    }

    logger.info(`FIRMWARE_PROGRESS received pushId=${matchedPush.id} percent=${progress_percent} phase=${phase} devices=${normalizedDevices.length}`);

    const now = new Date();
    const events: CreateFirmwarePushEventData[] = [];

    // Progress event
    const clampedPercent = Number.isFinite(Number(progress_percent))
      ? Math.min(100, Math.max(0, Math.round(Number(progress_percent))))
      : 0;
    const sanitizedPhase = typeof phase === 'string' ? phase : undefined;

    if (progress_percent !== undefined) {
      events.push({
        push_id: matchedPush.id,
        event_type: 'progress',
        progress_percent: clampedPercent,
        phase: sanitizedPhase,
        message: typeof gwMessage === 'string' ? gwMessage : undefined,
        reported_at: now,
      });
      await this.pushModel.updateProgressPercent(matchedPush.id, clampedPercent, sanitizedPhase);
    }

    // Device status events
    let computedDevicesTotal = matchedPush.devices_total ?? undefined;
    let computedDevicesComplete = matchedPush.devices_complete;
    let computedDevicesFailed = matchedPush.devices_failed;

    if (normalizedDevices.length > 0) {
      computedDevicesComplete = 0;
      computedDevicesFailed = 0;
      for (const dev of normalizedDevices) {
        const normalizedDeviceStatus = dev.status.trim().toLowerCase();
        events.push({
          push_id: matchedPush.id,
          event_type: 'device_status',
          device_id: dev.device_id,
          device_status: typeof dev.status === 'string' ? dev.status : 'pending',
          progress_percent: typeof dev.progress_percent === 'number' ? dev.progress_percent : undefined,
          error_message: typeof dev.error === 'string' ? dev.error : undefined,
          reported_at: now,
        });
        if (normalizedDeviceStatus === 'complete') computedDevicesComplete++;
        if (DEVICE_STATUS_FAILED.has(normalizedDeviceStatus)) computedDevicesFailed++;
      }
      computedDevicesTotal = normalizedDevices.length;
      await this.pushModel.updateDeviceCounts(matchedPush.id, computedDevicesTotal, computedDevicesComplete, computedDevicesFailed);
    }

    // Error event
    let autoFailed = false;
    if (gwError && typeof gwError === 'object' && typeof gwError.message === 'string') {
      events.push({
        push_id: matchedPush.id,
        event_type: 'error',
        error_code: typeof gwError.code === 'string' ? gwError.code : undefined,
        error_message: gwError.message,
        error_severity: (gwError.severity === 'warning' || gwError.severity === 'critical') ? gwError.severity : 'warning',
        message: typeof gwMessage === 'string' ? gwMessage : undefined,
        reported_at: now,
      });

      // Critical errors auto-fail the push
      if (gwError.severity === 'critical') {
        await this.pushModel.updateStatus(matchedPush.id, 'failed', gwError.message);
        this.clearVerifyingTimeout(matchedPush.id);
        autoFailed = true;
      }
    }

    // Info event (message without progress/error/devices)
    if (events.length === 0 && typeof gwMessage === 'string') {
      events.push({
        push_id: matchedPush.id,
        event_type: 'info',
        message: gwMessage,
        reported_at: now,
      });
    }

    // Persist all events
    if (events.length > 0) {
      await this.pushEventModel.createMany(events);
    }

    const effectiveStep: FirmwarePushStatus | 'manifest_sent' =
      autoFailed ? 'failed' : matchedPush.status;

    if (!autoFailed && matchedPush.status === 'verifying') {
      // Keep the verify window alive while the gateway is still reporting progress.
      this.scheduleVerifyingTimeout(matchedPush, verifyTimeoutForTarget(matchedPush.target_type));
    }

    this.broadcastProgress(
      matchedPush,
      effectiveStep,
      progress_percent !== undefined ? clampedPercent : matchedPush.progress_percent,
      matchedPush.chunks_total ?? undefined,
      matchedPush.chunks_sent,
      typeof gwMessage === 'string' ? gwMessage : undefined,
      {
        phase: sanitizedPhase || matchedPush.phase,
        devicesTotal: computedDevicesTotal,
        devicesComplete: computedDevicesComplete,
        devicesFailed: computedDevicesFailed,
        devices: normalizedDevices.length > 0 ? normalizedDevices : undefined,
        error: gwError,
      },
    );
  }

  // =========================================================================
  // Disconnect Handling
  // =========================================================================

  /**
   * Handle a gateway facility disconnection. Pauses in-flight chunk transfers so
   * they can resume on reconnect instead of failing immediately.
   */
  static async handleFacilityDisconnect(facilityId: string): Promise<void> {
    for (const [pushId, pushState] of activePushes.entries()) {
      if (pushState.facilityId === facilityId && !pushState.cancel) {
        pushState.cancel = true;
        // Unblock any in-flight ACK waits immediately so executePush can unwind.
        for (const resolver of pushState.chunkAckResolvers.values()) {
          try {
            resolver.reject(new Error('Gateway disconnected during firmware push'));
          } catch {}
        }
        pushState.chunkAckResolvers.clear();
        this.scheduleTransferDisconnectGrace(pushId, transferDisconnectGraceMs());
        logger.info(`Firmware push paused due to gateway disconnect pushId=${pushId} facility=${facilityId}`);
      }
    }

    // Verifying pushes are no longer in activePushes — arm a shorter grace timeout while the
    // gateway may be rebooting to apply firmware.
    try {
      const verifyingPushes = (await this.pushModel.findActiveByFacilities([facilityId]))
        .filter((push) => push.status === 'verifying');
      for (const push of verifyingPushes) {
        this.scheduleVerifyingTimeout(push, VERIFY_DISCONNECT_GRACE_MS);
        logger.info(
          `Firmware push verifying during disconnect; armed ${Math.round(VERIFY_DISCONNECT_GRACE_MS / 1000)}s grace pushId=${push.id} facility=${facilityId}`,
        );
      }
    } catch (err) {
      logger.warn(`Failed to arm verifying disconnect grace for facility=${facilityId}`, err);
    }
  }

  /**
   * Resume non-terminal firmware pushes for a facility after gateway reconnect.
   * Only pushes in pending/transferring are re-executed. Verifying pushes are
   * left as-is and await gateway status updates.
   */
  static async resumePendingForFacility(facilityId: string): Promise<void> {
    if (resumeFacilityRunsInFlight.has(facilityId)) {
      return;
    }
    resumeFacilityRunsInFlight.add(facilityId);

    try {
      if (!this.isFacilityGatewayOnline(facilityId)) {
        const existingRetry = resumeFacilityRetryTimers.get(facilityId);
        if (!existingRetry) {
          const timer = setTimeout(() => {
            resumeFacilityRetryTimers.delete(facilityId);
            this.resumePendingForFacility(facilityId).catch((err) => {
              logger.warn(`Deferred firmware resume failed for facility=${facilityId}`, err);
            });
          }, 5000);
          resumeFacilityRetryTimers.set(facilityId, timer);
        }
        return;
      }

    const existingRetry = resumeFacilityRetryTimers.get(facilityId);
    if (existingRetry) {
      clearTimeout(existingRetry);
      resumeFacilityRetryTimers.delete(facilityId);
    }

    const candidates = await this.pushModel.findActiveByFacilities([facilityId]);
    let shouldRetry = false;
    const verifyingPushes: FirmwarePush[] = [];
    for (const push of candidates) {
      if (push.status === 'verifying') {
        this.scheduleVerifyingTimeout(push, verifyTimeoutForTarget(push.target_type));
        verifyingPushes.push(push);
        continue;
      }
      if (push.status !== 'pending' && push.status !== 'transferring') {
        continue;
      }
      if (activePushes.has(push.id)) {
        // A prior execution is still unwinding after disconnect; retry shortly.
        shouldRetry = true;
        continue;
      }
      if (resumeInFlightPushes.has(push.id)) {
        continue;
      }
      resumeInFlightPushes.add(push.id);
      logger.info(`Resuming firmware push after reconnect pushId=${push.id} facility=${facilityId} status=${push.status}`);
      this.executePush(push.id).catch(async err => {
        logger.error(`Resumed firmware push failed pushId=${push.id}:`, err);
        try {
          const current = await this.pushModel.findById(push.id);
          if (current && !['complete', 'failed', 'cancelled'].includes(current.status)) {
            await this.pushModel.updateStatus(push.id, 'failed', `Resume failed: ${String(err?.message || err)}`);
            this.broadcastProgress(push, 'failed', 0, undefined, undefined, 'Push resume failed');
          }
        } catch (cleanupErr) {
          logger.error(`Failed to mark resumed push as failed pushId=${push.id}:`, cleanupErr);
        }
      }).finally(() => {
        resumeInFlightPushes.delete(push.id);
      });
    }

    if (shouldRetry && !resumeFacilityRetryTimers.has(facilityId)) {
      const timer = setTimeout(() => {
        resumeFacilityRetryTimers.delete(facilityId);
        this.resumePendingForFacility(facilityId).catch((err) => {
          logger.warn(`Deferred firmware resume failed for facility=${facilityId}`, err);
        });
      }, 1000);
      resumeFacilityRetryTimers.set(facilityId, timer);
    }

    if (verifyingPushes.length > 0) {
      this.notifyVerifyingPushesAwaitingStatus(facilityId, verifyingPushes);
    }
    } finally {
      resumeFacilityRunsInFlight.delete(facilityId);
    }
  }

  /**
   * Recover active push lifecycle timers after process startup.
   * Verifying pushes rely on in-memory timers for timeout-to-failed transitions.
   */
  static async recoverInFlightStateOnStartup(): Promise<void> {
    const activePushes = await this.pushModel.findAllActive();
    if (activePushes.length === 0) {
      return;
    }

    const now = Date.now();
    for (const push of activePushes) {
      if (push.status === 'transferring') {
        const updatedAtMs = push.updated_at ? new Date(push.updated_at).getTime() : now;
        const elapsedMs = Math.max(0, now - updatedAtMs);
        if (elapsedMs >= transferDisconnectGraceMs()) {
          const graceSec = Math.round(transferDisconnectGraceMs() / 1000);
          const failed = await this.pushModel.atomicFailIfActive(
            push.id,
            `Gateway disconnected during firmware transfer and did not reconnect within ${graceSec}s`,
          );
          if (failed) {
            const latest = await this.pushModel.findById(push.id);
            if (latest) {
              this.broadcastProgress(
                latest,
                'failed',
                latest.progress_percent || 0,
                latest.chunks_total ?? undefined,
                latest.chunks_sent,
                latest.error_message || 'Firmware transfer reconnect timeout',
              );
            }
          }
        } else {
          const remainingMs = Math.max(1000, transferDisconnectGraceMs() - elapsedMs);
          this.scheduleTransferDisconnectGrace(push.id, remainingMs);
        }
        continue;
      }

      if (push.status !== 'verifying') {
        continue;
      }

      const updatedAtMs = push.updated_at ? new Date(push.updated_at).getTime() : now;
      const elapsedMs = Math.max(0, now - updatedAtMs);
      if (elapsedMs >= verifyTimeoutForTarget(push.target_type)) {
        const failed = await this.pushModel.atomicFailIfActive(
          push.id,
          `Gateway did not report final firmware status before timeout (${Math.round(verifyTimeoutForTarget(push.target_type) / 1000)}s)`,
        );
        if (failed) {
          const latest = await this.pushModel.findById(push.id);
          if (latest) {
            this.broadcastProgress(
              latest,
              'failed',
              latest.progress_percent || 0,
              latest.chunks_total ?? undefined,
              latest.chunks_sent,
              latest.error_message || 'Firmware verification timeout',
            );
          }
        }
        continue;
      }

      const remainingMs = Math.max(1000, verifyTimeoutForTarget(push.target_type) - elapsedMs);
      this.scheduleVerifyingTimeout(push, remainingMs);
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private static async recordGatewayStatusEvent(
    pushId: string,
    gwStatus: string,
    version: string | undefined,
    accepted: boolean,
    reason?: string,
  ): Promise<void> {
    try {
      await this.pushEventModel.createMany([{
        push_id: pushId,
        event_type: 'info',
        message: accepted
          ? `Gateway status: ${gwStatus}${version ? ` (${version})` : ''}`
          : `Gateway status rejected: ${gwStatus}${reason ? ` — ${reason}` : ''}`,
        metadata: { gateway_status: gwStatus, version, accepted, reason },
        reported_at: new Date(),
      }]);
    } catch (err) {
      logger.warn(`Failed to record gateway status event pushId=${pushId}`, err);
    }
  }

  /**
   * Resolve a push from gateway telemetry. Prefer explicit push_id; otherwise fall back to the
   * single verifying push for the facility (optionally filtered by target_type).
   */
  private static async resolvePushForGatewayMessage(
    facilityId: string,
    pushId: string | null,
    targetType?: FirmwareTargetType,
  ): Promise<FirmwarePush | null> {
    if (pushId) {
      const push = await this.pushModel.findById(pushId);
      if (!push) return null;
      if (push.facility_id !== facilityId) {
        logger.warn(
          `Firmware gateway message facility mismatch push_id=${pushId} expected=${push.facility_id} actual=${facilityId}`,
        );
        return null;
      }
      return push;
    }

    const active = await this.pushModel.findActiveByFacilities([facilityId]);
    const verifying = active.filter((push) => push.status === 'verifying');
    if (verifying.length === 0) return null;

    if (targetType) {
      const match = verifying.find((push) => push.target_type === targetType);
      if (match) {
        logger.info(`Firmware gateway message resolved verifying push via target_type=${targetType} pushId=${match.id}`);
        return match;
      }
    }

    if (verifying.length === 1) {
      logger.info(`Firmware gateway message resolved sole verifying push pushId=${verifying[0].id}`);
      return verifying[0];
    }

    logger.warn(
      `Firmware gateway message ambiguous: ${verifying.length} verifying pushes for facility=${facilityId} without push_id`,
    );
    return null;
  }

  /**
   * Wait for a chunk ACK with timeout.
   */
  private static waitForChunkAck(pushId: string, chunkIndex: number, pushState: ActivePush, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pushState.chunkAckResolvers.delete(chunkIndex);
        reject(new Error(`Chunk ${chunkIndex} ACK timeout`));
      }, timeoutMs);

      pushState.chunkAckResolvers.set(chunkIndex, {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (err: Error) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  private static isFacilityGatewayOnline(facilityId: string): boolean {
    const status = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
    return status.connected;
  }

  /**
   * After reconnect, tell the gateway which pushes still await FIRMWARE_UPDATE_STATUS.
   * Gateways should persist push_id across reboot and resend terminal status when prompted.
   */
  private static notifyVerifyingPushesAwaitingStatus(facilityId: string, pushes: FirmwarePush[]): void {
    if (pushes.length === 0) return;
    GatewayEventsService.getInstance().unicastToFacility(facilityId, {
      type: 'FIRMWARE_PUSH_RESUME',
      pushes: pushes.map((push) => ({
        push_id: push.id,
        target_type: push.target_type,
        status: 'verifying' as const,
        progress_percent: push.progress_percent ?? undefined,
      })),
    });
    logger.info(
      `Notified gateway of ${pushes.length} verifying push(es) awaiting status facility=${facilityId} pushIds=${pushes.map((p) => p.id).join(',')}`,
    );
  }

  private static scheduleTransferDisconnectGrace(pushId: string, timeoutMs: number = transferDisconnectGraceMs()): void {
    this.clearTransferDisconnectGrace(pushId);
    const timer = setTimeout(async () => {
      try {
        if (activePushes.has(pushId)) {
          return;
        }
        const failed = await this.pushModel.atomicFailIfActive(
          pushId,
          `Gateway disconnected during firmware transfer and did not reconnect within ${Math.round(timeoutMs / 1000)}s`,
        );
        if (!failed) {
          return;
        }
        const latest = await this.pushModel.findById(pushId);
        if (latest) {
          this.broadcastProgress(
            latest,
            'failed',
            latest.progress_percent || 0,
            latest.chunks_total ?? undefined,
            latest.chunks_sent,
            latest.error_message || 'Gateway disconnected during firmware transfer',
          );
        }
      } catch (err) {
        logger.warn(`Failed to apply firmware transfer disconnect grace for pushId=${pushId}`, err);
      } finally {
        transferDisconnectTimeouts.delete(pushId);
      }
    }, timeoutMs);
    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
    transferDisconnectTimeouts.set(pushId, timer);
  }

  private static clearTransferDisconnectGrace(pushId: string): void {
    const timer = transferDisconnectTimeouts.get(pushId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    transferDisconnectTimeouts.delete(pushId);
  }

  private static scheduleVerifyingTimeout(push: FirmwarePush, timeoutMs: number = verifyTimeoutForTarget(push.target_type)): void {
    this.clearVerifyingTimeout(push.id);
    const timer = setTimeout(async () => {
      try {
        const failed = await this.pushModel.atomicFailIfActive(
          push.id,
          `Gateway did not report final firmware status before timeout (${Math.round(timeoutMs / 1000)}s)`,
        );
        if (!failed) {
          return;
        }
        const latest = await this.pushModel.findById(push.id);
        if (latest) {
          this.broadcastProgress(
            latest,
            'failed',
            latest.progress_percent || 0,
            latest.chunks_total ?? undefined,
            latest.chunks_sent,
            latest.error_message || 'Firmware verification timeout',
          );
        }
      } catch (err) {
        logger.warn(`Failed to apply firmware verifying timeout for pushId=${push.id}`, err);
      } finally {
        verifyingTimeouts.delete(push.id);
      }
    }, timeoutMs);
    if (typeof (timer as any).unref === 'function') {
      (timer as any).unref();
    }
    verifyingTimeouts.set(push.id, timer);
  }

  private static clearVerifyingTimeout(pushId: string): void {
    const timer = verifyingTimeouts.get(pushId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    verifyingTimeouts.delete(pushId);
  }

  /**
   * Broadcast progress update via FirmwarePushSubscriptionManager.
   */
  private static broadcastProgress(
    push: FirmwarePush,
    step: FirmwarePushStatus | 'manifest_sent',
    percent: number,
    chunksTotal?: number,
    chunksSent?: number,
    message?: string,
    extra?: {
      phase?: string;
      devicesTotal?: number;
      devicesComplete?: number;
      devicesFailed?: number;
      devices?: Array<{ device_id: string; status: string; progress_percent?: number; error?: string }>;
      error?: { code?: string; message: string; severity?: string };
    },
  ): void {
    try {
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      if (!wsService) return;

      const registry = wsService.getSubscriptionRegistry();
      if (!registry) return;

      const manager = registry.getFirmwarePushProgressManager();
      if (!manager) return;

      manager.broadcastProgress({
        pushId: push.id,
        firmwareId: push.firmware_id,
        gatewayId: push.gateway_id,
        facilityId: push.facility_id,
        targetType: push.target_type,
        step,
        percent,
        chunksTotal,
        chunksSent,
        message,
        phase: extra?.phase,
        devicesTotal: extra?.devicesTotal,
        devicesComplete: extra?.devicesComplete,
        devicesFailed: extra?.devicesFailed,
        devices: extra?.devices,
        error: extra?.error,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('Failed to broadcast firmware push progress:', err);
    }
  }
}
