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
import {
  GATEWAY_INVENTORY_SYNC_REQUEST_MESSAGE_TYPE,
  PRODUCTION_INVENTORY_SEED_TIMEOUT_MS,
  RECOVERY_PROGRESS_EVENT_PERCENT_STEP,
} from '@/constants/provisioning.constants';
import { pickHighestSemver, compareSemver } from '@/utils/semver-compare.utils';
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
const inventoryPhaseTransitionInFlight = new Set<string>();
const productionInventorySeedArmed = new Set<string>();
const statusBroadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const productionInventorySeedWaiters = new Map<
  string,
  { resolve: () => void; timer: ReturnType<typeof setTimeout> }
>();

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
      const active = await this.resolveActiveRecovery(facilityId);
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

  static isProductionInventorySeedArmed(facilityId: string): boolean {
    return productionInventorySeedArmed.has(facilityId);
  }

  static isProductionInventorySeedAllowed(
    facilityId: string,
    sessionRole: string | undefined,
    requestingGatewayId: string | undefined,
    boundGatewayId: string,
  ): boolean {
    if (!this.isProductionInventorySeedArmed(facilityId)) {
      return false;
    }
    return sessionRole === 'active' && requestingGatewayId === boundGatewayId;
  }

  static completeProductionInventorySeed(facilityId: string): void {
    productionInventorySeedArmed.delete(facilityId);
    const waiter = productionInventorySeedWaiters.get(facilityId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    productionInventorySeedWaiters.delete(facilityId);
    waiter.resolve();
  }

  private static armProductionInventorySeed(facilityId: string): Promise<void> {
    productionInventorySeedArmed.add(facilityId);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        productionInventorySeedWaiters.delete(facilityId);
        productionInventorySeedArmed.delete(facilityId);
        logger.warn(`Production inventory seed timed out facility=${facilityId}`);
        resolve();
      }, PRODUCTION_INVENTORY_SEED_TIMEOUT_MS);
      productionInventorySeedWaiters.set(facilityId, { resolve, timer });
    });
  }

  private static async seedProductionInventoryBeforeSnapshot(
    facilityId: string,
    previousGatewayId: string | null,
  ): Promise<void> {
    if (!previousGatewayId) return;

    const bound = await this.gatewayModel.findByFacilityId(facilityId);
    if (!bound || bound.id !== previousGatewayId) {
      logger.warn(
        `Skipping production inventory seed — bound gateway mismatch facility=${facilityId} bound=${bound?.id ?? 'none'} expected=${previousGatewayId}`,
      );
      return;
    }

    let transport: WebsocketGatewayTransport;
    try {
      transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
    } catch {
      return;
    }

    const activeStatus = transport.getActiveConnectionStatusForFacility(facilityId);
    if (!activeStatus.connected) {
      logger.warn(`Production gateway offline — snapshot will use cloud DB only facility=${facilityId}`);
      return;
    }

    const seedPromise = this.armProductionInventorySeed(facilityId);
    transport.unicastToFacility(facilityId, {
      type: GATEWAY_INVENTORY_SYNC_REQUEST_MESSAGE_TYPE,
      reason: 'pre_snapshot',
    });
    await seedPromise;
    logger.info(`Production inventory seed finished facility=${facilityId}`);
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
    if (!active || active.gateway_id !== gatewayId) {
      this.scheduleStatusBroadcast(facilityId);
      return;
    }

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
    this.scheduleStatusBroadcast(facilityId);
  }

  /**
   * After a completed swap, the demoted production unit may reconnect as a swap candidate.
   * That must not open a new blocking recovery session.
   */
  private static async isDemotedGatewayReconnect(
    facilityId: string,
    candidateGatewayId: string,
    boundGatewayId: string,
  ): Promise<boolean> {
    const latest = await this.recoveryModel.findLatestByFacility(facilityId);
    if (!latest || latest.status !== 'complete') return false;
    return (
      latest.gateway_id === boundGatewayId
      && latest.previous_gateway_id === candidateGatewayId
    );
  }

  private static async dismissSpuriousDetection(recovery: GatewayRecovery): Promise<void> {
    const cancelled = await this.recoveryModel.atomicCancel(recovery.id);
    if (!cancelled) return;
    await this.eventModel.append(
      recovery.id,
      'cancelled',
      'Ignored demoted gateway reconnect after completed swap',
    );
    await this.refreshBlockingState(recovery.facility_id);
    logger.info(
      `Dismissed spurious swap detect recovery=${recovery.id} facility=${recovery.facility_id} gateway=${recovery.gateway_id}`,
    );
  }

  private static async resolveActiveRecovery(facilityId: string): Promise<GatewayRecovery | null> {
    const active = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!active) return null;

    const bound = await this.gatewayModel.findByFacilityId(facilityId);
    if (
      active.status === 'detected'
      && bound
      && await this.isDemotedGatewayReconnect(facilityId, active.gateway_id, bound.id)
    ) {
      await this.dismissSpuriousDetection(active);
      return null;
    }

    return active;
  }

  static async detect(
    facilityId: string,
    newGatewayId: string,
    previousGatewayId: string,
    options?: { allowDemotedReconnect?: boolean },
  ): Promise<GatewayRecovery | null> {
    if (
      !options?.allowDemotedReconnect
      && await this.isDemotedGatewayReconnect(facilityId, newGatewayId, previousGatewayId)
    ) {
      logger.info(
        `Ignoring swap detect for demoted gateway reconnect facility=${facilityId} gateway=${newGatewayId}`,
      );
      return null;
    }

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
        if (RECOVERY_PUSH_STATUSES.includes(updated.status)) {
          this.armRecoveryPushTarget(facilityId, newGatewayId);
        }
      }
    }
    await this.refreshBlockingState(facilityId);
    return recovery;
  }

  static async getStatusForGateway(gatewayId: string): Promise<GatewayRecovery | null> {
    const latest = await this.recoveryModel.findLatestByGateway(gatewayId);
    if (!latest) return null;

    const active = await this.recoveryModel.findActiveByFacility(latest.facility_id);
    if (active && (active.gateway_id === gatewayId || active.previous_gateway_id === gatewayId)) {
      return active;
    }

    return latest;
  }

  static async getStatusForFacility(facilityId: string): Promise<GatewayRecovery | null> {
    const active = await this.resolveActiveRecovery(facilityId);
    if (active) return active;
    return this.recoveryModel.findLatestByFacility(facilityId);
  }

  /** Resolve facility scope for an unbound gateway (swap candidate WS, ZTP intent, or recovery history). */
  static async resolveFacilityAccessForUnboundGateway(
    gatewayId: string,
    allowedFacilityIds: string[],
  ): Promise<string | null> {
    for (const facilityId of allowedFacilityIds) {
      const candidates = this.getSwapCandidates(facilityId);
      if (candidates.some((c) => c.gatewayId === gatewayId)) {
        return facilityId;
      }
    }
    try {
      const { GatewayModel } = await import('@/models/gateway.model');
      const { getZtpIntendedFacilityId } = await import('@/utils/gateway-ztp-claim.utils');
      const gateway = await new GatewayModel().findById(gatewayId);
      const intended = getZtpIntendedFacilityId(gateway?.metadata);
      if (intended && allowedFacilityIds.includes(intended)) {
        return intended;
      }
    } catch {
      /* ignore */
    }
    const recovery = await this.recoveryModel.findLatestByGateway(gatewayId);
    if (recovery?.facility_id && allowedFacilityIds.includes(recovery.facility_id)) {
      return recovery.facility_id;
    }
    return null;
  }

  static getSwapCandidates(facilityId: string): Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }> {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      return transport.getSwapCandidatesForFacility(facilityId);
    } catch {
      return [];
    }
  }

  static getFacilityGatewaySessions(facilityId: string): Array<{
    gatewayId: string;
    sessionRole: 'active' | 'swap_candidate';
    connected: boolean;
    lastActivityAt?: number;
  }> {
    try {
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      return transport.getFacilityGatewaySessions(facilityId);
    } catch {
      return [];
    }
  }

  static async getRecoveryCandidatesPayload(facilityId: string): Promise<{
    candidates: Array<{ gatewayId: string; connected: boolean; lastActivityAt?: number }>;
    recovery: GatewayRecovery | null;
    sessions: Array<{
      gatewayId: string;
      sessionRole: 'active' | 'swap_candidate';
      connected: boolean;
      lastActivityAt?: number;
    }>;
    demotedPreviousGateway: { gatewayId: string; connected: boolean } | null;
  }> {
    const recovery = await this.getStatusForFacility(facilityId);
    const allCandidates = this.getSwapCandidates(facilityId).filter((c) => c.connected);
    let candidates = allCandidates;
    let demotedPreviousGateway: { gatewayId: string; connected: boolean } | null = null;

    if (recovery?.status === 'complete' && recovery.previous_gateway_id) {
      const previousId = recovery.previous_gateway_id;
      const transport = GatewayEventsService.getInstance().getTransport() as WebsocketGatewayTransport;
      let sessions = transport.getFacilityGatewaySessions(facilityId);
      sessions = transport.enrichSessionsForCompletedRecovery(
        facilityId,
        sessions,
        recovery.gateway_id,
        previousId,
      );
      demotedPreviousGateway = {
        gatewayId: previousId,
        connected: transport.isGatewayWsConnected(facilityId, previousId),
      };
      // Demoted previous is never listed under candidates until it reconnects as a live WS park
      candidates = candidates.filter(
        (candidate) => candidate.gatewayId.trim().toLowerCase() !== previousId.trim().toLowerCase(),
      );
      return {
        candidates,
        recovery,
        sessions,
        demotedPreviousGateway,
      };
    }

    return {
      candidates,
      recovery,
      sessions: this.getFacilityGatewaySessions(facilityId),
      demotedPreviousGateway,
    };
  }

  static async resolveDefaultFirmwareId(): Promise<string | null> {
    const images = await this.firmwareModel.findAll(true, 'gateway');
    if (images.length === 0) return null;
    const highest = pickHighestSemver(images);
    return highest?.id ?? images[0].id;
  }

  static async getRecoveryOptions(gatewayId: string, facilityId: string): Promise<{
    productionFirmwareVersion: string | null;
    candidateFirmwareVersion: string | null;
    candidateMatchesProduction: boolean;
    productionFirmwareImageAvailable: boolean;
  }> {
    const candidate = await this.gatewayModel.findById(gatewayId);
    const candidateFirmwareVersion = candidate?.firmware_version?.trim() || null;

    const productionGateway = await this.gatewayModel.findByFacilityId(facilityId);
    const productionFirmwareVersion = productionGateway?.firmware_version?.trim() || null;
    let productionFirmwareImageAvailable = false;
    if (productionFirmwareVersion) {
      const image = await this.firmwareModel.findByVersion(productionFirmwareVersion, 'gateway');
      productionFirmwareImageAvailable = !!image;
    }

    const candidateMatchesProduction = !!(
      productionFirmwareVersion
      && candidateFirmwareVersion
      && compareSemver(candidateFirmwareVersion, productionFirmwareVersion) >= 0
    );

    return {
      productionFirmwareVersion,
      candidateFirmwareVersion,
      candidateMatchesProduction,
      productionFirmwareImageAvailable,
    };
  }

  /** Resolve the firmware image that matches the current production gateway version. */
  private static async resolveProductionFirmwareId(
    facilityId: string,
    previousGatewayId: string | null,
  ): Promise<string | null> {
    const productionGatewayId = previousGatewayId
      ?? (await this.gatewayModel.findByFacilityId(facilityId))?.id
      ?? null;
    if (!productionGatewayId) return null;

    const production = await this.gatewayModel.findById(productionGatewayId);
    const productionVersion = production?.firmware_version?.trim() || null;
    if (!productionVersion) return null;

    const image = await this.firmwareModel.findByVersion(productionVersion, 'gateway');
    if (!image) {
      logger.warn(
        `No gateway firmware image for production version ${productionVersion} — skipping firmware phase`,
      );
      return null;
    }
    return image.id;
  }

  /** Returns false when the swap candidate already meets the target firmware version. */
  private static async firmwareUpdateNeeded(
    gatewayId: string,
    firmwareId: string,
  ): Promise<{ needed: boolean; candidateVersion: string | null; targetVersion: string }> {
    const [gateway, firmware] = await Promise.all([
      this.gatewayModel.findById(gatewayId),
      this.firmwareModel.findById(firmwareId),
    ]);
    if (!firmware) {
      return { needed: true, candidateVersion: gateway?.firmware_version?.trim() || null, targetVersion: '' };
    }
    const candidateVersion = gateway?.firmware_version?.trim() || null;
    const targetVersion = firmware.version;
    if (!candidateVersion) {
      return { needed: true, candidateVersion: null, targetVersion };
    }
    return {
      needed: compareSemver(candidateVersion, targetVersion) < 0,
      candidateVersion,
      targetVersion,
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

    const detected = await this.detect(facilityId, gatewayId, previousGatewayId, { allowDemotedReconnect: true });
    if (!detected || detected.gateway_id !== gatewayId) {
      throw new Error('No active recovery for this gateway');
    }
    return detected;
  }

  static async initiate(
    gatewayId: string,
    facilityId: string,
    userId: string,
    options?: {
      firmwareId?: string;
      includeFirmware?: boolean;
      firmwareDeliveryMode?: 'v1' | 'v2' | string;
    },
  ): Promise<GatewayRecovery> {
    let recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.gateway_id !== gatewayId) {
      recovery = await this.ensureActiveRecoveryForGateway(gatewayId, facilityId);
    }

    const includeFirmware = options?.includeFirmware !== false;
    let firmwareId: string | null = null;
    if (includeFirmware) {
      firmwareId = options?.firmwareId
        ?? await this.resolveProductionFirmwareId(facilityId, recovery.previous_gateway_id);
      await this.validateRecoveryOptionIds(firmwareId);
    }

    await this.recoveryModel.updateFields(recovery.id, {
      status: 'awaiting_config',
      firmware_id: firmwareId,
      initiated_by: userId,
    });
    recovery = (await this.recoveryModel.findById(recovery.id))!;

    const configMessage = includeFirmware && firmwareId
      ? 'Recovery configured — matching production gateway firmware'
      : includeFirmware && !firmwareId
        ? 'Recovery configured — production firmware unknown, skipping to inventory push'
        : 'Recovery configured — firmware matching disabled, starting inventory push';
    await this.eventModel.append(recovery.id, 'awaiting_config', configMessage);
    this.broadcastProgress(recovery, 5, 'Recovery initiated');

    if (includeFirmware && firmwareId) {
      await this.startFirmwarePhase(recovery.id);
    } else {
      await this.startInventoryPushPhase(recovery.id);
    }
    return (await this.recoveryModel.findById(recovery.id))!;
  }

  static async advance(gatewayId: string, facilityId: string): Promise<GatewayRecovery> {
    const recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.gateway_id !== gatewayId) {
      throw new Error('No active recovery for this gateway');
    }
    if (recovery.status === 'awaiting_config') {
      if (recovery.firmware_id) {
        await this.startFirmwarePhase(recovery.id);
      } else {
        await this.startInventoryPushPhase(recovery.id);
      }
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
    if (!recovery.firmware_id) {
      return 'inventory_push';
    }
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
    this.armRecoveryPushTarget(recovery.facility_id, recovery.gateway_id);
    await this.refreshBlockingState(recovery.facility_id);

    const firmwareCheck = await this.firmwareUpdateNeeded(recovery.gateway_id, recovery.firmware_id);
    if (!firmwareCheck.needed) {
      const skipMessage = firmwareCheck.candidateVersion
        ? `Swap candidate already on firmware ${firmwareCheck.candidateVersion} (target ${firmwareCheck.targetVersion}) — skipping OTA`
        : `Target firmware ${firmwareCheck.targetVersion} already satisfied — skipping OTA`;
      await this.eventModel.append(recoveryId, 'firmware', skipMessage, 35);
      const latest = (await this.recoveryModel.findById(recoveryId))!;
      this.broadcastProgress(
        latest,
        35,
        `Firmware up to date (${firmwareCheck.targetVersion}) — skipping to inventory push`,
      );
      try {
        await this.startInventoryPushPhase(recoveryId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Inventory snapshot preparation failed';
        logger.error(`Recovery inventory phase failed after firmware skip recoveryId=${recoveryId}:`, err);
        await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
        await this.eventModel.append(recoveryId, 'failed', message);
        const failed = (await this.recoveryModel.findById(recoveryId))!;
        this.broadcastProgress(failed, 0, message, 'failed');
        this.clearRecoveryPushTarget(recovery.facility_id);
        await this.refreshBlockingState(recovery.facility_id);
      }
      return;
    }

    await this.eventModel.append(recoveryId, 'firmware', 'Starting firmware update phase', 10);
    this.broadcastProgress(recovery, 10, 'Firmware update starting');

    try {
      if (!recovery.firmware_id) {
        throw new Error('Recovery firmware_id is missing');
      }
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

    if (recovery.status === 'inventory_push') {
      if (recovery.inventory_snapshot_id) {
        this.armRecoveryPushTarget(recovery.facility_id, recovery.gateway_id);
        if (!resumeInFlightRecoveries.has(`${recovery.facility_id}:push`)) {
          resumeInFlightRecoveries.add(`${recovery.facility_id}:push`);
          this.executeInventoryPush(recoveryId).finally(() => {
            resumeInFlightRecoveries.delete(`${recovery.facility_id}:push`);
          });
        }
        this.startWatch(recoveryId);
      }
      return;
    }

    if (recovery.status !== 'firmware' && recovery.status !== 'awaiting_config') {
      return;
    }

    if (inventoryPhaseTransitionInFlight.has(recoveryId)) {
      return;
    }
    inventoryPhaseTransitionInFlight.add(recoveryId);
    try {
      await this.seedProductionInventoryBeforeSnapshot(
        recovery.facility_id,
        recovery.previous_gateway_id,
      );
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
      this.clearWatch(recoveryId);
      this.executeInventoryPush(recoveryId).catch((err) => {
        logger.error(`Inventory push failed recoveryId=${recoveryId}:`, err);
      });
      this.startWatch(recoveryId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Inventory snapshot preparation failed';
      logger.error(`Recovery inventory snapshot build failed recoveryId=${recoveryId}:`, err);
      await this.recoveryModel.updateStatus(recoveryId, 'failed', message);
      await this.eventModel.append(recoveryId, 'failed', message);
      this.clearRecoveryPushTarget(recovery.facility_id);
      await this.refreshBlockingState(recovery.facility_id);
      const latest = (await this.recoveryModel.findById(recoveryId))!;
      this.broadcastProgress(latest, 0, message, 'failed');
      throw err;
    } finally {
      inventoryPhaseTransitionInFlight.delete(recoveryId);
    }
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
      await this.refreshBlockingState(facilityId);
      await this.finalizeRecovery(recovery, false);
      const updated = (await this.recoveryModel.findById(recovery.id))!;
      this.broadcastProgress(updated, 100, 'Recovery complete — inventory sync unblocked', 'complete');
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
      const {
        resolveBoundGatewayDisplayName,
        unboundGatewayDisplayName,
        withOperatorSetGatewayDisplayName,
      } = await import('@/utils/gateway-display-name.utils');

      if (oldId && oldId !== newId) {
        await trx('blulok_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        await trx('access_control_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        await trx('gateway_inventory_devices').where('gateway_id', oldId).update({ gateway_id: newId, updated_at: new Date() });
        const retired = await trx('gateways').where('id', oldId).first();
        // Neutralize display name + clear operator-set flag so a later rebind
        // cannot surface this facility's branding on a different site.
        await trx('gateways').where('id', oldId).update({
          facility_id: null,
          status: 'offline',
          name: unboundGatewayDisplayName(String(oldId)),
          metadata: JSON.stringify(withOperatorSetGatewayDisplayName(retired?.metadata, false)),
          updated_at: new Date(),
        });
      }

      const promoted = await trx('gateways').where('id', newId).first();
      const facility = await trx('facilities').where('id', recovery.facility_id).first();
      const nextName = resolveBoundGatewayDisplayName({
        facilityName: facility?.name,
        gatewayId: String(newId),
        existingName: promoted?.name,
        metadata: promoted?.metadata,
      });
      const keepOperatorName = nextName === String(promoted?.name ?? '').trim();

      await trx('gateways').where('id', newId).update({
        facility_id: recovery.facility_id,
        status: 'online',
        name: nextName,
        updated_at: new Date(),
        ...(keepOperatorName
          ? {}
          : {
              metadata: JSON.stringify(
                withOperatorSetGatewayDisplayName(promoted?.metadata, false),
              ),
            }),
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
    void this.checkChildProgress(recoveryId).catch((err) => {
      logger.warn(`Recovery watch initial check failed recoveryId=${recoveryId}`, err);
    });
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

  static async onFirmwarePushComplete(firmwarePushId: string, facilityId: string): Promise<void> {
    const recovery = await this.recoveryModel.findActiveByFacility(facilityId);
    if (!recovery || recovery.status !== 'firmware' || recovery.firmware_push_id !== firmwarePushId) {
      return;
    }
    await this.checkChildProgress(recovery.id);
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
        try {
          await this.startInventoryPushPhase(recoveryId);
        } catch (err) {
          logger.warn(`Recovery inventory phase failed recoveryId=${recoveryId}`, err);
          this.startWatch(recoveryId);
        }
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
        void this.checkChildProgress(active.id).catch((err) => {
          logger.warn(`Recovery resume firmware check failed recoveryId=${active.id}`, err);
        });
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
        if (recovery.status === 'firmware') {
          void this.checkChildProgress(recovery.id).catch((err) => {
            logger.warn(`Recovery startup firmware check failed recoveryId=${recovery.id}`, err);
          });
        }
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

    this.scheduleStatusBroadcast(recovery.facility_id);
  }

  /**
   * Debounced facility-scoped candidates/sessions/recovery snapshot for dashboard WS.
   * Coalesces rapid progress/session churn (e.g. inventory chunks, reconnect flaps).
   */
  static scheduleStatusBroadcast(facilityId: string): void {
    const existing = statusBroadcastTimers.get(facilityId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      statusBroadcastTimers.delete(facilityId);
      void this.broadcastStatus(facilityId);
    }, 300);
    timer.unref?.();
    statusBroadcastTimers.set(facilityId, timer);
  }

  static async broadcastStatus(facilityId: string): Promise<void> {
    try {
      const { WebSocketService } = require('../websocket.service');
      const wsService = WebSocketService.getInstance();
      if (!wsService) return;

      const registry = wsService.getSubscriptionRegistry();
      if (!registry) return;

      const manager = registry.getGatewayRecoveryStatusManager();
      if (!manager) return;

      await manager.broadcastStatus(facilityId);
    } catch (err) {
      logger.warn('Failed to broadcast gateway recovery status', err);
    }
  }
}

export const _testWatchTimers = watchTimers;
export const _testCancelledRecoveries = cancelledRecoveries;
export const _testVerifyTimers = verifyTimers;
export const _testBlockingFacilities = blockingFacilities;
export const _testBlockingCache = blockingCache;
export const _testInventoryPhaseTransitionInFlight = inventoryPhaseTransitionInFlight;
export const _testProductionInventorySeedArmed = productionInventorySeedArmed;

/** Test-only: clear module-level recovery timers between Jest suites. */
export function _testClearPendingTimers(): void {
  for (const timer of watchTimers.values()) {
    clearInterval(timer);
  }
  watchTimers.clear();

  for (const timer of verifyTimers.values()) {
    clearTimeout(timer);
  }
  verifyTimers.clear();

  for (const waiter of productionInventorySeedWaiters.values()) {
    clearTimeout(waiter.timer);
  }
  productionInventorySeedWaiters.clear();

  for (const timer of statusBroadcastTimers.values()) {
    clearTimeout(timer);
  }
  statusBroadcastTimers.clear();

  cancelledRecoveries.clear();
  resumeInFlightRecoveries.clear();
  blockingFacilities.clear();
  blockingCache.clear();
  startupInventoryPushInFlight.clear();
  inventoryPhaseTransitionInFlight.clear();
  productionInventorySeedArmed.clear();
}
