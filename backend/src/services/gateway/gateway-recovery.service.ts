import { v4 as uuidv4 } from 'uuid';
import {
  BLOCKING_RECOVERY_STATUSES,
  GatewayRecovery,
  GatewayRecoveryEventModel,
  GatewayRecoveryModel,
  GatewayRecoveryStatus,
  TERMINAL_RECOVERY_STATUSES,
} from '@/models/gateway-recovery.model';
import { GatewayModel } from '@/models/gateway.model';
import { FirmwareModel } from '@/models/firmware.model';
import { FirmwarePushModel } from '@/models/firmware-push.model';
import { FirmwareService } from '@/services/firmware/firmware.service';
import { InventorySnapshotService } from '@/services/gateway/inventory-snapshot.service';
import { GatewayChunkPushEngine } from '@/services/provisioning/gateway-chunk-push.engine';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { WebsocketGatewayTransport } from '@/services/gateway/websocket-gateway.transport';
import { FIRMWARE_CHUNK_SIZE_BYTES } from '@/constants/firmware-chunk.constants';
import { RECOVERY_PROGRESS_EVENT_PERCENT_STEP } from '@/constants/provisioning.constants';
import { pickHighestSemver } from '@/utils/semver-compare.utils';
import { logger } from '@/utils/logger';
import { DatabaseService } from '@/services/database.service';

const VERIFY_TIMEOUT_MS = 5 * 60 * 1000;
const GATEWAY_STATUS_FAILED = new Set(['failed', 'error', 'failure']);
const cancelledRecoveries = new Set<string>();
const resumeInFlightRecoveries = new Set<string>();
const watchTimers = new Map<string, ReturnType<typeof setInterval>>();
const verifyTimers = new Map<string, ReturnType<typeof setTimeout>>();
const blockingFacilities = new Set<string>();
const blockingCache = new Map<string, { blocking: boolean; expiresAt: number }>();
const BLOCKING_CACHE_TTL_MS = 5_000;
const RECOVERY_PUSH_STATUSES: GatewayRecoveryStatus[] = ['firmware', 'inventory_push'];
const startupInventoryPushInFlight = new Set<string>();

export interface GatewayRecoveryProgressPayload {
  recoveryId: string;
  gatewayId: string;
  facilityId: string;
  status: GatewayRecoveryStatus;
  phase: GatewayRecoveryStatus;
  percent: number;
  message?: string;
  firmwareId?: string | null;
  inventorySnapshotId?: string | null;
  chunksTotal?: number;
  chunksSent?: number;
  error?: string;
  timestamp?: string;
}

export interface InventorySnapshotStatusResult {
  accepted: boolean;
  recovery_id?: string;
  recovery_status?: GatewayRecoveryStatus;
  reason?: string;
}

export class GatewayRecoveryService {
  private static recoveryModel = new GatewayRecoveryModel();
  private static eventModel = new GatewayRecoveryEventModel();
  private static gatewayModel = new GatewayModel();
  private static firmwareModel = new FirmwareModel();
  private static pushModel = new FirmwarePushModel();

  static async isBlockingActiveForFacility(facilityId: string): Promise<boolean> {
    try {
      const active = await this.recoveryModel.findActiveByFacility(facilityId);
      const blocking = !!active && BLOCKING_RECOVERY_STATUSES.includes(active.status);
      if (blocking) {
        blockingFacilities.add(facilityId);
      } else {
        blockingFacilities.delete(facilityId);
      }
      blockingCache.set(facilityId, {
        blocking,
        expiresAt: Date.now() + BLOCKING_CACHE_TTL_MS,
      });
      return blocking;
    } catch (err) {
      logger.warn(`Recovery blocking check failed for facility=${facilityId} — treating as blocking`, err);
      blockingFacilities.add(facilityId);
      blockingCache.set(facilityId, {
        blocking: true,
        expiresAt: Date.now() + BLOCKING_CACHE_TTL_MS,
      });
      return true;
    }
  }

  static isBlockingActiveForFacilitySync(facilityId: string): boolean {
    const cached = blockingCache.get(facilityId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.blocking;
    }
    return blockingFacilities.has(facilityId);
  }

  static isRecoveryPushTargetOnline(facilityId: string): boolean {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      return transport.isRecoveryPushTargetOnline(facilityId);
    } catch {
      return false;
    }
  }

  static async getRecoveryLinkedPushIds(facilityId: string): Promise<{
    firmwarePushId?: string;
    inventoryRecoveryId?: string;
  } | null> {
    const active = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!active || !RECOVERY_PUSH_STATUSES.includes(active.status)) return null;
    return {
      firmwarePushId: active.firmware_push_id ?? undefined,
      inventoryRecoveryId: active.status === 'inventory_push' ? active.id : undefined,
    };
  }

  static async handleRecoveryPushTargetDisconnect(facilityId: string, gatewayId: string): Promise<void> {
    const active = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!active || active.gateway_id !== gatewayId) return;

    const onlyPushIds = new Set(
      [active.firmware_push_id, active.id].filter(Boolean) as string[],
    );
    if (onlyPushIds.size > 0) {
      GatewayChunkPushEngine.pausePushOnDisconnect(facilityId, { onlyPushIds });
    }

    const { FirmwareService } = await import('@/services/firmware/firmware.service');
    await FirmwareService.handleFacilityDisconnect(facilityId, { disconnectedSessionRole: 'swap_candidate' });

    if (active.status === 'inventory_push') {
      logger.info(`Recovery inventory push paused on swap candidate disconnect facility=${facilityId}`);
    }
  }

  static async detect(
    facilityId: string,
    newGatewayId: string,
    previousGatewayId: string,
  ): Promise<GatewayRecovery | null> {
    const creation = await this.recoveryModel.createIfNoActive({
      facility_id: facilityId,
      gateway_id: newGatewayId,
      previous_gateway_id: previousGatewayId,
      status: 'detected',
    });
    let recovery = creation.recovery ?? creation.existingRecovery;
    if (!recovery) return null;

    if (creation.recovery) {
      await this.eventModel.append(recovery.id, 'detected', 'New gateway GUID detected — swap candidate parked');
      this.broadcastProgress(recovery, 0, 'New gateway detected');
    } else if (creation.existingRecovery && creation.existingRecovery.gateway_id !== newGatewayId) {
      const updated = await this.recoveryModel.updateActiveGatewayId(
        facilityId,
        creation.existingRecovery.id,
        newGatewayId,
      );
      if (updated) {
        recovery = updated;
        await this.eventModel.append(
          updated.id,
          updated.status,
          `Swap candidate updated — now tracking gateway ${newGatewayId}`,
        );
        this.broadcastProgress(updated, 0, 'Swap candidate updated');
      }
    }
    await this.refreshBlockingState(facilityId);
    return recovery;
  }

  static async getStatusForGateway(gatewayId: string): Promise<GatewayRecovery | null> {
    return this.recoveryModel.findLatestByGateway(gatewayId);
  }

  static async getStatusForFacility(facilityId: string): Promise<GatewayRecovery | null> {
    const active = await this.recoveryModel.findActiveByFacility(facilityId);
    if (active) return active;
    return this.recoveryModel.findLatestByFacility(facilityId);
  }

  static getSwapCandidates(facilityId: string): Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      return transport.getSwapCandidatesForFacility(facilityId);
    } catch {
      return [];
    }
  }

  static async resolveDefaultFirmwareId(): Promise<string | null> {
    const images = await this.firmwareModel.findAll(true, 'gateway');
    if (images.length === 0) return null;
    const highest = pickHighestSemver(images);
    return highest?.id ?? images[0].id;
  }

  static async getRecoveryOptions(gatewayId: string, _facilityId: string): Promise<{
    firmwareOptions: Array<{ id: string; version: string; label: string }>;
    defaultFirmwareId: string | null;
  }> {
    const firmwareImages = await this.firmwareModel.findAll(true, 'gateway');
    const firmwareOptions = firmwareImages.map((image) => ({
      id: image.id,
      version: image.version,
      label: `${image.version}${image.description ? ` — ${image.description}` : ''}`,
    }));

    return {
      firmwareOptions,
      defaultFirmwareId: await this.resolveDefaultFirmwareId(),
    };
  }

  static async getRecoveryEvents(recoveryId: string, limit = 100): Promise<Array<{
    id: string;
    phase: string;
    message: string | null;
    progress_percent: number | null;
    created_at: Date;
  }>> {
    const events = await this.eventModel.findByRecoveryId(recoveryId, limit);
    return events.map((event) => ({
      id: event.id,
      phase: event.phase,
      message: event.message,
      progress_percent: event.progress_percent,
      created_at: event.created_at,
    }));
  }

  static async getRecoveryById(recoveryId: string): Promise<GatewayRecovery | null> {
    return this.recoveryModel.findById(recoveryId);
  }

  /**
   * Ensures an active `detected` recovery exists for a swap candidate (e.g. after cancel or page reload).
   */
  private static async ensureActiveRecoveryForGateway(
    gatewayId: string,
    facilityId: string,
  ): Promise<GatewayRecovery> {
    let recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (recovery?.gateway_id === gatewayId) {
      return recovery;
    }
    if (recovery && recovery.gateway_id !== gatewayId) {
      throw new Error('Another gateway recovery is already active for this facility');
    }

    const boundGateway = await this.gatewayModel.findByFacilityId(facilityId);
    const previousGatewayId = boundGateway?.id && boundGateway.id !== gatewayId
      ? boundGateway.id
      : null;
    if (!previousGatewayId) {
      throw new Error('No active recovery for this gateway');
    }

    const detected = await this.detect(facilityId, gatewayId, previousGatewayId);
    if (!detected || detected.gateway_id !== gatewayId) {
      throw new Error('No active recovery for this gateway');
    }
    return detected;
  }

  static async initiate(
    gatewayId: string,
    facilityId: string,
    userId: string,
    options?: { firmwareId?: string },
  ): Promise<GatewayRecovery> {
    let recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.gateway_id !== gatewayId) {
      recovery = await this.ensureActiveRecoveryForGateway(gatewayId, facilityId);
    }

    const firmwareId = options?.firmwareId ?? await this.resolveDefaultFirmwareId();

    await this.validateRecoveryOptionIds(firmwareId);

    if (!firmwareId) {
      throw new Error('No gateway firmware available for recovery');
    }

    await this.recoveryModel.updateFields(recovery.id, {
      status: 'awaiting_config',
      firmware_id: firmwareId,
      initiated_by: userId,
    });
    recovery = (await this.recoveryModel.findById(recovery.id))!;
    await this.eventModel.append(recovery.id, 'awaiting_config', 'Recovery configured — starting firmware phase');
    this.broadcastProgress(recovery, 5, 'Recovery initiated');
    await this.startFirmwarePhase(recovery.id);
    return (await this.recoveryModel.findById(recovery.id))!;
  }

  static async advance(gatewayId: string, facilityId: string): Promise<GatewayRecovery> {
    const recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.gateway_id !== gatewayId) {
      throw new Error('No active recovery for this gateway');
    }
    if (recovery.status === 'awaiting_config') {
      await this.startFirmwarePhase(recovery.id);
    } else if (recovery.status === 'firmware') {
      await this.startInventoryPushPhase(recovery.id);
    } else {
      throw new Error(`Cannot advance recovery in status '${recovery.status}'`);
    }
    return (await this.recoveryModel.findById(recovery.id))!;
  }

  static async bypass(gatewayId: string, facilityId: string, userId: string, confirm: boolean): Promise<GatewayRecovery> {
    if (!confirm) {
      throw new Error('Bypass requires confirm: true');
    }
    const recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.gateway_id !== gatewayId) {
      throw new Error('No active recovery for this gateway');
    }
    cancelledRecoveries.add(recovery.id);
    GatewayChunkPushEngine.cancelPush(recovery.id);
    this.clearWatch(recovery.id);
    this.clearVerifyTimeout(recovery.id);
    if (recovery.firmware_push_id) {
      try {
        await FirmwareService.cancelPush(recovery.firmware_push_id);
      } catch { /* ignore */ }
    }
    await this.recoveryModel.updateStatus(recovery.id, 'bypassed');
    await this.eventModel.append(recovery.id, 'bypassed', 'Recovery bypassed by operator', 100, { user_id: userId });
    await this.finalizeRecovery(recovery, true);
    const updated = (await this.recoveryModel.findById(recovery.id))!;
    this.broadcastProgress(updated, 100, 'Recovery bypassed — inventory sync unblocked');
    cancelledRecoveries.delete(recovery.id);
    await this.refreshBlockingState(facilityId);
    return updated;
  }

  static async retry(gatewayId: string, facilityId: string): Promise<GatewayRecovery> {
    const recovery = await this.recoveryModel.findLatestByGateway(gatewayId);
    if (!recovery || recovery.facility_id !== facilityId || recovery.status !== 'failed') {
      throw new Error('Retry is only available when recovery has failed');
    }

    const otherActive = await this.recoveryModel.findActiveByFacility(facilityId);
    if (otherActive && otherActive.id !== recovery.id) {
      throw new Error('Another recovery is already active for this facility — cancel it before retrying');
    }

    cancelledRecoveries.delete(recovery.id);
    this.clearVerifyTimeout(recovery.id);
    await this.recoveryModel.updateFields(recovery.id, { error_message: null });

    const retryPhase = await this.resolveRetryPhase(recovery);
    if (retryPhase === 'inventory_push') {
      await this.startInventoryPushPhase(recovery.id);
    } else {
      await this.startFirmwarePhase(recovery.id);
    }
    await this.refreshBlockingState(facilityId);
    return (await this.recoveryModel.findById(recovery.id))!;
  }

  private static async resolveRetryPhase(
    recovery: GatewayRecovery,
  ): Promise<'firmware' | 'inventory_push'> {
    if (recovery.firmware_push_id) {
      const push = await this.pushModel.findById(recovery.firmware_push_id);
      if (push?.status === 'complete') {
        return 'inventory_push';
      }
    }
    return 'firmware';
  }

  static async cancel(recoveryId: string): Promise<void> {
    const recovery = await this.recoveryModel.findById(recoveryId);
    if (!recovery) throw new Error('Recovery not found');
    if (TERMINAL_RECOVERY_STATUSES.includes(recovery.status)) {
      throw new Error(`Cannot cancel recovery with status '${recovery.status}'`);
    }
    cancelledRecoveries.add(recoveryId);
    GatewayChunkPushEngine.cancelPush(recoveryId);
    this.clearWatch(recoveryId);
    this.clearVerifyTimeout(recoveryId);
    if (recovery.firmware_push_id) {
      try {
        await FirmwareService.cancelPush(recovery.firmware_push_id);
      } catch { /* ignore */ }
    }
    const updated = await this.recoveryModel.atomicCancel(recoveryId);
    cancelledRecoveries.delete(recoveryId);
    if (!updated) throw new Error('Recovery already completed or cancelled');
    await this.eventModel.append(recoveryId, 'cancelled', 'Recovery cancelled by operator');
    this.clearRecoveryPushTarget(recovery.facility_id);
    await this.refreshBlockingState(recovery.facility_id);
    this.broadcastProgress(recovery, 0, 'Recovery cancelled', 'cancelled');
  }

  private static async startFirmwarePhase(recoveryId: string): Promise<void> {
    const recovery = await this.recoveryModel.findById(recoveryId);
    if (!recovery || !recovery.firmware_id) return;
    if (cancelledRecoveries.has(recoveryId)) return;

    await this.recoveryModel.updateStatus(recoveryId, 'firmware');
    await this.eventModel.append(recoveryId, 'firmware', 'Starting firmware update phase', 10);
    this.broadcastProgress(recovery, 10, 'Firmware update starting');
    this.armRecoveryPushTarget(recovery.facility_id, recovery.gateway_id);
    await this.refreshBlockingState(recovery.facility_id);

    try {
      const push = await FirmwareService.initiatePush(
        recovery.firmware_id,
        recovery.gateway_id,
        recovery.facility_id,
        recovery.initiated_by || recovery.gateway_id,
      );
      await this.recoveryModel.updateFields(recoveryId, { firmware_push_id: push.id });
      this.startWatch(recoveryId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firmware push failed to start';
      logger.error(`Recovery firmware phase failed recoveryId=${recoveryId}:`, err);
      await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
      await this.eventModel.append(recoveryId, 'failed', message);
      const latest = (await this.recoveryModel.findById(recoveryId))!;
      this.broadcastProgress(latest, 0, message, 'failed');
      this.clearRecoveryPushTarget(recovery.facility_id);
      await this.refreshBlockingState(recovery.facility_id);
    }
  }

  private static async startInventoryPushPhase(recoveryId: string): Promise<void> {
    const recovery = await this.recoveryModel.findById(recoveryId);
    if (!recovery) return;
    if (cancelledRecoveries.has(recoveryId)) return;

    const stored = await InventorySnapshotService.buildAndStoreForFacility(
      recovery.facility_id,
      recovery.gateway_id,
    );
    const nonce = uuidv4();
    await this.recoveryModel.updateFields(recoveryId, {
      status: 'inventory_push',
      inventory_snapshot_id: stored.snapshotId,
      inventory_nonce: nonce,
      inventory_chunks_sent: 0,
      inventory_chunks_total: null,
    });
    await this.eventModel.append(recoveryId, 'inventory_push', 'Starting inventory snapshot push', 40);
    const latest = (await this.recoveryModel.findById(recoveryId))!;
    this.broadcastProgress(latest, 40, 'Inventory snapshot push starting');
    this.armRecoveryPushTarget(recovery.facility_id, recovery.gateway_id);
    await this.refreshBlockingState(recovery.facility_id);
    this.executeInventoryPush(recoveryId).catch((err) => {
      logger.error(`Inventory push failed recoveryId=${recoveryId}:`, err);
    });
    this.startWatch(recoveryId);
  }

  private static async executeInventoryPush(recoveryId: string): Promise<void> {
    const initial = await this.recoveryModel.findById(recoveryId);
    if (!initial?.inventory_snapshot_id) return;

    const { binary, snapshot } = await InventorySnapshotService.loadSnapshotBinary(initial.inventory_snapshot_id);
    const nonce = initial.inventory_nonce || uuidv4();
    const facilityId = initial.facility_id;
    const totalChunks = Math.ceil(binary.length / FIRMWARE_CHUNK_SIZE_BYTES);

    if (!initial.inventory_chunks_total) {
      await this.recoveryModel.updateInventoryProgress(recoveryId, initial.inventory_chunks_sent || 0, totalChunks);
    }

    const startChunkIndex =
      initial.status === 'inventory_push' && (initial.inventory_chunks_sent ?? 0) > 0
        ? initial.inventory_chunks_sent!
        : 0;

    let lastEventPercent = startChunkIndex > 0 && totalChunks
      ? Math.round((startChunkIndex / totalChunks) * 100)
      : -1;

    const outcome = await GatewayChunkPushEngine.executePush({
      pushId: recoveryId,
      facilityId,
      nonce,
      binary,
      manifestCmdType: 'INVENTORY_SNAPSHOT_MANIFEST',
      chunkCmdType: 'INVENTORY_SNAPSHOT_CHUNK',
      manifestMessageType: 'INVENTORY_SNAPSHOT_MANIFEST',
      chunkMessageType: 'INVENTORY_SNAPSHOT_CHUNK',
      startChunkIndex,
      buildManifestPayload: (chunkCount, chunkSize) => ({
        recovery_id: recoveryId,
        snapshot_id: snapshot.id,
        sha256: snapshot.sha256_hash,
        size_bytes: snapshot.size_bytes,
        device_count: snapshot.device_count,
        chunk_count: chunkCount,
        chunk_size: chunkSize,
      }),
      buildChunkPayload: () => ({}),
      isCancelled: () => cancelledRecoveries.has(recoveryId),
      isOnline: () => this.isRecoveryTargetOnline(facilityId),
      onManifestSent: async () => {
        await this.eventModel.append(recoveryId, 'inventory_push', 'Inventory manifest sent', lastEventPercent > 0 ? lastEventPercent : 40);
      },
      onChunkProgress: async (chunksSent, chunksTotal, percent) => {
        await this.recoveryModel.updateInventoryProgress(recoveryId, chunksSent, chunksTotal);
        const mappedPercent = 40 + Math.round(percent * 0.55);
        if (lastEventPercent < 0 || mappedPercent - lastEventPercent >= RECOVERY_PROGRESS_EVENT_PERCENT_STEP || chunksSent === chunksTotal) {
          lastEventPercent = mappedPercent;
          const latest = (await this.recoveryModel.findById(recoveryId))!;
          this.broadcastProgress(latest, mappedPercent, `Inventory chunk ${chunksSent}/${chunksTotal}`);
        }
      },
      onAllChunksSent: async () => {
        await this.recoveryModel.updateInventoryProgress(recoveryId, totalChunks, totalChunks);
        await this.eventModel.append(recoveryId, 'inventory_push', 'All inventory chunks delivered; awaiting gateway verification', 95);
        const latest = (await this.recoveryModel.findById(recoveryId))!;
        this.broadcastProgress(latest, 95, 'Awaiting gateway inventory snapshot verification');
        this.startVerifyTimeout(recoveryId, facilityId);
      },
      onFailed: async (message) => {
        await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
        await this.eventModel.append(recoveryId, 'failed', message);
        const latest = (await this.recoveryModel.findById(recoveryId))!;
        this.broadcastProgress(latest, 0, message, 'failed');
        this.clearRecoveryPushTarget(facilityId);
        await this.refreshBlockingState(facilityId);
      },
    });

    if (outcome.status === 'disconnect') {
      logger.info(`Inventory push paused on disconnect recoveryId=${recoveryId}`);
    }
  }

  static async handleChunkAck(facilityId: string, msg: Record<string, unknown>): Promise<void> {
    await GatewayChunkPushEngine.handleChunkAck(facilityId, msg);
  }

  static async handleSnapshotStatus(
    facilityId: string,
    msg: Record<string, unknown>,
  ): Promise<InventorySnapshotStatusResult> {
    const recoveryIdRaw = msg.recovery_id ?? msg.recoveryId;
    const gwStatus = msg.status;
    const gwError = msg.error;

    const reject = (reason: string, id?: string): InventorySnapshotStatusResult => {
      logger.warn(`INVENTORY_SNAPSHOT_STATUS rejected facility=${facilityId} recovery_id=${id || recoveryIdRaw || 'n/a'} reason=${reason}`);
      return { accepted: false, recovery_id: id || (typeof recoveryIdRaw === 'string' ? recoveryIdRaw : undefined), reason };
    };

    if (typeof recoveryIdRaw !== 'string' || recoveryIdRaw.length === 0) {
      return reject('invalid recovery_id');
    }

    const normalizedStatus = typeof gwStatus === 'string' ? gwStatus.trim().toLowerCase() : '';
    if (!normalizedStatus) {
      return reject('invalid status', recoveryIdRaw);
    }

    const recovery = await this.recoveryModel.findById(recoveryIdRaw);
    if (!recovery || recovery.facility_id !== facilityId) {
      return reject('recovery not found', recoveryIdRaw);
    }

    if (normalizedStatus === 'success') {
      if (recovery.status !== 'inventory_push') {
        return reject(`recovery not in inventory_push phase (status=${recovery.status})`, recovery.id);
      }
      this.clearVerifyTimeout(recovery.id);
      await this.recoveryModel.updateStatus(recovery.id, 'complete');
      this.clearWatch(recovery.id);
      await this.eventModel.append(recovery.id, 'complete', 'Gateway confirmed inventory snapshot', 100);
      await this.finalizeRecovery(recovery, false);
      const updated = (await this.recoveryModel.findById(recovery.id))!;
      this.broadcastProgress(updated, 100, 'Recovery complete — inventory sync unblocked', 'complete');
      await this.refreshBlockingState(facilityId);
      return { accepted: true, recovery_id: recovery.id, recovery_status: 'complete' };
    }

    if (GATEWAY_STATUS_FAILED.has(normalizedStatus)) {
      if (recovery.status !== 'inventory_push') {
        return reject(`recovery failure status only accepted during inventory_push (status=${recovery.status})`, recovery.id);
      }
      this.clearVerifyTimeout(recovery.id);
      const errorMsg = typeof gwError === 'string' ? gwError : `Gateway reported inventory snapshot failure: ${gwStatus}`;
      await this.recoveryModel.updateStatus(recovery.id, 'failed', errorMsg);
      this.clearWatch(recovery.id);
      await this.eventModel.append(recovery.id, 'failed', errorMsg);
      this.broadcastProgress(recovery, 0, errorMsg, 'failed');
      this.clearRecoveryPushTarget(facilityId);
      await this.refreshBlockingState(facilityId);
      return { accepted: true, recovery_id: recovery.id, recovery_status: 'failed' };
    }

    return reject(`unknown status '${gwStatus}'`, recovery.id);
  }

  private static async finalizeRecovery(recovery: GatewayRecovery, _bypassed: boolean): Promise<void> {
    const knex = DatabaseService.getInstance().connection;
    const oldId = recovery.previous_gateway_id;
    const newId = recovery.gateway_id;

    await knex.transaction(async (trx) => {
      if (oldId && oldId !== newId) {
        await trx('blulok_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        await trx('access_control_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        await trx('gateway_inventory_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        await trx('gateways').where('id', oldId).update({ facility_id: null, status: 'offline', updated_at: new Date() });
      }

      await trx('gateways').where('id', newId).update({
        facility_id: recovery.facility_id,
        status: 'online',
        updated_at: new Date(),
      });
    });

    this.clearRecoveryPushTarget(recovery.facility_id);
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      transport.finalizeRecoverySession(recovery.facility_id, newId, oldId);
    } catch { /* ignore in tests */ }
  }

  private static startWatch(recoveryId: string): void {
    if (watchTimers.has(recoveryId)) return;
    const timer = setInterval(() => {
      this.checkChildProgress(recoveryId).catch((err) => {
        logger.warn(`Recovery watch error recoveryId=${recoveryId}`, err);
      });
    }, 2000);
    watchTimers.set(recoveryId, timer);
  }

  private static clearWatch(recoveryId: string): void {
    const timer = watchTimers.get(recoveryId);
    if (timer) {
      clearInterval(timer);
      watchTimers.delete(recoveryId);
    }
  }

  private static async checkChildProgress(recoveryId: string): Promise<void> {
    const recovery = await this.recoveryModel.findById(recoveryId);
    if (!recovery || TERMINAL_RECOVERY_STATUSES.includes(recovery.status)) {
      this.clearWatch(recoveryId);
      return;
    }

    if (recovery.status === 'firmware' && recovery.firmware_push_id) {
      const push = await this.pushModel.findById(recovery.firmware_push_id);
      if (push?.status === 'complete') {
        this.clearWatch(recoveryId);
        await this.startInventoryPushPhase(recoveryId);
      } else if (push?.status === 'failed') {
        this.clearWatch(recoveryId);
        const message = push.error_message || 'Firmware push failed';
        await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
        await this.eventModel.append(recoveryId, 'failed', message);
        this.clearRecoveryPushTarget(recovery.facility_id);
        await this.refreshBlockingState(recovery.facility_id);
        this.broadcastProgress(recovery, 0, message, 'failed');
      }
    }
  }

  static async handleFacilityDisconnect(facilityId: string): Promise<void> {
    /* Legacy entry — prefer handleRecoveryPushTargetDisconnect for swap candidate disconnects. */
    if (this.isRecoveryPushTargetOnline(facilityId)) return;
    GatewayChunkPushEngine.pausePushOnDisconnect(facilityId);
    const active = await this.recoveryModel.findActiveByFacility(facilityId);
    if (active?.status === 'inventory_push') {
      logger.info(`Recovery inventory push paused on disconnect facility=${facilityId}`);
    }
  }

  static async resumePendingForFacility(facilityId: string): Promise<void> {
    if (resumeInFlightRecoveries.has(facilityId)) return;
    resumeInFlightRecoveries.add(facilityId);
    try {
      if (!this.isRecoveryTargetOnline(facilityId)) return;

      const active = await this.recoveryModel.findActiveByFacility(facilityId);
      if (!active) return;

      if (RECOVERY_PUSH_STATUSES.includes(active.status)) {
        this.armRecoveryPushTarget(facilityId, active.gateway_id);
      }

      if (active.status === 'inventory_push' && active.inventory_snapshot_id) {
        if (!resumeInFlightRecoveries.has(`${facilityId}:push`) && !startupInventoryPushInFlight.has(active.id)) {
          resumeInFlightRecoveries.add(`${facilityId}:push`);
          this.notifyInventoryResume(facilityId, active);
          this.executeInventoryPush(active.id).finally(() => {
            resumeInFlightRecoveries.delete(`${facilityId}:push`);
          });
        }
      } else if (active.status === 'firmware') {
        this.startWatch(active.id);
      }
    } finally {
      resumeInFlightRecoveries.delete(facilityId);
    }
  }

  private static notifyInventoryResume(facilityId: string, recovery: GatewayRecovery): void {
    GatewayEventsService.getInstance().unicastToFacility(facilityId, {
      type: 'INVENTORY_SNAPSHOT_RESUME',
      recoveries: [{
        recovery_id: recovery.id,
        snapshot_id: recovery.inventory_snapshot_id,
        status: 'verifying',
        chunks_sent: recovery.inventory_chunks_sent,
        chunks_total: recovery.inventory_chunks_total,
      }],
    });
  }

  static async recoverInFlightStateOnStartup(): Promise<void> {
    const active = await this.recoveryModel.findAllActive();
    for (const recovery of active) {
      await this.refreshBlockingState(recovery.facility_id);
      if (RECOVERY_PUSH_STATUSES.includes(recovery.status)) {
        this.armRecoveryPushTarget(recovery.facility_id, recovery.gateway_id);
      }
      if (recovery.status === 'inventory_push') {
        if (startupInventoryPushInFlight.has(recovery.id)) continue;
        startupInventoryPushInFlight.add(recovery.id);
        this.executeInventoryPush(recovery.id).finally(() => {
          startupInventoryPushInFlight.delete(recovery.id);
        });
      } else if (['firmware', 'awaiting_config'].includes(recovery.status)) {
        this.startWatch(recovery.id);
      }
    }
    logger.info(`Gateway recovery startup: re-armed ${active.length} in-flight recoveries`);
  }

  private static isRecoveryTargetOnline(facilityId: string): boolean {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      if (transport.getRecoveryPushGatewayId(facilityId)) {
        return transport.isRecoveryPushTargetOnline(facilityId);
      }
      return GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId).connected;
    } catch {
      return false;
    }
  }

  private static async validateRecoveryOptionIds(firmwareId: string | null): Promise<void> {
    if (firmwareId) {
      const image = await this.firmwareModel.findById(firmwareId);
      if (!image || image.target_type !== 'gateway') {
        throw new Error('Invalid firmware selection for gateway recovery');
      }
    }
  }

  private static armRecoveryPushTarget(facilityId: string, gatewayId: string): void {
    this.setRecoveryPushTarget(facilityId, gatewayId);
  }

  private static setRecoveryPushTarget(facilityId: string, gatewayId: string): void {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      transport.setRecoveryPushTarget(facilityId, gatewayId);
    } catch { /* noop in tests */ }
  }

  private static clearRecoveryPushTarget(facilityId: string): void {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      transport.setRecoveryPushTarget(facilityId, null);
    } catch { /* noop */ }
  }

  private static async refreshBlockingState(facilityId: string): Promise<void> {
    await this.isBlockingActiveForFacility(facilityId);
  }

  private static startVerifyTimeout(recoveryId: string, facilityId: string): void {
    this.clearVerifyTimeout(recoveryId);
    const timer = setTimeout(() => {
      this.handleVerifyTimeout(recoveryId, facilityId).catch((err) => {
        logger.warn(`Recovery verify timeout handler failed recoveryId=${recoveryId}`, err);
      });
    }, VERIFY_TIMEOUT_MS);
    verifyTimers.set(recoveryId, timer);
  }

  private static clearVerifyTimeout(recoveryId: string): void {
    const timer = verifyTimers.get(recoveryId);
    if (timer) {
      clearTimeout(timer);
      verifyTimers.delete(recoveryId);
    }
  }

  private static async handleVerifyTimeout(recoveryId: string, facilityId: string): Promise<void> {
    verifyTimers.delete(recoveryId);
    const recovery = await this.recoveryModel.findById(recoveryId);
    if (!recovery || recovery.status !== 'inventory_push') return;

    const message = 'Gateway inventory snapshot verification timed out';
    await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
    this.clearWatch(recoveryId);
    await this.eventModel.append(recoveryId, 'failed', message);
    const latest = (await this.recoveryModel.findById(recoveryId))!;
    this.broadcastProgress(latest, 0, message, 'failed');
    this.clearRecoveryPushTarget(facilityId);
    await this.refreshBlockingState(facilityId);
  }

  static broadcastProgress(
    recovery: GatewayRecovery,
    percent: number,
    message?: string,
    statusOverride?: GatewayRecoveryStatus,
  ): void {
    const payload: GatewayRecoveryProgressPayload = {
      recoveryId: recovery.id,
      gatewayId: recovery.gateway_id,
      facilityId: recovery.facility_id,
      status: statusOverride ?? recovery.status,
      phase: statusOverride ?? recovery.status,
      percent,
      message,
      firmwareId: recovery.firmware_id,
      inventorySnapshotId: recovery.inventory_snapshot_id,
      chunksTotal: recovery.inventory_chunks_total ?? undefined,
      chunksSent: recovery.inventory_chunks_sent,
      error: recovery.error_message ?? undefined,
      timestamp: new Date().toISOString(),
    };

    try {
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      if (!wsService) return;

      const registry = wsService.getSubscriptionRegistry();
      if (!registry) return;

      const manager = registry.getGatewayRecoveryProgressManager();
      if (!manager) return;

      manager.broadcastProgress(payload);
    } catch (err) {
      logger.warn('Failed to broadcast gateway recovery progress', err);
    }
  }
}

export const _testWatchTimers = watchTimers;
export const _testCancelledRecoveries = cancelledRecoveries;
export const _testVerifyTimers = verifyTimers;
export const _testBlockingFacilities = blockingFacilities;
export const _testBlockingCache = blockingCache;
