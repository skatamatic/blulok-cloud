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

/** Exposed for unit tests only — allows tests to set up handleChunkAck state. */
export const _testActivePushes = activePushes;

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

    // Reject if gateway already has an active push for this target type
    const existingPush = await this.pushModel.findActiveByGateway(gatewayId, targetType);
    if (existingPush) {
      throw new Error(`Gateway already has an active ${targetType} firmware push (id=${existingPush.id}, status=${existingPush.status})`);
    }

    // Warn if compatible_models doesn't match gateway model (non-blocking)
    if (firmware.compatible_models && firmware.compatible_models.length > 0 && gateway.model) {
      if (!firmware.compatible_models.includes(gateway.model)) {
        logger.warn(`Firmware ${firmware.version} compatible_models [${firmware.compatible_models.join(',')}] may not match gateway model '${gateway.model}' — proceeding anyway`);
      }
    }

    // Create push record with target_type denormalized from firmware image
    const push = await this.pushModel.create({
      firmware_id: firmwareId,
      gateway_id: gatewayId,
      facility_id: facilityId,
      target_type: targetType,
      initiated_by: userId,
    });

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
      await this.pushModel.updateChunksTotal(pushId, totalChunks);

      // Sign and send manifest
      const manifestPayload = {
        cmd_type: 'FIRMWARE_MANIFEST',
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

      await this.pushModel.updateStatus(pushId, 'transferring');

      // Send manifest with retry (fire-and-wait for first chunk ACK to confirm receipt)
      let manifestDelivered = false;
      for (let attempt = 0; attempt < MAX_CHUNK_RETRIES && !manifestDelivered; attempt++) {
        if (pushState.cancel) {
          logger.info(`Firmware push cancelled during manifest delivery pushId=${pushId}`);
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

      this.broadcastProgress(push, 'manifest_sent', 0, totalChunks, 0);

      // Send chunks with flow control
      for (let i = 0; i < totalChunks; i++) {
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
  static async handleUpdateStatus(facilityId: string, msg: any): Promise<void> {
    const { nonce, status: gwStatus, version, error: gwError, target_type: targetType } = msg;

    // Schema validation: enforce field types and limits
    if (typeof gwStatus !== 'string' || gwStatus.length === 0 || gwStatus.length > 64) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: invalid status (type=${typeof gwStatus}) facility=${facilityId}`);
      return;
    }
    if (nonce !== undefined && (typeof nonce !== 'string' || nonce.length > 128)) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: invalid nonce facility=${facilityId}`);
      return;
    }
    if (version !== undefined && (typeof version !== 'string' || version.length > 64)) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: invalid version facility=${facilityId}`);
      return;
    }
    if (gwError !== undefined && (typeof gwError !== 'string' || gwError.length > 2000)) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: invalid error field facility=${facilityId}`);
      return;
    }
    if (targetType !== undefined && (typeof targetType !== 'string' || targetType.length > 32)) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: invalid target_type facility=${facilityId}`);
      return;
    }

    logger.info(`Firmware update status from facility=${facilityId}: status=${gwStatus} version=${version} target=${targetType}`);

    // Find the push by matching nonce, or fall back to facility + target_type lookup
    let matchedPush: FirmwarePush | null = null;

    // Try nonce match first (most precise)
    if (nonce) {
      for (const [pushId, pushState] of activePushes.entries()) {
        if (pushState.nonce === nonce && pushState.facilityId === facilityId) {
          matchedPush = await this.pushModel.findById(pushId);
          break;
        }
      }
    }

    // Fall back to DB lookup: most recent push for this facility's gateway with matching target_type
    if (!matchedPush && targetType) {
      const pushes = await this.pushModel.findByFacilityAndTargetType(facilityId, targetType);
      matchedPush = pushes[0] || null;
    }

    if (!matchedPush) {
      logger.warn(`FIRMWARE_UPDATE_STATUS: no matching push found for facility=${facilityId} nonce=${nonce} target=${targetType}`);
      return;
    }

    // Map gateway status to push status
    if (gwStatus === 'success' || gwStatus === 'applied') {
      // Gateway confirmed firmware applied successfully — update if not already complete
      if (matchedPush.status !== 'complete') {
        await this.pushModel.updateStatus(matchedPush.id, 'complete');
        this.broadcastProgress(matchedPush, 'complete', 100);
        logger.info(`Firmware update confirmed by gateway pushId=${matchedPush.id} version=${version}`);
      }
    } else if (gwStatus === 'failed' || gwStatus === 'error') {
      const errorMsg = gwError || `Gateway reported firmware update failure: ${gwStatus}`;
      await this.pushModel.updateStatus(matchedPush.id, 'failed', errorMsg);
      this.broadcastProgress(matchedPush, 'failed', 0, undefined, undefined, errorMsg);
      logger.error(`Firmware update failed on gateway pushId=${matchedPush.id}: ${errorMsg}`);
    } else if (gwStatus === 'verifying') {
      await this.pushModel.updateStatus(matchedPush.id, 'verifying');
      this.broadcastProgress(matchedPush, 'verifying', 100);
    } else {
      logger.warn(`FIRMWARE_UPDATE_STATUS: unknown status '${gwStatus}' from facility=${facilityId}`);
    }
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
    const { nonce, progress_percent, phase, message: gwMessage, devices, error: gwError, target_type: targetType } = msg;

    if (typeof nonce !== 'string' || nonce.length === 0 || nonce.length > 128) {
      logger.warn(`FIRMWARE_PROGRESS: invalid nonce facility=${facilityId}`);
      return;
    }

    // Find the push by nonce + facilityId (in-memory), then fall back to DB
    let matchedPush: FirmwarePush | null = null;
    for (const [pushId, pushState] of activePushes.entries()) {
      if (pushState.nonce === nonce && pushState.facilityId === facilityId) {
        matchedPush = await this.pushModel.findById(pushId);
        break;
      }
    }
    if (!matchedPush && targetType) {
      const pushes = await this.pushModel.findByFacilityAndTargetType(facilityId, targetType);
      matchedPush = pushes[0] || null;
    }
    if (!matchedPush) {
      logger.warn(`FIRMWARE_PROGRESS: no matching push for facility=${facilityId} nonce=${nonce}`);
      return;
    }

    // Skip progress on terminal pushes to prevent stale/duplicate updates
    const TERMINAL: FirmwarePushStatus[] = ['complete', 'failed', 'cancelled'];
    if (TERMINAL.includes(matchedPush.status)) {
      logger.info(`FIRMWARE_PROGRESS ignored for terminal push pushId=${matchedPush.id} status=${matchedPush.status}`);
      return;
    }

    logger.info(`FIRMWARE_PROGRESS received pushId=${matchedPush.id} percent=${progress_percent} phase=${phase} devices=${devices?.length ?? 0}`);

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

    if (Array.isArray(devices) && devices.length > 0) {
      computedDevicesComplete = 0;
      computedDevicesFailed = 0;
      for (const dev of devices) {
        if (!dev?.device_id || typeof dev.device_id !== 'string') continue;
        events.push({
          push_id: matchedPush.id,
          event_type: 'device_status',
          device_id: dev.device_id,
          device_status: typeof dev.status === 'string' ? dev.status : 'pending',
          progress_percent: typeof dev.progress_percent === 'number' ? dev.progress_percent : undefined,
          error_message: typeof dev.error === 'string' ? dev.error : undefined,
          reported_at: now,
        });
        if (dev.status === 'complete') computedDevicesComplete++;
        if (dev.status === 'failed') computedDevicesFailed++;
      }
      computedDevicesTotal = devices.length;
      await this.pushModel.updateDeviceCounts(matchedPush.id, computedDevicesTotal, computedDevicesComplete, computedDevicesFailed);
    }

    // Error event
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

    // Determine the effective step: if a critical error auto-failed the push, use 'failed'
    const effectiveStep: FirmwarePushStatus | 'manifest_sent' =
      (gwError?.severity === 'critical') ? 'failed' : matchedPush.status;

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
        devices: Array.isArray(devices) ? devices : undefined,
        error: gwError,
      },
    );
  }

  // =========================================================================
  // Disconnect Handling
  // =========================================================================

  /**
   * Handle a gateway facility disconnection. Cancels any active firmware
   * pushes for the disconnected facility so they fail immediately instead
   * of waiting for per-chunk ACK timeouts.
   */
  static handleFacilityDisconnect(facilityId: string): void {
    for (const [pushId, pushState] of activePushes.entries()) {
      if (pushState.facilityId === facilityId && !pushState.cancel) {
        pushState.cancel = true;
        logger.info(`Firmware push cancelled due to gateway disconnect pushId=${pushId} facility=${facilityId}`);
      }
    }
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

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
