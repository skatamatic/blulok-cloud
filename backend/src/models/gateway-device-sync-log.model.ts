import { randomUUID } from 'crypto';
import { DatabaseService } from '../services/database.service';
import type {
  DeviceSyncLogEntry,
  GatewayDeviceSyncLogRecord,
} from '../types/gateway-device-sync.types';

export interface CreateGatewayDeviceSyncLogData {
  gateway_id: string;
  facility_id: string;
  sync_kind: 'inventory' | 'state';
  source?: string;
  summary: GatewayDeviceSyncLogRecord['summary'];
  entries: DeviceSyncLogEntry[];
}

export class GatewayDeviceSyncLogModel {
  private get db() {
    return DatabaseService.getInstance();
  }

  async create(data: CreateGatewayDeviceSyncLogData): Promise<GatewayDeviceSyncLogRecord> {
    const knex = this.db.connection;
    const id = randomUUID();
    await knex('gateway_device_sync_logs').insert({
      id,
      gateway_id: data.gateway_id,
      facility_id: data.facility_id,
      sync_kind: data.sync_kind,
      source: data.source ?? 'gateway_ws',
      summary: JSON.stringify(data.summary),
      entries: JSON.stringify(data.entries),
      created_at: new Date(),
    });

    const row = await knex('gateway_device_sync_logs').where('id', id).first();
    return this.mapRow(row);
  }

  async findByGatewayId(
    gatewayId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ logs: GatewayDeviceSyncLogRecord[]; total: number }> {
    const knex = this.db.connection;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const baseQuery = knex('gateway_device_sync_logs').where('gateway_id', gatewayId);
    const countRow = await baseQuery.clone().count<{ count: string | number }[]>({ count: '*' }).first();
    const total = Number(countRow?.count ?? 0);

    const rows = await baseQuery
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      logs: rows.map((row) => this.mapRow(row)),
      total,
    };
  }

  private mapRow(row: Record<string, unknown>): GatewayDeviceSyncLogRecord {
    return {
      id: String(row.id),
      gateway_id: String(row.gateway_id),
      facility_id: String(row.facility_id),
      sync_kind: row.sync_kind as GatewayDeviceSyncLogRecord['sync_kind'],
      source: String(row.source ?? 'gateway_ws'),
      summary: this.parseJson(row.summary, {}),
      entries: this.parseJson(row.entries, []),
      created_at: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    };
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback;
    if (typeof value === 'object') return value as T;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
}
