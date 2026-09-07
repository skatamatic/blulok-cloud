/**
 * Access session read layer — Access History session projection.
 * Prefer GET /api/v1/access-sessions. Raw activity_logs projection remains in
 * AccessHistoryReadService (GET /access-history, default raw; or view=raw).
 */

import {
  AccessSessionModel,
  AccessSession,
  AccessSessionWithContext,
  AccessSessionFilters,
  AccessSessionState,
} from '@/models/access-session.model';
import { ActivityLogModel } from '@/models/activity-log.model';
import { AccessEventScopeService, AccessEventScope } from '@/services/access/access-event-scope.service';
import { AuthService } from '@/services/auth.service';
import { UserRole } from '@/types/auth.types';
import { MAX_ACCESS_HISTORY_EXPORT } from '@/constants/access-history.constants';
import { parseQueryDateFrom, parseQueryDateTo, toIsoStringOrEpoch } from '@/utils/datetime.utils';
import {
  AccessHistoryReadService,
  AccessHistoryRecord,
  QueryFilters,
} from '@/services/access/access-history-read.service';
import { resolveBluLokDeviceDisplayName, isLikelyUuid } from '@/utils/blulok-device-display.utils';

export type SessionQueryFilters = QueryFilters & {
  state?: AccessSessionState;
  view?: 'sessions' | 'raw';
};

export type AccessSessionRecord = {
  id: string;
  kind: string;
  origin: string;
  method: string;
  outcome: string | null;
  state: AccessSessionState;
  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  actor_type?: string;
  actor_role?: string;
  denial_reason?: string;
  reason?: string;
  attempt_count: number;
  started_at: string;
  opened_at?: string;
  closed_at?: string;
  expires_at?: string;
  settled_at?: string;
  open_duration_sec?: number;
  remote_command_id?: string;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  device_name?: string;
  device_serial?: string;
};

export class AccessSessionReadService {
  private readonly sessionModel = new AccessSessionModel();
  private readonly activityLogModel = new ActivityLogModel();
  private readonly scopeService = new AccessEventScopeService();
  private readonly rawReadService = new AccessHistoryReadService();

  public async query(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: SessionQueryFilters,
  ): Promise<{
    sessions: AccessSessionRecord[];
    total: number;
    currently_open: number;
    limit: number;
    offset: number;
  }> {
    return this.runQuery(userId, role, facilityIds, filters, { includeTotal: true });
  }

  /**
   * Preview list for realtime snapshots: same scoping as `query` minus the
   * unbounded COUNT(*) used for pagination. Snapshots render a short list and
   * are rebuilt by every client on reconnect, so that count is pure load.
   */
  public async queryRecent(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: SessionQueryFilters,
  ): Promise<{ sessions: AccessSessionRecord[]; currently_open: number }> {
    const { sessions, currently_open } = await this.runQuery(
      userId,
      role,
      facilityIds,
      filters,
      { includeTotal: false },
    );
    return { sessions, currently_open };
  }

  private async runQuery(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: SessionQueryFilters,
    options: { includeTotal: boolean },
  ): Promise<{
    sessions: AccessSessionRecord[];
    total: number;
    currently_open: number;
    limit: number;
    offset: number;
  }> {
    const scope = await this.scopeService.buildScope(userId, role, facilityIds);
    const limit = Math.min(filters.limit || 50, 100);
    const offset = Math.max(filters.offset || 0, 0);

    if (filters.facility_id && scope.allowedFacilityIds && !AuthService.canAccessAllFacilities(role)) {
      if (!scope.allowedFacilityIds.includes(filters.facility_id)) {
        return { sessions: [], total: 0, currently_open: 0, limit, offset };
      }
    }
    if (filters.user_id && role === UserRole.MAINTENANCE && filters.user_id !== userId) {
      return { sessions: [], total: 0, currently_open: 0, limit, offset };
    }

    const sessionFilters = this.buildSessionFilters(filters, scope, role);
    const [rows, total, currentlyOpen] = await Promise.all([
      this.sessionModel.findWithContext(sessionFilters),
      options.includeTotal
        ? this.sessionModel.count({ ...sessionFilters, limit: undefined, offset: undefined })
        : Promise.resolve(0),
      this.sessionModel.countCurrentlyOpen({
        facility_id: sessionFilters.facility_id,
        facility_ids: sessionFilters.facility_ids,
        unit_id: sessionFilters.unit_id,
        unit_ids: sessionFilters.unit_ids,
        device_id: sessionFilters.device_id,
        actor_id: sessionFilters.actor_id,
        unit_or_actor_scope: sessionFilters.unit_or_actor_scope,
        from_date: sessionFilters.from_date,
        to_date: sessionFilters.to_date,
      }),
    ]);

    return {
      sessions: this.applyPostFilters(rows.map((row) => this.mapSession(row)), role, filters),
      total,
      currently_open: currentlyOpen,
      limit,
      offset,
    };
  }

  /** Refinements the SQL layer cannot express (method aliases, derived success). */
  private applyPostFilters(
    sessions: AccessSessionRecord[],
    role: UserRole,
    filters: SessionQueryFilters,
  ): AccessSessionRecord[] {
    let mapped = sessions;
    if (role === UserRole.TENANT) {
      mapped = mapped.filter((s) => s.device_type !== 'access_control');
    }
    if (filters.method) {
      mapped = mapped.filter((s) => this.methodMatches(s.method, filters.method!));
    }
    if (filters.success !== undefined) {
      mapped = mapped.filter((s) => {
        const ok = s.outcome === 'granted' && (s.state === 'open' || s.state === 'closed' || s.state === 'pending');
        return filters.success ? ok : !ok;
      });
    }
    return mapped;
  }

  public async findById(
    id: string,
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
  ): Promise<{ session: AccessSessionRecord; events: AccessHistoryRecord[] } | null> {
    const scope = await this.scopeService.buildScope(userId, role, facilityIds);
    const row = await this.sessionModel.findById(id);
    if (!row) return null;
    if (!this.sessionVisible(row, scope, role)) return null;

    const withContext = await this.sessionModel.findWithContext({ id, limit: 1 });
    const session = this.mapSession(withContext[0] || row);
    const activityRows = await this.activityLogModel.findWithContext({
      access_session_id: id,
      limit: 100,
      sortBy: 'occurred_at',
      sortOrder: 'asc',
    });
    const events = activityRows.map((a) => this.rawReadService.mapToAccessHistoryRecordPublic(a));
    return { session, events };
  }

  public async findSessionRecordById(id: string): Promise<AccessSessionRecord | null> {
    const rows = await this.sessionModel.findWithContext({ id, limit: 1 });
    if (rows.length === 0) return null;
    return this.mapSession(rows[0]);
  }

  public async exportQuery(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: SessionQueryFilters,
  ): Promise<AccessSessionRecord[]> {
    const all: AccessSessionRecord[] = [];
    let offset = 0;
    const pageSize = 100;
    while (all.length < MAX_ACCESS_HISTORY_EXPORT) {
      const page = await this.query(userId, role, facilityIds, {
        ...filters,
        limit: pageSize,
        offset,
      });
      all.push(...page.sessions);
      if (page.sessions.length < pageSize) break;
      offset += pageSize;
    }
    return all.slice(0, MAX_ACCESS_HISTORY_EXPORT);
  }

  private buildSessionFilters(
    filters: SessionQueryFilters,
    scope: AccessEventScope,
    role: UserRole,
  ): AccessSessionFilters {
    const result: AccessSessionFilters = {
      facility_id: filters.facility_id,
      unit_id: filters.unit_id,
      device_id: filters.device_id,
      state: filters.state,
      denial_reason: filters.denial_reason,
      from_date: filters.date_from ? parseQueryDateFrom(filters.date_from) : undefined,
      to_date: filters.date_to ? parseQueryDateTo(filters.date_to) : undefined,
      limit: Math.min(filters.limit || 50, 100),
      offset: Math.max(filters.offset || 0, 0),
      sortBy: 'started_at',
      sortOrder: filters.sort_order === 'asc' ? 'asc' : 'desc',
    };

    if (scope.allowedFacilityIds && !filters.facility_id) {
      result.facility_ids = scope.allowedFacilityIds;
    }
    if (role === UserRole.TENANT && scope.allowedUnitIds && scope.ownUserId) {
      if (filters.user_id) {
        result.actor_id = filters.user_id;
      } else {
        result.unit_or_actor_scope = {
          unit_ids: scope.allowedUnitIds,
          actor_id: scope.ownUserId,
        };
      }
    } else if (role === UserRole.MAINTENANCE && scope.ownUserId) {
      result.actor_id = filters.user_id || scope.ownUserId;
    } else if (filters.user_id) {
      result.actor_id = filters.user_id;
    }

    return result;
  }

  private sessionVisible(row: AccessSession, scope: AccessEventScope, role: UserRole): boolean {
    if (AuthService.canAccessAllFacilities(role)) return true;
    if (scope.allowedFacilityIds && row.facility_id && !scope.allowedFacilityIds.includes(row.facility_id)) {
      return false;
    }
    if (role === UserRole.TENANT) {
      const hasUnit = !!row.unit_id && !!scope.allowedUnitIds?.includes(row.unit_id);
      const isOwn = !!scope.ownUserId && row.actor_id === scope.ownUserId;
      return hasUnit || isOwn;
    }
    if (role === UserRole.MAINTENANCE) {
      return !!scope.ownUserId && row.actor_id === scope.ownUserId;
    }
    return true;
  }

  private methodMatches(method: string, filter: string): boolean {
    if (filter === 'cloud') {
      return method === 'admin_remote' || method === 'remote_gateway';
    }
    return method === filter;
  }

  mapSession(row: AccessSession | AccessSessionWithContext): AccessSessionRecord {
    const ctx = row as AccessSessionWithContext;
    const deviceSerial = ctx.device_serial;
    let deviceName = ctx.device_name;
    if (!deviceName && row.device_type === 'blulok') {
      deviceName = resolveBluLokDeviceDisplayName({
        unit_number: ctx.unit_number,
        device_serial: deviceSerial,
      });
    }
    if (!deviceName && deviceSerial && !isLikelyUuid(deviceSerial)) {
      deviceName = deviceSerial;
    }

    return {
      id: row.id,
      kind: row.kind,
      origin: row.origin,
      method: row.method,
      outcome: row.outcome,
      state: row.state,
      device_id: row.device_id,
      device_type: row.device_type,
      facility_id: row.facility_id || undefined,
      unit_id: row.unit_id || undefined,
      user_id: row.actor_id || undefined,
      actor_type: row.actor_type || undefined,
      actor_role: row.actor_role || undefined,
      denial_reason: row.denial_reason || undefined,
      reason: row.reason_message || undefined,
      attempt_count: row.attempt_count,
      started_at: toIsoStringOrEpoch(row.started_at),
      opened_at: row.opened_at ? toIsoStringOrEpoch(row.opened_at) : undefined,
      closed_at: row.closed_at ? toIsoStringOrEpoch(row.closed_at) : undefined,
      expires_at: row.expires_at ? toIsoStringOrEpoch(row.expires_at) : undefined,
      settled_at: row.settled_at ? toIsoStringOrEpoch(row.settled_at) : undefined,
      open_duration_sec: row.open_duration_sec ?? undefined,
      remote_command_id: row.remote_command_id || undefined,
      correlation_id: row.correlation_id || undefined,
      metadata: row.metadata || undefined,
      facility_name: ctx.facility_name,
      unit_number: ctx.unit_number,
      user_name: row.actor_name || undefined,
      user_email: ctx.actor_user_email || undefined,
      device_name: deviceName,
      device_serial: deviceSerial,
    };
  }
}
