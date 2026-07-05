import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';

export interface FMSWebhookEventRecord {
  id: string;
  facility_id: string;
  external_event_id: string;
  event_type: string;
  received_at: Date;
  processed_at?: Date | null;
  sync_log_id?: string | null;
  event_summary?: Record<string, unknown> | null;
}

export class FMSWebhookEventModel {
  private db: Knex;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  async findByExternalEventId(
    facilityId: string,
    externalEventId: string
  ): Promise<FMSWebhookEventRecord | null> {
    const row = await this.db('fms_webhook_events')
      .where({ facility_id: facilityId, external_event_id: externalEventId })
      .first();
    return row ?? null;
  }

  /** True when Storable delivery was fully processed (safe to dedupe retries). */
  isProcessed(record: FMSWebhookEventRecord): boolean {
    return record.processed_at != null;
  }

  async deleteByExternalEventId(facilityId: string, externalEventId: string): Promise<void> {
    await this.db('fms_webhook_events')
      .where({ facility_id: facilityId, external_event_id: externalEventId })
      .del();
  }

  async create(data: {
    facility_id: string;
    external_event_id: string;
    event_type: string;
    sync_log_id?: string;
  }): Promise<FMSWebhookEventRecord> {
    const id = randomUUID();
    try {
      await this.db('fms_webhook_events').insert({
        id,
        facility_id: data.facility_id,
        external_event_id: data.external_event_id,
        event_type: data.event_type,
        received_at: this.db.fn.now(),
        processed_at: null,
        sync_log_id: data.sync_log_id ?? null,
      });

      const row = await this.db('fms_webhook_events').where({ id }).first();
      if (!row) {
        throw new Error('Failed to retrieve created webhook event record');
      }
      return row as FMSWebhookEventRecord;
    } catch (error) {
      logger.error('Error creating FMS webhook event record:', error);
      throw error;
    }
  }

  async markProcessed(id: string, syncLogId: string, eventSummary?: Record<string, unknown>): Promise<void> {
    await this.db('fms_webhook_events')
      .where({ id })
      .update({
        processed_at: this.db.fn.now(),
        sync_log_id: syncLogId,
        ...(eventSummary ? { event_summary: JSON.stringify(eventSummary) } : {}),
      });
  }

  async findRecentByFacility(facilityId: string, limit = 5): Promise<FMSWebhookEventRecord[]> {
    const rows = await this.db('fms_webhook_events')
      .where({ facility_id: facilityId })
      .whereNotNull('processed_at')
      .orderBy('received_at', 'desc')
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      event_summary:
        typeof row.event_summary === 'string'
          ? JSON.parse(row.event_summary)
          : row.event_summary ?? null,
    })) as FMSWebhookEventRecord[];
  }
}
