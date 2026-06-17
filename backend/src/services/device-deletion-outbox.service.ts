import crypto from 'crypto';
import {
  DEVICE_DELETION_ACK_TIMEOUT_MS,
} from '@/constants/device-deletion-outbox.constants';
import {
  DeviceDeletionOutboxModel,
  DeviceDeletionOutboxRow,
  EnqueueDeviceDeletionInput,
} from '@/models/device-deletion-outbox.model';
import { Ed25519Service } from '@/services/crypto/ed25519.service';
import { GatewayEventsService } from '@/services/gateway/gateway-events.service';
import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';
import { logger } from '@/utils/logger';
import { isOperationalOutboundBlockedDuringRecovery } from '@/utils/gateway-recovery-outbound.utils';

export class DeviceDeletionDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceDeletionDeliveryError';
  }
}

type PendingAck = {
  facilityId: string;
  outboxId: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class DeviceDeletionOutboxService {
  private static instance: DeviceDeletionOutboxService;
  private readonly outbox = new DeviceDeletionOutboxModel();
  private readonly pendingAcksByNonce = new Map<string, PendingAck>();
  private readonly flushInProgressByFacility = new Set<string>();

  public static getInstance(): DeviceDeletionOutboxService {
    if (!this.instance) {
      this.instance = new DeviceDeletionOutboxService();
    }
    return this.instance;
  }

  public isGatewayOnline(facilityId: string): boolean {
    return GatewayEventsService.getInstance().getFacilityConnectionStatus(facilityId).connected;
  }

  public async enqueueDeletion(input: EnqueueDeviceDeletionInput): Promise<DeviceDeletionOutboxRow> {
    const row = await this.outbox.enqueue(input);
    await this.flushPendingForFacility(input.facilityId);
    return row;
  }

  public async flushPendingForFacility(facilityId: string): Promise<void> {
    if (this.flushInProgressByFacility.has(facilityId)) {
      return;
    }
    if (!this.isGatewayOnline(facilityId)) {
      return;
    }

    this.flushInProgressByFacility.add(facilityId);
    try {
      let row = await this.outbox.findNextDeliverableForFacility(facilityId);
      while (row) {
        try {
          await this.deliverOutboxRow(row);
        } catch {
          break;
        }
        row = await this.outbox.findNextDeliverableForFacility(facilityId);
      }
    } finally {
      this.flushInProgressByFacility.delete(facilityId);
    }
  }

  public async processDueOutboxPushes(limit = 20): Promise<void> {
    await this.outbox.recoverStaleInProgress();
    const due = await this.outbox.findDue(limit);
    for (const row of due) {
      if (!this.isGatewayOnline(row.facility_id)) {
        continue;
      }
      try {
        await this.flushPendingForFacility(row.facility_id);
      } catch (error) {
        logger.warn(
          `[DeviceDeletionOutbox] Flush failed for facility=${row.facility_id}`,
          error,
        );
      }
    }
  }

  public handleDeviceDeletedAck(
    facilityId: string,
    ack: { nonce?: string; success?: boolean; accepted?: boolean; message?: string; error?: string },
  ): void {
    const nonce = String(ack?.nonce || '');
    if (!nonce) return;

    const pending = this.pendingAcksByNonce.get(nonce);
    if (pending) {
      if (pending.facilityId !== facilityId) return;
      clearTimeout(pending.timer);
      this.pendingAcksByNonce.delete(nonce);

      const accepted = ack.success === true || ack.accepted === true;
      if (accepted) {
        pending.resolve();
        return;
      }

      const reason = ack.message || ack.error || 'gateway rejected DEVICE_DELETED';
      void this.scheduleRetryForOutbox(pending.outboxId, reason);
      pending.reject(new DeviceDeletionDeliveryError(reason));
      return;
    }

    void this.outbox.findByNonce(facilityId, nonce).then(async (row) => {
      if (!row || row.status !== 'in_progress') return;
      const accepted = ack.success === true || ack.accepted === true;
      if (accepted) {
        await this.outbox.markDelivered(row.id);
        return;
      }
      const reason = ack.message || ack.error || 'gateway rejected DEVICE_DELETED';
      await this.outbox.scheduleRetry(row.id, reason, row.attempt_count);
    }).catch((err) => {
      logger.warn('[DeviceDeletionOutbox] Failed to handle late ACK', err);
    });
  }

  public async cancelForBlulok(
    facilityId: string,
    lockId: string,
    reason = 'Device re-added to cloud inventory',
  ): Promise<void> {
    await this.outbox.cancelActiveForBlulok(facilityId, lockId, reason);
  }

  public async cancelForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
    reason = 'Device re-added to cloud inventory',
  ): Promise<void> {
    await this.outbox.cancelActiveForAccessControl(facilityId, accessId, relayChannel, reason);
  }

  /** Dev/E2E: latest active outbox row for a BluLok lock_id. */
  public async findActiveOutboxForBlulok(
    facilityId: string,
    lockId: string,
  ): Promise<DeviceDeletionOutboxRow | null> {
    return this.outbox.findActiveForBlulok(facilityId, lockId);
  }

  /** Dev/E2E: latest outbox row for a BluLok lock_id (any terminal status). */
  public async findLatestOutboxForBlulok(
    facilityId: string,
    lockId: string,
  ): Promise<DeviceDeletionOutboxRow | null> {
    return this.outbox.findLatestForBlulok(facilityId, lockId);
  }

  /** Dev/E2E: latest outbox row for an access control device (any terminal status). */
  public async findLatestOutboxForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
  ): Promise<DeviceDeletionOutboxRow | null> {
    return this.outbox.findLatestForAccessControl(facilityId, accessId, relayChannel);
  }

  private isOperationalDeliveryBlocked(facilityId: string, outboundPayload: unknown): boolean {
    if (!GatewayRecoveryService.isBlockingActiveForFacilitySync(facilityId)) {
      return false;
    }
    return isOperationalOutboundBlockedDuringRecovery(outboundPayload);
  }

  private async deliverOutboxRow(row: DeviceDeletionOutboxRow): Promise<void> {
    const nonce = crypto.randomUUID();
    let jwt: string;
    try {
      jwt = await this.buildDeviceDeletedJwt(row, nonce);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.outbox.scheduleRetry(row.id, `JWT sign failed: ${message}`, row.attempt_count);
      throw new DeviceDeletionDeliveryError(message);
    }

    if (this.isOperationalDeliveryBlocked(row.facility_id, jwt)) {
      logger.info(
        `DEVICE_DELETED deferred (recovery blocking) facility=${row.facility_id} outbox=${row.id}`,
      );
      return;
    }

    await this.outbox.markInProgress(row.id, nonce);
    GatewayEventsService.getInstance().unicastToFacility(row.facility_id, jwt);
    logger.info(
      `DEVICE_DELETED dispatched facility=${row.facility_id} outbox=${row.id} nonce=${nonce} attempt=${row.attempt_count + 1}`,
    );

    try {
      await this.awaitAck(row.facility_id, nonce, row.id);
      await this.outbox.markDelivered(row.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`DEVICE_DELETED delivery failed facility=${row.facility_id}: ${message}`);
      throw error;
    }
  }

  private async buildDeviceDeletedJwt(row: DeviceDeletionOutboxRow, nonce: string): Promise<string> {
    const payload: Record<string, unknown> = {
      cmd_type: 'DEVICE_DELETED',
      facility_id: row.facility_id,
      gateway_id: row.gateway_id,
      device_kind: row.device_kind === 'blulok' ? 'lock' : 'access_control',
      nonce,
    };

    if (row.device_kind === 'blulok') {
      payload.lock_id = row.lock_id;
    } else {
      payload.access_id = row.access_id;
      payload.relay_channel = row.relay_channel ?? 1;
    }

    return Ed25519Service.signCommandJwt(payload);
  }

  private async awaitAck(
    facilityId: string,
    nonce: string,
    outboxId: string,
    timeoutMs = DEVICE_DELETION_ACK_TIMEOUT_MS,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingAcksByNonce.delete(nonce);
        const message = `timed out waiting for DEVICE_DELETED_ACK (nonce=${nonce})`;
        void this.scheduleRetryForOutbox(outboxId, message);
        reject(new DeviceDeletionDeliveryError(message));
      }, timeoutMs);

      this.pendingAcksByNonce.set(nonce, {
        facilityId,
        outboxId,
        resolve,
        reject,
        timer,
      });
    });
  }

  private async scheduleRetryForOutbox(outboxId: string, error: string): Promise<void> {
    const row = await this.outbox.findById(outboxId);
    if (!row) return;
    await this.outbox.scheduleRetry(outboxId, error, row.attempt_count);
  }
}
