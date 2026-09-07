import { v4 as uuidv4 } from 'uuid';
import {
  ACCESS_CODE_PUSH_MAX_ATTEMPTS,
  ACCESS_CODE_PUSH_RETRY_BASE_MS,
  ACCESS_CODE_PUSH_RETRY_MAX_MS,
  ACCESS_CODE_PUSH_STALE_IN_PROGRESS_MS,
} from '@/constants/access-code-push-outbox.constants';
import { DatabaseService } from '@/services/database.service';

export type AccessCodePushOutboxStatus =
  | 'pending'
  | 'in_progress'
  | 'failed'
  | 'dead_letter';

export interface AccessCodePushOutboxRow {
  id: string;
  facility_id: string;
  status: AccessCodePushOutboxStatus;
  last_nonce: string | null;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: Date | null;
  coalesce_pending: boolean;
  created_at: Date;
  updated_at: Date;
}

const ACTIVE_STATUSES: AccessCodePushOutboxStatus[] = ['pending', 'in_progress', 'failed'];

export class AccessCodePushOutboxModel {
  private readonly db = DatabaseService.getInstance();

  private get knex() {
    return this.db.connection;
  }

  async enqueue(facilityId: string): Promise<AccessCodePushOutboxRow> {
    const now = new Date();
    const existing = await this.knex('access_code_push_outbox')
      .where('facility_id', facilityId)
      .whereIn('status', ACTIVE_STATUSES)
      .orderBy('updated_at', 'desc')
      .first();

    if (existing) {
      if (existing.status === 'in_progress') {
        await this.knex('access_code_push_outbox')
          .where('id', existing.id)
          .update({
            coalesce_pending: true,
            updated_at: now,
          });
        return {
          ...(existing as AccessCodePushOutboxRow),
          coalesce_pending: true,
          updated_at: now,
        };
      }

      await this.knex('access_code_push_outbox')
        .where('id', existing.id)
        .update({
          status: 'pending',
          next_attempt_at: null,
          last_error: null,
          updated_at: now,
        });

      return (await this.knex('access_code_push_outbox').where('id', existing.id).first()) as AccessCodePushOutboxRow;
    }

    const id = uuidv4();
    await this.knex('access_code_push_outbox').insert({
      id,
      facility_id: facilityId,
      status: 'pending',
      attempt_count: 0,
      last_error: null,
      next_attempt_at: null,
      coalesce_pending: false,
      created_at: now,
      updated_at: now,
    });

    return (await this.knex('access_code_push_outbox').where('id', id).first()) as AccessCodePushOutboxRow;
  }

  async findActiveForFacility(facilityId: string): Promise<AccessCodePushOutboxRow | null> {
    const row = await this.knex('access_code_push_outbox')
      .where('facility_id', facilityId)
      .whereIn('status', ACTIVE_STATUSES)
      .orderBy('updated_at', 'desc')
      .first();
    return (row as AccessCodePushOutboxRow) || null;
  }

  async findDue(limit: number): Promise<AccessCodePushOutboxRow[]> {
    const now = new Date();
    const rows = await this.knex('access_code_push_outbox')
      .whereIn('status', ['pending', 'failed'])
      .andWhere((query) => {
        query.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now);
      })
      .orderBy('created_at', 'asc')
      .limit(limit);
    return rows as AccessCodePushOutboxRow[];
  }

  async markInProgress(id: string, nonce: string): Promise<void> {
    await this.knex('access_code_push_outbox')
      .where('id', id)
      .update({
        status: 'in_progress',
        last_nonce: nonce,
        updated_at: new Date(),
      });
  }

  async findById(id: string): Promise<AccessCodePushOutboxRow | null> {
    const row = await this.knex('access_code_push_outbox').where('id', id).first();
    return (row as AccessCodePushOutboxRow) || null;
  }

  async markDelivered(id: string): Promise<void> {
    const row = await this.findById(id);
    if (!row) return;

    if (row.coalesce_pending) {
      await this.knex('access_code_push_outbox')
        .where('id', id)
        .update({
          status: 'pending',
          coalesce_pending: false,
          last_nonce: null,
          next_attempt_at: null,
          last_error: null,
          updated_at: new Date(),
        });
      return;
    }

    await this.knex('access_code_push_outbox').where('id', id).del();
  }

  async scheduleRetry(id: string, error: string, attemptCount: number): Promise<AccessCodePushOutboxStatus> {
    const nextAttempt = attemptCount + 1;
    const deadLetter = nextAttempt >= ACCESS_CODE_PUSH_MAX_ATTEMPTS;
    const delayMs = deadLetter
      ? 0
      : Math.min(
          ACCESS_CODE_PUSH_RETRY_MAX_MS,
          ACCESS_CODE_PUSH_RETRY_BASE_MS * Math.pow(2, Math.max(0, nextAttempt - 1)),
        );

    await this.knex('access_code_push_outbox')
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
    staleMs: number = ACCESS_CODE_PUSH_STALE_IN_PROGRESS_MS,
  ): Promise<number> {
    const cutoff = new Date(Date.now() - staleMs);
    return this.knex('access_code_push_outbox')
      .where('status', 'in_progress')
      .andWhere('updated_at', '<', cutoff)
      .update({
        status: 'pending',
        last_error: 'Recovered stale in_progress delivery',
        updated_at: new Date(),
      });
  }

  async hasPendingForFacility(facilityId: string): Promise<boolean> {
    const row = await this.findActiveForFacility(facilityId);
    return row !== null;
  }
}
