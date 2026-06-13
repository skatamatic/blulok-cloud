/**
 * Provisioning backup restore — chunk push to gateway over WebSocket.
 */

import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  GatewayProvisioningRestoreModel,
  GatewayProvisioningRestoreEventModel,
  type GatewayProvisioningRestore,
  type ProvisioningRestoreStatus,
} from '@/models/gateway-provisioning-restore.model';
import {
  GatewayProvisioningBackupModel,
} from '@/models/gateway-provisioning-backup.model';
import { GatewayModel } from '@/models/gateway.model';
import { getProvisioningStorageProvider } from '@/services/provisioning/provisioning-storage.factory';
import { GatewayChunkPushEngine } from '@/services/provisioning/gateway-chunk-push.engine';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import {
  PROVISIONING_RESTORE_EVENT_PERCENT_STEP,
  PROVISIONING_RESTORE_VERIFY_TIMEOUT_SEC,
} from '@/constants/provisioning.constants';
import { FIRMWARE_CHUNK_SIZE_BYTES } from '@/constants/firmware-chunk.constants';
import { logger } from '@/utils/logger';
import type { ProvisioningRestoreProgressPayload } from '@/services/subscriptions/provisioning-restore-subscription-manager';

const VERIFY_TIMEOUT_MS = PROVISIONING_RESTORE_VERIFY_TIMEOUT_SEC * 1000;

function transferDisconnectGraceMs(): number {
  const explicit = Number(process.env.PROVISIONING_TRANSFER_DISCONNECT_GRACE_SEC);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit * 1000;
  }
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return 10_000;
  }
  return 180_000;
}

const GATEWAY_STATUS_FAILED = new Set(['failed', 'error', 'failure', 'aborted']);
const GATEWAY_STATUS_VERIFYING = new Set(['verifying', 'applying']);

const cancelledRestores = new Set<string>();
const verifyingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const transferDisconnectTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const resumeInFlightRestores = new Set<string>();
const resumeFacilityRunsInFlight = new Set<string>();
const resumeFacilityRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const _testCancelledRestores = cancelledRestores;

export interface ProvisioningRestoreStatusResult {
  accepted: boolean;
  restore_id?: string;
  restore_status?: ProvisioningRestoreStatus;
  reason?: string;
}

export class ProvisioningRestoreService {
  private static restoreModel = new GatewayProvisioningRestoreModel();
  private static restoreEventModel = new GatewayProvisioningRestoreEventModel();
  private static backupModel = new GatewayProvisioningBackupModel();
  private static gatewayModel = new GatewayModel();

  static async getRestoreById(restoreId: string): Promise<GatewayProvisioningRestore | null> {
    return this.restoreModel.findById(restoreId);
  }

  static async getRestoreStatus(gatewayId: string): Promise<{
    active: GatewayProvisioningRestore | null;
    history: GatewayProvisioningRestore[];
  }> {
    const [active, history] = await Promise.all([
      this.restoreModel.findActiveByGateway(gatewayId),
      this.restoreModel.findByGatewayId(gatewayId, 10),
    ]);
    return { active, history };
  }

  static async initiateRestore(
    backupId: string,
    gatewayId: string,
    facilityId: string,
    userId: string,
  ): Promise<GatewayProvisioningRestore> {
    const backup = await this.backupModel.findById(backupId);
    if (!backup) {
      throw new Error('Backup not found');
    }
    if (backup.gateway_id !== gatewayId) {
      throw new Error('Backup does not belong to this gateway');
    }
    if (backup.facility_id !== facilityId) {
      throw new Error('Backup facility mismatch');
    }

    const gateway = await this.gatewayModel.findById(gatewayId);
    if (!gateway) {
      throw new Error('Gateway not found');
    }

    const connStatus = GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId);
    if (!connStatus.connected) {
      throw new Error('Gateway is offline — cannot initiate restore');
    }

    const nonce = uuidv4();
    const creation = await this.restoreModel.createIfNoActive({
      backup_id: backupId,
      gateway_id: gatewayId,
      facility_id: facilityId,
      initiated_by: userId,
      nonce,
    });

    if (!creation.restore) {
      const existing = creation.existingRestore;
      throw new Error(`Gateway already has an active provisioning restore (id=${existing?.id}, status=${existing?.status})`);
    }

    const restore = creation.restore;
    await this.restoreEventModel.append(restore.id, 'restore_initiated', 'Restore initiated', {
      backup_id: backupId,
      user_id: userId,
    });
    this.broadcastProgress(restore, backup.filename, 'pending', 0);

    this.executeRestore(restore.id).catch(async (err) => {
      logger.error(`Provisioning restore task failed restoreId=${restore.id}:`, err);
      try {
        const current = await this.restoreModel.findById(restore.id);
        if (current && !['complete', 'failed', 'cancelled'].includes(current.status)) {
          await this.restoreModel.updateStatus(restore.id, 'failed', `Unexpected error: ${String(err?.message || err)}`);
          const backupRow = await this.backupModel.findById(backupId);
          this.broadcastProgress(current, backupRow?.filename || 'backup', 'failed', 0, undefined, undefined, String(err?.message || err));
        }
      } catch (cleanupErr) {
        logger.error(`Failed to clean up orphaned restore restoreId=${restore.id}:`, cleanupErr);
      }
    });

    return restore;
  }

  static async cancelRestore(restoreId: string): Promise<void> {
    const restore = await this.restoreModel.findById(restoreId);
    if (!restore) throw new Error('Restore not found');
    if (['complete', 'failed', 'cancelled'].includes(restore.status)) {
      throw new Error(`Cannot cancel restore with status '${restore.status}'`);
    }

    cancelledRestores.add(restoreId);
    GatewayChunkPushEngine.cancelPush(restoreId);
    this.clearVerifyingTimeout(restoreId);
    this.clearTransferDisconnectGrace(restoreId);

    const updated = await this.restoreModel.atomicCancel(restoreId);
    cancelledRestores.delete(restoreId);
    if (!updated) {
      throw new Error('Restore already completed or cancelled');
    }

    await this.restoreEventModel.append(restoreId, 'restore_cancelled', 'Restore cancelled by admin');
    const backup = await this.backupModel.findById(restore.backup_id);
    this.broadcastProgress(restore, backup?.filename || 'backup', 'cancelled', 0);
  }

  static async executeRestore(restoreId: string): Promise<void> {
    const initialRestore = await this.restoreModel.findById(restoreId);
    if (!initialRestore) {
      logger.error(`executeRestore: restore not found restoreId=${restoreId}`);
      return;
    }

    let restore: GatewayProvisioningRestore = initialRestore;

    const backup = await this.backupModel.findById(restore.backup_id);
    if (!backup) {
      await this.restoreModel.updateStatus(restoreId, 'failed', 'Backup record not found');
      return;
    }

    const nonce = restore.nonce || uuidv4();
    const facilityId = restore.facility_id;

    try {
      if (cancelledRestores.has(restoreId)) return;

      const storage = await getProvisioningStorageProvider();
      await storage.initialize();
      const binary = await storage.download(backup.storage_path);

      const storedHash = crypto.createHash('sha256').update(binary).digest('hex');
      if (storedHash !== backup.sha256_hash) {
        const msg = `Stored backup SHA-256 mismatch: expected ${backup.sha256_hash}, got ${storedHash}`;
        await this.restoreModel.updateStatus(restoreId, 'failed', msg);
        await this.restoreEventModel.append(restoreId, 'restore_failed', msg);
        this.broadcastProgress(restore, backup.filename, 'failed', 0, undefined, undefined, msg);
        return;
      }

      const totalChunks = Math.ceil(binary.length / FIRMWARE_CHUNK_SIZE_BYTES);
      if (!restore.chunks_total) {
        await this.restoreModel.updateChunksTotal(restoreId, totalChunks);
      }

      const startChunkIndex =
        restore.status === 'transferring' && (restore.chunks_sent ?? 0) > 0
          ? restore.chunks_sent!
          : 0;

      await this.restoreModel.updateStatus(restoreId, 'transferring');
      this.clearTransferDisconnectGrace(restoreId);

      let lastEventPercent = startChunkIndex > 0 && restore.chunks_total
        ? Math.round((startChunkIndex / restore.chunks_total) * 100)
        : -1;

      const outcome = await GatewayChunkPushEngine.executePush({
        pushId: restoreId,
        facilityId: restore.facility_id,
        nonce,
        binary,
        manifestCmdType: 'PROVISIONING_MANIFEST',
        chunkCmdType: 'PROVISIONING_CHUNK',
        manifestMessageType: 'PROVISIONING_MANIFEST',
        chunkMessageType: 'PROVISIONING_CHUNK',
        startChunkIndex,
        buildManifestPayload: (chunkCount, chunkSize) => ({
          restore_id: restoreId,
          backup_id: backup.id,
          filename: backup.filename,
          sha256: backup.sha256_hash,
          size_bytes: backup.size_bytes,
          chunk_count: chunkCount,
          chunk_size: chunkSize,
        }),
        buildChunkPayload: () => ({}),
        isCancelled: () => cancelledRestores.has(restoreId),
        isOnline: () => this.isFacilityGatewayOnline(facilityId),
        onManifestSent: async () => {
          await this.restoreEventModel.append(restoreId, 'manifest_sent', 'Manifest sent to gateway');
          this.broadcastProgress(restore, backup.filename, 'transferring', lastEventPercent > 0 ? lastEventPercent : 0, totalChunks, startChunkIndex);
        },
        onChunkProgress: async (chunksSent, chunksTotal, percent) => {
          await this.restoreModel.updateProgress(restoreId, chunksSent);
          if (lastEventPercent < 0 || percent - lastEventPercent >= PROVISIONING_RESTORE_EVENT_PERCENT_STEP || chunksSent === chunksTotal) {
            lastEventPercent = percent;
            await this.restoreEventModel.append(restoreId, 'chunk_progress', `Chunk ${chunksSent}/${chunksTotal}`, {
              percent,
              chunks_sent: chunksSent,
              chunks_total: chunksTotal,
            });
          }
          const latest = (await this.restoreModel.findById(restoreId)) ?? restore;
          restore = latest;
          this.broadcastProgress(latest, backup.filename, 'transferring', percent, chunksTotal, chunksSent);
        },
        onAllChunksSent: async (chunksTotal) => {
          await this.restoreModel.updateProgress(restoreId, chunksTotal);
          const beforeVerify = await this.restoreModel.findById(restoreId);
          if (beforeVerify && !['complete', 'failed', 'cancelled'].includes(beforeVerify.status)) {
            await this.restoreModel.updateStatus(restoreId, 'verifying');
          }
          const latest = (await this.restoreModel.findById(restoreId)) ?? restore;
          restore = latest;
          if (latest.status === 'verifying') {
            this.scheduleVerifyingTimeout(latest);
          }
          await this.restoreEventModel.append(restoreId, 'transfer_complete', 'All chunks delivered; awaiting gateway verification');
          this.broadcastProgress(latest, backup.filename, latest.status === 'complete' ? 'complete' : 'verifying', 100, chunksTotal, chunksTotal);
          logger.info(`Provisioning restore delivered, awaiting verification restoreId=${restoreId}`);
        },
        onFailed: async (message, chunksSent, chunksTotal) => {
          await this.restoreModel.updateStatus(restoreId, 'failed', message);
          await this.restoreEventModel.append(restoreId, 'restore_failed', message, {
            chunks_sent: chunksSent,
            chunks_total: chunksTotal,
          });
          const latest = (await this.restoreModel.findById(restoreId)) ?? restore;
          restore = latest;
          this.broadcastProgress(latest, backup.filename, 'failed', latest.chunks_sent || 0, chunksTotal, chunksSent, message);
        },
      });

      if (outcome.status === 'disconnect') {
        logger.info(`Provisioning restore paused on disconnect restoreId=${restoreId}`);
        return;
      }
      if (outcome.status === 'cancelled') {
        return;
      }
      if (outcome.status === 'failed') {
        const latest = await this.restoreModel.findById(restoreId);
        if (latest && !['complete', 'failed', 'cancelled'].includes(latest.status)) {
          await this.restoreModel.updateStatus(restoreId, 'failed', outcome.message);
          this.broadcastProgress(latest, backup.filename, 'failed', latest.chunks_sent || 0, latest.chunks_total ?? undefined, latest.chunks_sent, outcome.message);
        }
      }
    } catch (err) {
      logger.error(`Provisioning restore failed restoreId=${restoreId}:`, err);
      await this.restoreModel.updateStatus(restoreId, 'failed', String(err));
      await this.restoreEventModel.append(restoreId, 'restore_failed', String(err));
      restore = (await this.restoreModel.findById(restoreId)) || restore;
      this.broadcastProgress(restore, backup.filename, 'failed', 0, undefined, undefined, String(err));
    }
  }

  static async handleChunkAck(facilityId: string, msg: Record<string, unknown>): Promise<void> {
    await GatewayChunkPushEngine.handleChunkAck(facilityId, msg);
  }

  static async handleRestoreStatus(
    facilityId: string,
    msg: Record<string, unknown>,
  ): Promise<ProvisioningRestoreStatusResult> {
    const restoreIdRaw = msg.restore_id ?? msg.restoreId;
    const gwStatus = msg.status;
    const gwError = msg.error;

    const reject = (reason: string, id?: string): ProvisioningRestoreStatusResult => {
      logger.warn(`PROVISIONING_RESTORE_STATUS rejected facility=${facilityId} restore_id=${id || restoreIdRaw || 'n/a'} reason=${reason}`);
      return { accepted: false, restore_id: id || (typeof restoreIdRaw === 'string' ? restoreIdRaw : undefined), reason };
    };

    if (typeof restoreIdRaw !== 'string' || restoreIdRaw.length === 0 || restoreIdRaw.length > 128) {
      return reject('invalid restore_id');
    }

    const normalizedStatus = typeof gwStatus === 'string' ? gwStatus.trim().toLowerCase() : '';
    if (!normalizedStatus || normalizedStatus.length > 64) {
      return reject('invalid status', restoreIdRaw);
    }

    const restore = await this.restoreModel.findById(restoreIdRaw);
    if (!restore || restore.facility_id !== facilityId) {
      return reject('restore not found', restoreIdRaw);
    }

    const backup = await this.backupModel.findById(restore.backup_id);

    if (normalizedStatus === 'success') {
      if (restore.status !== 'complete') {
        await this.restoreModel.updateStatus(restore.id, 'complete');
        this.clearVerifyingTimeout(restore.id);
        await this.restoreEventModel.append(restore.id, 'restore_complete', 'Gateway reported restore success');
        this.broadcastProgress(restore, backup?.filename || 'backup', 'complete', 100, restore.chunks_total ?? undefined, restore.chunks_sent);
      }
      return { accepted: true, restore_id: restore.id, restore_status: 'complete' };
    }

    if (GATEWAY_STATUS_FAILED.has(normalizedStatus)) {
      const errorMsg = typeof gwError === 'string' ? gwError : `Gateway reported restore failure: ${gwStatus}`;
      await this.restoreModel.updateStatus(restore.id, 'failed', errorMsg);
      this.clearVerifyingTimeout(restore.id);
      await this.restoreEventModel.append(restore.id, 'restore_failed', errorMsg);
      this.broadcastProgress(restore, backup?.filename || 'backup', 'failed', restore.chunks_sent || 0, restore.chunks_total ?? undefined, restore.chunks_sent, errorMsg);
      return { accepted: true, restore_id: restore.id, restore_status: 'failed' };
    }

    if (GATEWAY_STATUS_VERIFYING.has(normalizedStatus)) {
      if (restore.status !== 'complete') {
        await this.restoreModel.updateStatus(restore.id, 'verifying');
        this.scheduleVerifyingTimeout(restore);
        this.broadcastProgress(restore, backup?.filename || 'backup', 'verifying', 100, restore.chunks_total ?? undefined, restore.chunks_sent);
      }
      return { accepted: true, restore_id: restore.id, restore_status: 'verifying' };
    }

    return reject(`unknown status '${gwStatus}'`, restore.id);
  }

  static async handleFacilityDisconnect(facilityId: string): Promise<void> {
    GatewayChunkPushEngine.pausePushOnDisconnect(facilityId);

    const activeRestores = await this.restoreModel.findActiveByFacility(facilityId);
    for (const restore of activeRestores) {
      if (restore.status === 'transferring' || restore.status === 'pending') {
        this.scheduleTransferDisconnectGrace(restore.id, transferDisconnectGraceMs());
      } else if (restore.status === 'verifying') {
        this.scheduleVerifyingTimeout(restore, transferDisconnectGraceMs());
      }
    }
  }

  static async resumePendingForFacility(facilityId: string): Promise<void> {
    if (resumeFacilityRunsInFlight.has(facilityId)) return;
    resumeFacilityRunsInFlight.add(facilityId);

    try {
      if (!this.isFacilityGatewayOnline(facilityId)) {
        if (!resumeFacilityRetryTimers.has(facilityId)) {
          const timer = setTimeout(() => {
            resumeFacilityRetryTimers.delete(facilityId);
            this.resumePendingForFacility(facilityId).catch((err) => {
              logger.warn(`Deferred provisioning restore resume failed facility=${facilityId}`, err);
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

      const candidates = await this.restoreModel.findActiveByFacility(facilityId);
      for (const restore of candidates) {
        if (restore.status === 'verifying') {
          this.scheduleVerifyingTimeout(restore, VERIFY_TIMEOUT_MS);
          this.notifyRestoreResume(facilityId, restore);
          continue;
        }
        if (restore.status !== 'pending' && restore.status !== 'transferring') continue;
        if (resumeInFlightRestores.has(restore.id)) continue;

        resumeInFlightRestores.add(restore.id);
        this.clearTransferDisconnectGrace(restore.id);
        logger.info(`Resuming provisioning restore restoreId=${restore.id} facility=${facilityId}`);
        this.executeRestore(restore.id).finally(() => {
          resumeInFlightRestores.delete(restore.id);
        });
      }
    } finally {
      resumeFacilityRunsInFlight.delete(facilityId);
    }
  }

  static async recoverInFlightStateOnStartup(): Promise<void> {
    const activeRestores = await this.restoreModel.findAllActive();
    if (activeRestores.length === 0) return;

    const now = Date.now();
    for (const restore of activeRestores) {
      if (restore.status === 'transferring' || restore.status === 'pending') {
        const updatedAtMs = restore.updated_at ? new Date(restore.updated_at).getTime() : now;
        const elapsedMs = Math.max(0, now - updatedAtMs);
        if (elapsedMs >= transferDisconnectGraceMs()) {
          const graceSec = Math.round(transferDisconnectGraceMs() / 1000);
          const failed = await this.restoreModel.atomicFailIfActive(
            restore.id,
            `Gateway disconnected during provisioning restore and did not reconnect within ${graceSec}s`,
          );
          if (failed) {
            const latest = await this.restoreModel.findById(restore.id);
            const backup = latest ? await this.backupModel.findById(latest.backup_id) : null;
            if (latest) {
              this.broadcastProgress(
                latest,
                backup?.filename || 'backup',
                'failed',
                latest.chunks_sent || 0,
                latest.chunks_total ?? undefined,
                latest.chunks_sent,
                latest.error_message || 'Restore reconnect timeout',
              );
            }
          }
        } else {
          const remainingMs = Math.max(1000, transferDisconnectGraceMs() - elapsedMs);
          this.scheduleTransferDisconnectGrace(restore.id, remainingMs);
        }
        continue;
      }

      if (restore.status !== 'verifying') continue;

      const updatedAtMs = restore.updated_at ? new Date(restore.updated_at).getTime() : now;
      const elapsedMs = Math.max(0, now - updatedAtMs);
      if (elapsedMs >= VERIFY_TIMEOUT_MS) {
        const failed = await this.restoreModel.atomicFailIfActive(
          restore.id,
          `Gateway did not report restore status within ${Math.round(VERIFY_TIMEOUT_MS / 1000)}s`,
        );
        if (failed) {
          const latest = await this.restoreModel.findById(restore.id);
          const backup = latest ? await this.backupModel.findById(latest.backup_id) : null;
          if (latest) {
            this.broadcastProgress(
              latest,
              backup?.filename || 'backup',
              'failed',
              latest.chunks_sent || 0,
              latest.chunks_total ?? undefined,
              latest.chunks_sent,
              latest.error_message || 'Restore verification timeout',
            );
          }
        }
        continue;
      }

      const remainingMs = Math.max(1000, VERIFY_TIMEOUT_MS - elapsedMs);
      this.scheduleVerifyingTimeout(restore, remainingMs);
    }
  }

  private static notifyRestoreResume(facilityId: string, restore: GatewayProvisioningRestore): void {
    GatewayEventsService.getInstance().unicastToFacility(facilityId, {
      type: 'PROVISIONING_RESTORE_RESUME',
      restores: [{
        restore_id: restore.id,
        backup_id: restore.backup_id,
        status: 'verifying',
        chunks_sent: restore.chunks_sent,
        chunks_total: restore.chunks_total,
      }],
    });
  }

  private static scheduleVerifyingTimeout(restore: GatewayProvisioningRestore, timeoutMs = VERIFY_TIMEOUT_MS): void {
    this.clearVerifyingTimeout(restore.id);
    const timer = setTimeout(async () => {
      verifyingTimeouts.delete(restore.id);
      const latest = await this.restoreModel.findById(restore.id);
      if (latest && latest.status === 'verifying') {
        await this.restoreModel.updateStatus(
          restore.id,
          'failed',
          `Gateway did not report restore status within ${Math.round(timeoutMs / 1000)}s`,
        );
        await this.restoreEventModel.append(restore.id, 'restore_failed', 'Verification timeout');
        const backup = await this.backupModel.findById(latest.backup_id);
        this.broadcastProgress(latest, backup?.filename || 'backup', 'failed', latest.chunks_sent || 0, latest.chunks_total ?? undefined, latest.chunks_sent, 'Verification timeout');
      }
    }, timeoutMs);
    verifyingTimeouts.set(restore.id, timer);
  }

  private static clearVerifyingTimeout(restoreId: string): void {
    const timer = verifyingTimeouts.get(restoreId);
    if (timer) {
      clearTimeout(timer);
      verifyingTimeouts.delete(restoreId);
    }
  }

  private static scheduleTransferDisconnectGrace(restoreId: string, graceMs: number): void {
    this.clearTransferDisconnectGrace(restoreId);
    const timer = setTimeout(async () => {
      transferDisconnectTimeouts.delete(restoreId);
      const latest = await this.restoreModel.findById(restoreId);
      if (latest && (latest.status === 'pending' || latest.status === 'transferring')) {
        const failed = await this.restoreModel.atomicFailIfActive(
          restoreId,
          `Gateway disconnected during restore and did not reconnect within ${Math.round(graceMs / 1000)}s`,
        );
        if (failed) {
          await this.restoreEventModel.append(restoreId, 'restore_failed', 'Reconnect timeout during transfer');
          const backup = await this.backupModel.findById(latest.backup_id);
          this.broadcastProgress(
            latest,
            backup?.filename || 'backup',
            'failed',
            latest.chunks_sent || 0,
            latest.chunks_total ?? undefined,
            latest.chunks_sent,
            latest.error_message || 'Reconnect timeout during transfer',
          );
        }
      }
    }, graceMs);
    transferDisconnectTimeouts.set(restoreId, timer);
  }

  private static clearTransferDisconnectGrace(restoreId: string): void {
    const timer = transferDisconnectTimeouts.get(restoreId);
    if (timer) {
      clearTimeout(timer);
      transferDisconnectTimeouts.delete(restoreId);
    }
  }

  private static isFacilityGatewayOnline(facilityId: string): boolean {
    try {
      return GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId).connected;
    } catch {
      return false;
    }
  }

  private static broadcastProgress(
    restore: GatewayProvisioningRestore,
    backupFilename: string,
    step: ProvisioningRestoreProgressPayload['step'],
    percent: number,
    chunksTotal?: number,
    chunksSent?: number,
    message?: string,
  ): void {
    try {
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      if (!wsService) return;

      const registry = wsService.getSubscriptionRegistry();
      if (!registry) return;

      const manager = registry.getProvisioningRestoreProgressManager();
      if (!manager) return;

      manager.broadcastProgress({
        restoreId: restore.id,
        backupId: restore.backup_id,
        backupFilename,
        gatewayId: restore.gateway_id,
        facilityId: restore.facility_id,
        step,
        percent,
        chunksTotal,
        chunksSent,
        message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('Failed to broadcast provisioning restore progress:', err);
    }
  }
}
