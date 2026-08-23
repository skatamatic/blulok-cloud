import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import type { FMSWebhookRecordStatus } from '@/types/fms.types';

export interface FMSWebhookEventRecord {
  id: string;
  facility_id: string;
  external_event_id: string;
  event_type: string;
  received_at: Date;
  processed_at?: Date | null;
  sync_log_id?: string | null;
  event_summary?: Record<string, unknown> | null;
  status?: FMSWebhookRecordStatus;
  error_message?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

function parseJsonField(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export class FMSWebhookEventModel {
  private db: Knex;

  constructor() {
    this.db = DatabaseService.getInstance().connection;
  }

  private parseRow(row: Record<string, unknown>): FMSWebhookEventRecord {
    return {
      ...(row as unknown as FMSWebhookEventRecord),
      event_summary: parseJsonField(row.event_summary),
      raw_payload: parseJsonField(row.raw_payload),
      status: (row.status as FMSWebhookRecordStatus | undefined) || 'processed',
      error_message: (row.error_message as string | null | undefined) ?? null,
    };
  }

  async findByExternalEventId(
    facilityId: string,
    externalEventId: string
  ): Promise<FMSWebhookEventRecord | null> {
    const row = await this.db('fms_webhook_events')
      .where({ facility_id: facilityId, external_event_id: externalEventId })
      .first();
    return row ? this.parseRow(row) : null;
  }

  /** True when Storable delivery was fully processed or intentionally ignored (safe to dedupe retries). */
  isProcessed(record: FMSWebhookEventRecord): boolean {
    if (record.status === 'failed' || record.status === 'received') return false;
    if (record.status === 'processed' || record.status === 'ignored') return true;
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
    status?: FMSWebhookRecordStatus;
    raw_payload?: Record<string, unknown> | null;
    event_summary?: Record<string, unknown> | null;
    error_message?: string | null;
  }): Promise<FMSWebhookEventRecord> {
    const id = randomUUID();
    const status = data.status ?? 'received';
    try {
      await this.db('fms_webhook_events').insert({
        id,
        facility_id: data.facility_id,
        external_event_id: data.external_event_id,
        event_type: data.event_type,
        received_at: this.db.fn.now(),
        processed_at: status === 'processed' || status === 'ignored' ? this.db.fn.now() : null,
        sync_log_id: data.sync_log_id ?? null,
        status,
        error_message: data.error_message ?? null,
        raw_payload: data.raw_payload ? JSON.stringify(data.raw_payload) : null,
        event_summary: data.event_summary ? JSON.stringify(data.event_summary) : null,
      });

      const row = await this.db('fms_webhook_events').where({ id }).first();
      if (!row) {
        throw new Error('Failed to retrieve created webhook event record');
      }
      return this.parseRow(row);
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
        status: 'processed',
        error_message: null,
        ...(eventSummary ? { event_summary: JSON.stringify(eventSummary) } : {}),
      });
  }

  async markIgnored(id: string, eventSummary?: Record<string, unknown>): Promise<void> {
    await this.db('fms_webhook_events')
      .where({ id })
      .update({
        processed_at: this.db.fn.now(),
        status: 'ignored',
        error_message: null,
        ...(eventSummary ? { event_summary: JSON.stringify(eventSummary) } : {}),
      });
  }

  async markFailed(id: string, errorMessage: string, eventSummary?: Record<string, unknown>): Promise<void> {
    await this.db('fms_webhook_events')
      .where({ id })
      .update({
        processed_at: this.db.fn.now(),
        status: 'failed',
        error_message: errorMessage.slice(0, 2000),
        ...(eventSummary ? { event_summary: JSON.stringify(eventSummary) } : {}),
      });
  }

  async findRecentByFacility(
    facilityId: string,
    limit = 5,
    options: { includeUnsuccessful?: boolean } = {}
  ): Promise<FMSWebhookEventRecord[]> {
    const query = this.db('fms_webhook_events')
      .where({ facility_id: facilityId })
      .orderBy('received_at', 'desc')
      .limit(limit);

    if (options.includeUnsuccessful) {
      query.whereIn('status', ['processed', 'failed', 'ignored']);
    } else {
      query.where((builder) => {
        builder.where('status', 'processed').orWhere((legacy) => {
          legacy.whereNull('status').whereNotNull('processed_at');
        });
      });
    }

    const rows = await query;
    return rows.map((row) => this.parseRow(row));
  }
}
