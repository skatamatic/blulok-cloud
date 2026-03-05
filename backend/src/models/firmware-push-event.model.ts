import { DatabaseService } from '../services/database.service';
import { v4 as uuidv4 } from 'uuid';

export type FirmwarePushEventType = 'progress' | 'device_status' | 'error' | 'info';
export type ErrorSeverity = 'warning' | 'critical';

export interface FirmwarePushEvent {
  id: string;
  push_id: string;
  event_type: FirmwarePushEventType;
  progress_percent?: number;
  phase?: string;
  device_id?: string;
  device_status?: string;
  error_code?: string;
  error_message?: string;
  error_severity?: ErrorSeverity;
  message?: string;
  metadata?: Record<string, any>;
  reported_at: Date;
  created_at: Date;
}

export interface CreateFirmwarePushEventData {
  push_id: string;
  event_type: FirmwarePushEventType;
  progress_percent?: number;
  phase?: string;
  device_id?: string;
  device_status?: string;
  error_code?: string;
  error_message?: string;
  error_severity?: ErrorSeverity;
  message?: string;
  metadata?: Record<string, any>;
  reported_at?: Date;
}

/**
 * Tracks per-device firmware status as last reported by the gateway.
 * Derived from the latest device_status event per device_id.
 */
export interface FirmwareDeviceStatusSummary {
  device_id: string;
  status: string;
  progress_percent?: number;
  error?: string;
  reported_at: Date;
}

export class FirmwarePushEventModel {
  private db = DatabaseService.getInstance();

  async create(data: CreateFirmwarePushEventData): Promise<FirmwarePushEvent> {
    const knex = this.db.connection;
    const id = uuidv4();
    const now = new Date();
    const row = {
      id,
      push_id: data.push_id,
      event_type: data.event_type,
      progress_percent: data.progress_percent ?? null,
      phase: data.phase ?? null,
      device_id: data.device_id ?? null,
      device_status: data.device_status ?? null,
      error_code: data.error_code ?? null,
      error_message: data.error_message ?? null,
      error_severity: data.error_severity ?? null,
      message: data.message ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      reported_at: data.reported_at ?? now,
      created_at: now,
    };
    await knex('firmware_push_events').insert(row);
    return { ...row, metadata: data.metadata ?? null } as unknown as FirmwarePushEvent;
  }

  async createMany(events: CreateFirmwarePushEventData[]): Promise<void> {
    if (events.length === 0) return;
    const knex = this.db.connection;
    const now = new Date();
    const rows = events.map((data) => ({
      id: uuidv4(),
      push_id: data.push_id,
      event_type: data.event_type,
      progress_percent: data.progress_percent ?? null,
      phase: data.phase ?? null,
      device_id: data.device_id ?? null,
      device_status: data.device_status ?? null,
      error_code: data.error_code ?? null,
      error_message: data.error_message ?? null,
      error_severity: data.error_severity ?? null,
      message: data.message ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      reported_at: data.reported_at ?? now,
      created_at: now,
    }));
    await knex('firmware_push_events').insert(rows);
  }

  async findByPushId(pushId: string, limit = 50, offset = 0): Promise<FirmwarePushEvent[]> {
    const knex = this.db.connection;
    const rows = await knex('firmware_push_events')
      .where('push_id', pushId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return rows.map(this.deserialize);
  }

  async findByPushIdAndType(pushId: string, eventType: FirmwarePushEventType, limit = 50, offset = 0): Promise<FirmwarePushEvent[]> {
    const knex = this.db.connection;
    const rows = await knex('firmware_push_events')
      .where('push_id', pushId)
      .where('event_type', eventType)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return rows.map(this.deserialize);
  }

  /**
   * Get the latest status per device_id for a push.
   * Uses a windowed ranking query so each device contributes exactly one row.
   * This avoids duplicate rows when multiple events share the same created_at second.
   */
  async getDeviceStatuses(pushId: string): Promise<FirmwareDeviceStatusSummary[]> {
    const knex = this.db.connection;

    const ranked = knex('firmware_push_events')
      .select(
        'device_id',
        knex.raw('device_status as status'),
        'progress_percent',
        knex.raw('error_message as error'),
        'reported_at',
        knex.raw(
          'ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY reported_at DESC, created_at DESC, id DESC) AS rn',
        ),
      )
      .where('push_id', pushId)
      .where('event_type', 'device_status')
      .whereNotNull('device_id')
      .as('ranked');

    const rows = await knex(ranked)
      .select(
        'device_id',
        'status',
        'progress_percent',
        'error',
        'reported_at',
      )
      .where('rn', 1)
      .orderBy('device_id');

    return rows as FirmwareDeviceStatusSummary[];
  }

  async countByPushId(pushId: string): Promise<number> {
    const knex = this.db.connection;
    const result = await knex('firmware_push_events')
      .where('push_id', pushId)
      .count('id as count')
      .first();
    return Number(result?.count ?? 0);
  }

  private deserialize(row: Record<string, unknown>): FirmwarePushEvent {
    let metadata = row.metadata ?? null;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = null;
      }
    }
    return { ...row, metadata } as FirmwarePushEvent;
  }
}
