import { v4 as uuidv4 } from 'uuid';
import {
  DEVICE_DELETION_MAX_ATTEMPTS,
  DEVICE_DELETION_RETRY_BASE_MS,
  DEVICE_DELETION_RETRY_MAX_MS,
  DEVICE_DELETION_STALE_IN_PROGRESS_MS,
} from '@/constants/device-deletion-outbox.constants';
import { DatabaseService } from '@/services/database.service';

export type DeviceDeletionOutboxStatus =
  | 'pending'
  | 'in_progress'
  | 'delivered'
  | 'failed'
  | 'dead_letter'
  | 'cancelled';

export type DeviceDeletionKind = 'blulok' | 'access_control';

export interface DeviceDeletionOutboxRow {
  id: string;
  facility_id: string;
  gateway_id: string;
  device_kind: DeviceDeletionKind;
  lock_id: string | null;
  access_id: string | null;
  relay_channel: number | null;
  status: DeviceDeletionOutboxStatus;
  last_nonce: string | null;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EnqueueDeviceDeletionInput {
  facilityId: string;
  gatewayId: string;
  deviceKind: DeviceDeletionKind;
  lockId?: string;
  accessId?: string;
  relayChannel?: number;
}

const ACTIVE_STATUSES: DeviceDeletionOutboxStatus[] = ['pending', 'in_progress', 'failed'];

export class DeviceDeletionOutboxModel {
  private readonly db = DatabaseService.getInstance();

  private get knex() {
    return this.db.connection;
  }

  async enqueue(input: EnqueueDeviceDeletionInput): Promise<DeviceDeletionOutboxRow> {
    const now = new Date();
    let query = this.knex('device_deletion_outbox')
      .where('facility_id', input.facilityId)
      .where('device_kind', input.deviceKind)
      .whereIn('status', ACTIVE_STATUSES);

    if (input.deviceKind === 'blulok') {
      query = query.where('lock_id', input.lockId ?? null);
    } else {
      query = query
        .where('access_id', input.accessId ?? null)
        .where('relay_channel', input.relayChannel ?? 1);
    }

    const existing = await query.orderBy('updated_at', 'desc').first();

    if (existing) {
      await this.knex('device_deletion_outbox')
        .where('id', existing.id)
        .update({
          status: 'pending',
          gateway_id: input.gatewayId,
          next_attempt_at: null,
          last_error: null,
          updated_at: now,
        });
      return (await this.knex('device_deletion_outbox').where('id', existing.id).first()) as DeviceDeletionOutboxRow;
    }

    const id = uuidv4();
    await this.knex('device_deletion_outbox').insert({
      id,
      facility_id: input.facilityId,
      gateway_id: input.gatewayId,
      device_kind: input.deviceKind,
      lock_id: input.lockId ?? null,
      access_id: input.accessId ?? null,
      relay_channel: input.relayChannel ?? null,
      status: 'pending',
      attempt_count: 0,
      last_error: null,
      next_attempt_at: null,
      created_at: now,
      updated_at: now,
    });

    return (await this.knex('device_deletion_outbox').where('id', id).first()) as DeviceDeletionOutboxRow;
  }

  async findNextDeliverableForFacility(facilityId: string): Promise<DeviceDeletionOutboxRow | null> {
    const now = new Date();
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .whereIn('status', ['pending', 'failed'])
      .andWhere((query) => {
        query.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now);
      })
      .orderBy('created_at', 'asc')
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async findDue(limit: number): Promise<DeviceDeletionOutboxRow[]> {
    const now = new Date();
    const rows = await this.knex('device_deletion_outbox')
      .whereIn('status', ['pending', 'failed'])
      .andWhere((query) => {
        query.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now);
      })
      .orderBy('created_at', 'asc')
      .limit(limit);
    return rows as DeviceDeletionOutboxRow[];
  }

  async markInProgress(id: string, nonce: string): Promise<void> {
    await this.knex('device_deletion_outbox')
      .where('id', id)
      .update({
        status: 'in_progress',
        last_nonce: nonce,
        updated_at: new Date(),
      });
  }

  async findById(id: string): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox').where('id', id).first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async findByNonce(facilityId: string, nonce: string): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('last_nonce', nonce)
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async markDelivered(id: string): Promise<void> {
    await this.knex('device_deletion_outbox')
      .where('id', id)
      .update({
        status: 'delivered',
        last_error: null,
        updated_at: new Date(),
      });
  }

  async markCancelled(id: string, reason: string): Promise<void> {
    await this.knex('device_deletion_outbox')
      .where('id', id)
      .update({
        status: 'cancelled',
        last_error: reason,
        updated_at: new Date(),
      });
  }

  async cancelActiveForBlulok(facilityId: string, lockId: string, reason: string): Promise<number> {
    return this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'blulok')
      .where('lock_id', lockId)
      .whereIn('status', ACTIVE_STATUSES)
      .update({
        status: 'cancelled',
        last_error: reason,
        updated_at: new Date(),
      });
  }

  async cancelActiveForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
    reason: string,
  ): Promise<number> {
    return this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'access_control')
      .where('access_id', accessId)
      .where('relay_channel', relayChannel)
      .whereIn('status', ACTIVE_STATUSES)
      .update({
        status: 'cancelled',
        last_error: reason,
        updated_at: new Date(),
      });
  }

  async scheduleRetry(id: string, error: string, attemptCount: number): Promise<DeviceDeletionOutboxStatus> {
    const nextAttempt = attemptCount + 1;
    const deadLetter = nextAttempt >= DEVICE_DELETION_MAX_ATTEMPTS;
    const delayMs = deadLetter
      ? 0
      : Math.min(
          DEVICE_DELETION_RETRY_MAX_MS,
          DEVICE_DELETION_RETRY_BASE_MS * Math.pow(2, Math.max(0, nextAttempt - 1)),
        );

    await this.knex('device_deletion_outbox')
      .where('id', id)
      .update({
        status: deadLetter ? 'dead_letter' : 'failed',
        attempt_count: nextAttempt,
        last_error: error,
        next_attempt_at: deadLetter ? null : new Date(Date.now() + delayMs),
        updated_at: new Date(),
      });

    return deadLetter ? 'dead_letter' : 'failed';
  }

  async recoverStaleInProgress(
    staleMs: number = DEVICE_DELETION_STALE_IN_PROGRESS_MS,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - staleMs);
    return this.knex('device_deletion_outbox')
      .where('status', 'in_progress')
      .andWhere('updated_at', '<', cutoff)
      .update({
        status: 'pending',
        last_error: 'Recovered stale in_progress delivery',
        updated_at: new Date(),
      });
  }

  async hasPendingForFacility(facilityId: string): Promise<boolean> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .whereIn('status', ACTIVE_STATUSES)
      .first();
    return Boolean(row);
  }

  async findActiveForBlulok(
    facilityId: string,
    lockId: string,
  ): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'blulok')
      .where('lock_id', lockId)
      .whereIn('status', ACTIVE_STATUSES)
      .orderBy('updated_at', 'desc')
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async findActiveForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
  ): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'access_control')
      .where('access_id', accessId)
      .where('relay_channel', relayChannel)
      .whereIn('status', ACTIVE_STATUSES)
      .orderBy('updated_at', 'desc')
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async findLatestForBlulok(
    facilityId: string,
    lockId: string,
  ): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'blulok')
      .where('lock_id', lockId)
      .orderBy('updated_at', 'desc')
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }

  async findLatestForAccessControl(
    facilityId: string,
    accessId: string,
    relayChannel: number,
  ): Promise<DeviceDeletionOutboxRow | null> {
    const row = await this.knex('device_deletion_outbox')
      .where('facility_id', facilityId)
      .where('device_kind', 'access_control')
      .where('access_id', accessId)
      .where('relay_channel', relayChannel)
      .orderBy('updated_at', 'desc')
      .first();
    return (row as DeviceDeletionOutboxRow) || null;
  }
}
