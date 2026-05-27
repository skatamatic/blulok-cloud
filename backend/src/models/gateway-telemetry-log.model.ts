import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { DatabaseService } from '../services/database.service';
import { payloadPathToJsonExtract } from '@/utils/gateway-telemetry-log.parser';
import {
  GATEWAY_TELEMETRY_LOG_RETENTION,
} from '@/constants/gateway-telemetry-log.constants';

export { GATEWAY_TELEMETRY_LOG_RETENTION } from '@/constants/gateway-telemetry-log.constants';
export { GATEWAY_TELEMETRY_LOG_MAX_INGEST_BATCH } from '@/constants/gateway-telemetry-log.constants';

export interface GatewayTelemetryLogRecord {
  id: string;
  gateway_id: string;
  facility_id: string;
  logged_at: Date;
  payload: Record<string, unknown> | null;
  source: string;
  created_at: Date;
}

export interface CreateGatewayTelemetryLogData {
  gateway_id: string;
  facility_id: string;
  logged_at: Date;
  payload: Record<string, unknown> | null;
  source?: string;
}

export interface GatewayTelemetryLogListFilters {
  from?: Date;
  to?: Date;
  search?: string;
  payload_path?: string;
  payload_value?: string;
  payload_op?: 'eq' | 'contains';
}

export class GatewayTelemetryLogModel {
  private get db() {
    return DatabaseService.getInstance();
  }

  async createMany(
    rows: CreateGatewayTelemetryLogData[],
    trx?: Knex.Transaction,
  ): Promise<GatewayTelemetryLogRecord[]> {
    if (rows.length === 0) return [];
    const knex = trx ?? this.db.connection;
    const inserts = rows.map((row) => ({
      id: randomUUID(),
      gateway_id: row.gateway_id,
      facility_id: row.facility_id,
      logged_at: row.logged_at,
      payload: row.payload ? JSON.stringify(row.payload) : null,
      source: row.source ?? 'gateway_ws',
      created_at: new Date(),
    }));

    await knex('gateway_telemetry_logs').insert(inserts);
    const ids = inserts.map((r) => r.id);
    const created = await knex('gateway_telemetry_logs').whereIn('id', ids).orderBy('logged_at', 'desc');
    return created.map((row) => this.mapRow(row));
  }

  async trimToRetention(
    gatewayId: string,
    maxRows: number = GATEWAY_TELEMETRY_LOG_RETENTION,
    trx?: Knex.Transaction,
  ): Promise<number> {
    const knex = trx ?? this.db.connection;
    const countRow = await knex('gateway_telemetry_logs')
      .where('gateway_id', gatewayId)
      .count<{ count: string | number }[]>({ count: '*' })
      .first();
    const total = Number(countRow?.count ?? 0);
    if (total <= maxRows) return 0;

    const excess = total - maxRows;
    const oldest = await knex('gateway_telemetry_logs')
      .where('gateway_id', gatewayId)
      .orderBy('logged_at', 'asc')
      .orderBy('created_at', 'asc')
      .limit(excess)
      .select('id');

    const idsToDelete = oldest.map((r) => r.id);
    if (idsToDelete.length === 0) return 0;

    return knex('gateway_telemetry_logs').whereIn('id', idsToDelete).del();
  }

  async insertAndTrim(
    gatewayId: string,
    rows: CreateGatewayTelemetryLogData[],
    maxRows: number = GATEWAY_TELEMETRY_LOG_RETENTION,
  ): Promise<GatewayTelemetryLogRecord[]> {
    if (rows.length === 0) return [];
    const knex = this.db.connection;
    return knex.transaction(async (trx) => {
      const created = await this.createMany(rows, trx);
      await this.trimToRetention(gatewayId, maxRows, trx);
      return created;
    });
  }

  async listByGateway(
    gatewayId: string,
    filters: GatewayTelemetryLogListFilters,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ logs: GatewayTelemetryLogRecord[]; total: number }> {
    const knex = this.db.connection;
    const limit = Math.min(Math.max(options.limit ?? 500, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);

    const applyFilters = (query: Knex.QueryBuilder) => {
      query.where('gateway_id', gatewayId);

      if (filters.from) {
        query.where('logged_at', '>=', filters.from);
      }
      if (filters.to) {
        query.where('logged_at', '<=', filters.to);
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        query.where((builder) => {
          builder
            .whereRaw('CAST(payload AS CHAR) LIKE ?', [term])
            .orWhereRaw("JSON_SEARCH(payload, 'one', ?) IS NOT NULL", [filters.search!.trim()]);
        });
      }

      if (filters.payload_path && filters.payload_value !== undefined) {
        const jsonPath = payloadPathToJsonExtract(filters.payload_path);
        const op = filters.payload_op === 'contains' ? 'contains' : 'eq';
        if (op === 'eq') {
          query.whereRaw('JSON_UNQUOTE(JSON_EXTRACT(payload, ?)) = ?', [jsonPath, filters.payload_value]);
        } else {
          query.whereRaw('JSON_UNQUOTE(JSON_EXTRACT(payload, ?)) LIKE ?', [
            jsonPath,
            `%${filters.payload_value}%`,
          ]);
        }
      }
    };

    const countQuery = knex('gateway_telemetry_logs');
    applyFilters(countQuery);
    const countRow = await countQuery.count<{ count: string | number }[]>({ count: '*' }).first();
    const total = Number(countRow?.count ?? 0);

    const dataQuery = knex('gateway_telemetry_logs');
    applyFilters(dataQuery);
    const rows = await dataQuery
      .orderBy('logged_at', 'desc')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return {
      logs: rows.map((row) => this.mapRow(row)),
      total,
    };
  }

  private mapRow(row: Record<string, unknown>): GatewayTelemetryLogRecord {
    return {
      id: String(row.id),
      gateway_id: String(row.gateway_id),
      facility_id: String(row.facility_id),
      logged_at: row.logged_at instanceof Date ? row.logged_at : new Date(String(row.logged_at)),
      payload: this.parseJson(row.payload, null),
      source: String(row.source ?? 'gateway_ws'),
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
