/**
 * Access Session Model
 *
 * Persisted aggregate for one logical access (pending → open → closed, or terminal).
 * activity_logs remains the raw audit trail linked via access_session_id.
 */

import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/services/database.service';
import { logger } from '@/utils/logger';
import {
  ACCESS_SESSION_KINDS,
  ACCESS_SESSION_ORIGINS,
  ACCESS_SESSION_OUTCOMES,
  ACCESS_SESSION_STATES,
} from '@/constants/access-session.constants';

export type AccessSessionState = (typeof ACCESS_SESSION_STATES)[number];
export type AccessSessionOrigin = (typeof ACCESS_SESSION_ORIGINS)[number];
export type AccessSessionKind = (typeof ACCESS_SESSION_KINDS)[number];
export type AccessSessionOutcome = (typeof ACCESS_SESSION_OUTCOMES)[number];
export type AccessSessionDeviceType = 'blulok' | 'access_control';
export type AccessSessionActorType = 'user' | 'system' | 'device' | 'gateway';

// Re-export constants for consumers that import types from the model
export {
  ACCESS_SESSION_KINDS,
  ACCESS_SESSION_ORIGINS,
  ACCESS_SESSION_OUTCOMES,
  ACCESS_SESSION_STATES,
};

export interface AccessSession {
  id: string;
  facility_id: string | null;
  unit_id: string | null;
  device_id: string;
  device_type: AccessSessionDeviceType;
  gateway_id: string | null;
  kind: AccessSessionKind;
  origin: AccessSessionOrigin;
  method: string;
  outcome: AccessSessionOutcome | null;
  state: AccessSessionState;
  actor_type: AccessSessionActorType | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  denial_reason: string | null;
  reason_message: string | null;
  started_at: Date;
  opened_at: Date | null;
  closed_at: Date | null;
  expires_at: Date | null;
  settled_at: Date | null;
  open_duration_sec: number | null;
  attempt_count: number;
  remote_command_id: string | null;
  correlation_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface AccessSessionWithContext extends AccessSession {
  unit_number?: string;
  facility_name?: string;
  device_serial?: string;
  device_name?: string;
  actor_user_email?: string | null;
}

export interface CreateAccessSessionData {
  facility_id?: string;
  unit_id?: string;
  device_id: string;
  device_type?: AccessSessionDeviceType;
  gateway_id?: string;
  kind?: AccessSessionKind;
  origin: AccessSessionOrigin;
  method: string;
  outcome?: AccessSessionOutcome | null;
  state: AccessSessionState;
  actor_type?: AccessSessionActorType;
  actor_id?: string;
  actor_name?: string;
  actor_role?: string;
  denial_reason?: string;
  reason_message?: string;
  started_at?: Date;
  opened_at?: Date;
  closed_at?: Date;
  expires_at?: Date;
  settled_at?: Date;
  open_duration_sec?: number;
  attempt_count?: number;
  remote_command_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAccessSessionData {
  unit_id?: string | null;
  gateway_id?: string | null;
  origin?: AccessSessionOrigin;
  method?: string;
  outcome?: AccessSessionOutcome | null;
  state?: AccessSessionState;
  actor_type?: AccessSessionActorType | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  denial_reason?: string | null;
  reason_message?: string | null;
  opened_at?: Date | null;
  closed_at?: Date | null;
  expires_at?: Date | null;
  settled_at?: Date | null;
  open_duration_sec?: number | null;
  attempt_count?: number;
  correlation_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AccessSessionFilters {
  id?: string;
  facility_id?: string;
  facility_ids?: string[];
  unit_id?: string;
  unit_ids?: string[];
  device_id?: string;
  actor_id?: string;
  unit_or_actor_scope?: {
    unit_ids: string[];
    actor_id: string;
  };
  state?: AccessSessionState;
  states?: AccessSessionState[];
  method?: string;
  origin?: AccessSessionOrigin;
  outcome?: AccessSessionOutcome;
  denial_reason?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  max_limit?: number;
  offset?: number;
  sortBy?: 'started_at' | 'opened_at' | 'closed_at' | 'created_at';
  sortOrder?: 'asc' | 'desc';
}

const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 100;

export class AccessSessionModel {
  private db = DatabaseService.getInstance();

  async create(data: CreateAccessSessionData): Promise<AccessSession> {
    const knex = this.db.connection;
    const id = uuidv4();
    const now = new Date();
    const startedAt = data.started_at || now;

    const row = {
      id,
      facility_id: data.facility_id || null,
      unit_id: data.unit_id || null,
      device_id: data.device_id,
      device_type: data.device_type || 'blulok',
      gateway_id: data.gateway_id || null,
      kind: data.kind || 'access',
      origin: data.origin,
      method: data.method,
      outcome: data.outcome ?? null,
      state: data.state,
      actor_type: data.actor_type || null,
      actor_id: data.actor_id || null,
      actor_name: data.actor_name || null,
      actor_role: data.actor_role || null,
      denial_reason: data.denial_reason || null,
      reason_message: data.reason_message || null,
      started_at: startedAt,
      opened_at: data.opened_at || null,
      closed_at: data.closed_at || null,
      expires_at: data.expires_at || null,
      settled_at: data.settled_at || null,
      open_duration_sec: data.open_duration_sec ?? null,
      attempt_count: data.attempt_count ?? 1,
      remote_command_id: data.remote_command_id || null,
      correlation_id: data.correlation_id || null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      created_at: now,
      updated_at: now,
    };

    await knex('access_sessions').insert(row);
    logger.debug(`Created access session ${id}: ${data.state} ${data.origin}/${data.method} on ${data.device_id}`);
    return this.parse(row);
  }

  async findById(id: string): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const row = await knex('access_sessions').where('id', id).first();
    return row ? this.parse(row) : null;
  }

  async update(id: string, data: UpdateAccessSessionData): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const patch: Record<string, unknown> = { updated_at: new Date() };

    const assign = <K extends keyof UpdateAccessSessionData>(key: K) => {
      if (data[key] !== undefined) {
        patch[key] = data[key];
      }
    };

    assign('unit_id');
    assign('gateway_id');
    assign('origin');
    assign('method');
    assign('outcome');
    assign('state');
    assign('actor_type');
    assign('actor_id');
    assign('actor_name');
    assign('actor_role');
    assign('denial_reason');
    assign('reason_message');
    assign('opened_at');
    assign('closed_at');
    assign('expires_at');
    assign('settled_at');
    assign('open_duration_sec');
    assign('attempt_count');
    assign('correlation_id');

    if (data.metadata !== undefined) {
      patch.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
    }

    await knex('access_sessions').where('id', id).update(patch);
    return this.findById(id);
  }

  async findOpenByDevice(deviceId: string): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const row = await knex('access_sessions')
      .where({ device_id: deviceId, state: 'open' })
      .orderBy('opened_at', 'desc')
      .orderBy('started_at', 'desc')
      .first();
    return row ? this.parse(row) : null;
  }

  /**
   * Most recent non-denial access session on a device (for attaching a lock event
   * when there is no currently-open session). Prefer open, then pending, then other.
   */
  async findLatestUnlockSessionByDevice(deviceId: string): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const row = await knex('access_sessions')
      .where({ device_id: deviceId, kind: 'access' })
      .whereNotIn('state', ['denied'])
      .orderByRaw(
        `CASE state WHEN 'open' THEN 0 WHEN 'pending' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END`,
      )
      .orderBy('started_at', 'desc')
      .first();
    return row ? this.parse(row) : null;
  }

  async findPendingByDevice(deviceId: string): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const row = await knex('access_sessions')
      .where({ device_id: deviceId, state: 'pending' })
      .orderBy('started_at', 'desc')
      .first();
    return row ? this.parse(row) : null;
  }

  async findPendingByRemoteCommandId(remoteCommandId: string): Promise<AccessSession | null> {
    const knex = this.db.connection;
    const row = await knex('access_sessions')
      .where({ remote_command_id: remoteCommandId, state: 'pending' })
      .first();
    return row ? this.parse(row) : null;
  }

  async findExpiredPending(now: Date = new Date(), limit = 200): Promise<AccessSession[]> {
    const knex = this.db.connection;
    const rows = await knex('access_sessions')
      .where({ state: 'pending' })
      .whereNotNull('expires_at')
      .where('expires_at', '<=', now)
      .orderBy('expires_at', 'asc')
      .limit(limit);
    return rows.map((r: unknown) => this.parse(r));
  }

  async find(filters: AccessSessionFilters = {}): Promise<AccessSession[]> {
    const knex = this.db.connection;
    let query = knex('access_sessions');
    query = this.applyFilters(query, filters);
    const sortBy = filters.sortBy || 'started_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.orderBy(sortBy, sortOrder);
    const maxCap = filters.max_limit ?? MAX_QUERY_LIMIT;
    const limit = Math.min(filters.limit || DEFAULT_QUERY_LIMIT, maxCap);
    query = query.limit(limit);
    if (filters.offset) query = query.offset(filters.offset);
    const rows = await query;
    return rows.map((r: unknown) => this.parse(r));
  }

  async findWithContext(filters: AccessSessionFilters = {}): Promise<AccessSessionWithContext[]> {
    const knex = this.db.connection;
    let query = knex('access_sessions')
      .select(
        'access_sessions.*',
        'units.unit_number',
        'facilities.name as facility_name',
        'blulok_devices.device_serial as blulok_device_serial',
        'access_control_devices.device_serial as access_control_device_serial',
        'access_control_devices.name as access_control_device_name',
        'actor_users.email as actor_user_email',
      )
      .leftJoin('units', 'access_sessions.unit_id', 'units.id')
      .leftJoin('facilities', 'access_sessions.facility_id', 'facilities.id')
      .leftJoin('blulok_devices', function joinBluLok() {
        this.on('access_sessions.device_id', '=', 'blulok_devices.id')
          .orOn('access_sessions.device_id', '=', 'blulok_devices.device_serial');
      })
      .leftJoin('access_control_devices', function joinAc() {
        this.on('access_sessions.device_id', '=', 'access_control_devices.id')
          .orOn('access_sessions.device_id', '=', 'access_control_devices.device_serial');
      })
      .leftJoin('users as actor_users', 'access_sessions.actor_id', 'actor_users.id');

    query = this.applyFilters(query, filters, 'access_sessions.');
    const sortBy = filters.sortBy || 'started_at';
    const sortOrder = filters.sortOrder || 'desc';
    query = query.orderBy(`access_sessions.${sortBy}`, sortOrder);
    const maxCap = filters.max_limit ?? MAX_QUERY_LIMIT;
    const limit = Math.min(filters.limit || DEFAULT_QUERY_LIMIT, maxCap);
    query = query.limit(limit);
    if (filters.offset) query = query.offset(filters.offset);

    const rows = await query;
    return rows.map((r: any) => ({
      ...this.parse(r),
      unit_number: r.unit_number,
      facility_name: r.facility_name,
      device_serial: r.blulok_device_serial || r.access_control_device_serial,
      device_name: r.access_control_device_name || undefined,
      actor_user_email: r.actor_user_email ?? null,
    }));
  }

  async count(filters: AccessSessionFilters = {}): Promise<number> {
    const knex = this.db.connection;
    const countFilters = { ...filters };
    delete countFilters.limit;
    delete countFilters.offset;
    delete countFilters.sortBy;
    delete countFilters.sortOrder;
    let query = knex('access_sessions');
    query = this.applyFilters(query, countFilters);
    const result = await query.count('* as count').first();
    return parseInt(result?.count as string, 10) || 0;
  }

  async countCurrentlyOpen(filters: Omit<AccessSessionFilters, 'state' | 'states'> = {}): Promise<number> {
    return this.count({ ...filters, state: 'open' });
  }

  private applyFilters(query: any, filters: AccessSessionFilters, tablePrefix = ''): any {
    // Operator-facing lists never include legacy lock_only rows (locks belong on unlock sessions).
    query = query.where(`${tablePrefix}kind`, 'access');
    if (filters.id) query = query.where(`${tablePrefix}id`, filters.id);
    if (filters.facility_id) {
      query = query.where(`${tablePrefix}facility_id`, filters.facility_id);
    } else if (filters.facility_ids?.length) {
      query = query.whereIn(`${tablePrefix}facility_id`, filters.facility_ids);
    }
    if (filters.unit_or_actor_scope) {
      const { unit_ids, actor_id } = filters.unit_or_actor_scope;
      query = query.where(function scopeUnitOrActor(this: import('knex').Knex.QueryBuilder) {
        if (unit_ids.length > 0) {
          this.whereIn(`${tablePrefix}unit_id`, unit_ids).orWhere(`${tablePrefix}actor_id`, actor_id);
        } else {
          this.where(`${tablePrefix}actor_id`, actor_id);
        }
      });
    } else {
      if (filters.unit_id) {
        query = query.where(`${tablePrefix}unit_id`, filters.unit_id);
      } else if (filters.unit_ids?.length) {
        query = query.whereIn(`${tablePrefix}unit_id`, filters.unit_ids);
      }
      if (filters.actor_id) query = query.where(`${tablePrefix}actor_id`, filters.actor_id);
    }
    if (filters.device_id) query = query.where(`${tablePrefix}device_id`, filters.device_id);
    if (filters.states?.length) {
      query = query.whereIn(`${tablePrefix}state`, filters.states);
    } else if (filters.state) {
      query = query.where(`${tablePrefix}state`, filters.state);
    }
    if (filters.method) query = query.where(`${tablePrefix}method`, filters.method);
    if (filters.origin) query = query.where(`${tablePrefix}origin`, filters.origin);
    if (filters.outcome) query = query.where(`${tablePrefix}outcome`, filters.outcome);
    if (filters.denial_reason) query = query.where(`${tablePrefix}denial_reason`, filters.denial_reason);
    if (filters.from_date) query = query.where(`${tablePrefix}started_at`, '>=', filters.from_date);
    if (filters.to_date) query = query.where(`${tablePrefix}started_at`, '<=', filters.to_date);
    return query;
  }

  private parse(row: any): AccessSession {
    return {
      ...row,
      attempt_count: Number(row.attempt_count) || 1,
      open_duration_sec: row.open_duration_sec != null ? Number(row.open_duration_sec) : null,
      metadata: row.metadata ? this.safeParseJson(row.metadata) : null,
      started_at: row.started_at instanceof Date ? row.started_at : new Date(row.started_at),
      opened_at: row.opened_at ? (row.opened_at instanceof Date ? row.opened_at : new Date(row.opened_at)) : null,
      closed_at: row.closed_at ? (row.closed_at instanceof Date ? row.closed_at : new Date(row.closed_at)) : null,
      expires_at: row.expires_at ? (row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at)) : null,
      settled_at: row.settled_at ? (row.settled_at instanceof Date ? row.settled_at : new Date(row.settled_at)) : null,
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    };
  }

  private safeParseJson(value: unknown): Record<string, unknown> | null {
    if (value == null) return null;
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}
