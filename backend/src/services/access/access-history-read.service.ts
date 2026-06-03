import { ActivityLog, ActivityLogFilters, ActivityLogModel, ActivityLogWithContext, ActivityType } from '@/models/activity-log.model';
import { UserRole } from '@/types/auth.types';
import { AccessEventScopeService, AccessEventScope } from '@/services/access/access-event-scope.service';
import { AuthService } from '@/services/auth.service';
import { AccessLogFilters, AccessLogModel } from '@/models/access-log.model';
import { DASHBOARD_ACTIVITY_TYPES, MAX_ACCESS_HISTORY_EXPORT } from '@/constants/access-history.constants';

export type QueryFilters = {
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  device_id?: string;
  action?: string;
  method?: string;
  success?: boolean;
  denial_reason?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
};

export type AccessHistoryRecord = {
  id: string;
  device_id: string;
  device_type: 'blulok' | 'access_control';
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  action: string;
  method: string;
  success: boolean;
  denial_reason?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  facility_name?: string;
  unit_number?: string;
  user_name?: string;
  user_email?: string;
  actor_type?: string;
  device_name?: string;
  device_location?: string;
  device_serial?: string;
};

export class AccessHistoryReadService {
  private readonly activityLogModel = new ActivityLogModel();
  private readonly scopeService = new AccessEventScopeService();
  private readonly legacyAccessLogModel = new AccessLogModel();

  static readonly DASHBOARD_ACTIVITY_TYPES = DASHBOARD_ACTIVITY_TYPES;

  public async query(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: QueryFilters,
  ): Promise<{ logs: AccessHistoryRecord[]; total: number; limit: number; offset: number }> {
    const scope = await this.scopeService.buildScope(userId, role, facilityIds);

    if (filters.facility_id && scope.allowedFacilityIds && !AuthService.canAccessAllFacilities(role)) {
      if (!scope.allowedFacilityIds.includes(filters.facility_id)) {
        return { logs: [], total: 0, limit: filters.limit || 50, offset: filters.offset || 0 };
      }
    }

    if (filters.user_id && role === UserRole.MAINTENANCE && filters.user_id !== userId) {
      return { logs: [], total: 0, limit: filters.limit || 50, offset: filters.offset || 0 };
    }

    const dashboardActivityTypes = AccessHistoryReadService.DASHBOARD_ACTIVITY_TYPES;

    const activityFilters = this.buildActivityFilters(filters, scope, dashboardActivityTypes);

    const rows = await this.activityLogModel.findWithContext(activityFilters);

    const scopedRows = this.applyPostQueryScope(rows, scope);
    const filteredRows = scopedRows.filter((row) => this.matchesAccessFilters(row, filters));
    const mapped = filteredRows.map((row) => this.mapToAccessHistoryRecord(row));

    if (mapped.length === 0) {
      const legacyFilters: AccessLogFilters = {
        facility_id: filters.facility_id,
        unit_id: filters.unit_id,
        user_id: filters.user_id,
        device_id: filters.device_id,
        action: filters.action,
        method: filters.method,
        success: filters.success,
        denial_reason: filters.denial_reason,
        date_from: filters.date_from ? new Date(filters.date_from) : undefined,
        date_to: filters.date_to ? new Date(filters.date_to) : undefined,
        limit: Math.min(filters.limit || 50, 100),
        offset: Math.max(filters.offset || 0, 0),
        sort_by: filters.sort_by === 'created_at' ? 'occurred_at' : 'occurred_at',
        sort_order: filters.sort_order === 'asc' ? 'asc' : 'desc',
      };
      if (role === UserRole.TENANT && scope.allowedUnitIds) {
        legacyFilters.user_accessible_units = scope.allowedUnitIds;
      }
      // Legacy read path supports a single facility_id filter and tenant unit scoping.
      if (role === UserRole.MAINTENANCE && scope.ownUserId) {
        legacyFilters.user_id = scope.ownUserId;
      }
      const legacy = await this.legacyAccessLogModel.findAll(legacyFilters);
      const scopedLegacyLogs = (legacy.logs as unknown as AccessHistoryRecord[]).filter((log) => {
        if (filters.facility_id && log.facility_id !== filters.facility_id) return false;
        if (filters.unit_id && log.unit_id !== filters.unit_id) return false;
        if (filters.user_id && log.user_id !== filters.user_id) return false;
        if (filters.device_id && log.device_id !== filters.device_id) return false;
        if (filters.action && log.action !== filters.action) return false;
        if (filters.method && log.method !== filters.method) return false;
        if (filters.denial_reason && log.denial_reason !== filters.denial_reason) return false;
        if (filters.success !== undefined && log.success !== filters.success) return false;

        if (AuthService.isFacilityAdmin(role) && scope.allowedFacilityIds && log.facility_id && !scope.allowedFacilityIds.includes(log.facility_id)) {
          return false;
        }
        if (role === UserRole.TENANT) {
          const hasUnitScope = !!log.unit_id && !!scope.allowedUnitIds?.includes(log.unit_id);
          const isOwn = !!scope.ownUserId && log.user_id === scope.ownUserId;
          if (!hasUnitScope && !isOwn) {
            return false;
          }
        }
        if (role === UserRole.MAINTENANCE && scope.ownUserId && log.user_id !== scope.ownUserId) {
          return false;
        }
        return true;
      });
      if (role === UserRole.TENANT && scopedLegacyLogs.length === 0) {
        const ownOnly = await this.legacyAccessLogModel.getUserAccessHistory(userId, {
          limit: Math.min(filters.limit || 50, 100),
          offset: Math.max(filters.offset || 0, 0),
        });
        return {
          logs: ownOnly.logs as unknown as AccessHistoryRecord[],
          total: ownOnly.total,
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        };
      }
      return {
        logs: scopedLegacyLogs,
        total: scopedLegacyLogs.length,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      };
    }

    const countFilters = this.buildActivityFilters(
      { ...filters, limit: undefined, offset: undefined },
      scope,
      dashboardActivityTypes,
    );
    const total = await this.activityLogModel.count(countFilters);

    return {
      logs: mapped,
      total,
      limit: activityFilters.limit || 50,
      offset: activityFilters.offset || 0,
    };
  }

  /** Paginated export up to MAX_ACCESS_HISTORY_EXPORT rows. */
  public async exportQuery(
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
    filters: QueryFilters,
  ): Promise<AccessHistoryRecord[]> {
    const exportLimit = Math.min(filters.limit || MAX_ACCESS_HISTORY_EXPORT, MAX_ACCESS_HISTORY_EXPORT);
    const pageSize = 100;
    const all: AccessHistoryRecord[] = [];
    let offset = 0;

    while (all.length < exportLimit) {
      const batch = await this.query(userId, role, facilityIds, {
        ...filters,
        limit: Math.min(pageSize, exportLimit - all.length),
        offset,
      });
      all.push(...batch.logs);
      if (batch.logs.length < pageSize) break;
      offset += pageSize;
    }

    return all.slice(0, exportLimit);
  }

  public async findById(
    id: string,
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
  ): Promise<AccessHistoryRecord | null> {
    const log = await this.activityLogModel.findById(id);
    if (log && AccessHistoryReadService.DASHBOARD_ACTIVITY_TYPES.includes(log.activity_type)) {
      const scope = await this.scopeService.buildScope(userId, role, facilityIds);
      const postScoped = this.applyPostQueryScope([log], scope);
      if (postScoped.length === 0) {
        return null;
      }
      const withContext = await this.activityLogModel.findWithContext({
        id: log.id,
        limit: 1,
      });
      const enriched = withContext[0] ?? postScoped[0];
      return this.mapToAccessHistoryRecord(enriched);
    }

    const legacy = await this.legacyAccessLogModel.findById(id);
    return (legacy as unknown as AccessHistoryRecord) || null;
  }

  private buildActivityFilters(
    filters: QueryFilters,
    scope: AccessEventScope,
    activityTypes: ActivityType[],
  ): ActivityLogFilters {
    const activityFilters: ActivityLogFilters = {
      activity_types: activityTypes,
      facility_id: filters.facility_id,
      unit_id: filters.unit_id,
      device_id: filters.device_id,
      actor_id: filters.user_id ?? scope.ownUserId,
      from_date: filters.date_from ? new Date(filters.date_from) : undefined,
      to_date: filters.date_to ? new Date(filters.date_to) : undefined,
      limit: Math.min(filters.limit || 50, 100),
      max_limit: undefined,
      offset: Math.max(filters.offset || 0, 0),
      sortBy: filters.sort_by === 'created_at' ? 'created_at' : 'occurred_at',
      sortOrder: filters.sort_order === 'asc' ? 'asc' : 'desc',
      facility_ids: scope.allowedFacilityIds && scope.allowedFacilityIds.length > 0 ? scope.allowedFacilityIds : undefined,
    };

    if (scope.allowedUnitIds?.length) {
      activityFilters.unit_ids = scope.allowedUnitIds;
    }

    return activityFilters;
  }

  private applyPostQueryScope(rows: ActivityLog[], scope: { allowedUnitIds?: string[]; ownUserId?: string }): ActivityLog[] {
    return rows.filter((row) => {
      const metadata = this.extractMetadata(row);
      const actorUserId = typeof row.actor_id === 'string' ? row.actor_id : undefined;
      const unitId = typeof row.unit_id === 'string' ? row.unit_id : undefined;

      if (scope.allowedUnitIds) {
        const hasUnitAccess = !!unitId && scope.allowedUnitIds.includes(unitId);
        const isOwnActor = !!scope.ownUserId && actorUserId === scope.ownUserId;
        return hasUnitAccess || isOwnActor;
      }

      if (scope.ownUserId) {
        const metadataActorId = metadata.actor && typeof metadata.actor === 'object' && metadata.actor !== null
          ? (metadata.actor as Record<string, unknown>).user_id
          : undefined;
        const metadataActorUserId = typeof metadataActorId === 'string' ? metadataActorId : undefined;
        return actorUserId === scope.ownUserId || metadataActorUserId === scope.ownUserId;
      }

      return true;
    });
  }

  private matchesAccessFilters(row: ActivityLog, filters: QueryFilters): boolean {
    const metadata = this.extractMetadata(row);
    const action = this.extractAction(row, metadata);
    const method = this.extractMethod(row, metadata);
    const denialReason = this.extractDenialReason(metadata);

    if (filters.action && action !== filters.action) return false;
    if (filters.method && method !== filters.method) return false;
    if (filters.denial_reason && denialReason !== filters.denial_reason) return false;
    if (filters.success !== undefined && row.result === 'success' !== filters.success) return false;
    return true;
  }

  private mapToAccessHistoryRecord(row: ActivityLog | ActivityLogWithContext): AccessHistoryRecord {
    const metadata = this.extractMetadata(row);
    const action = this.extractAction(row, metadata);
    const method = this.extractMethod(row, metadata);
    const denialReason = this.extractDenialReason(metadata);
    const reasonMessage = typeof row.result_message === 'string' ? row.result_message : undefined;

    const actor = metadata.actor && typeof metadata.actor === 'object' && metadata.actor !== null
      ? (metadata.actor as Record<string, unknown>)
      : undefined;

    const userName = row.actor_name
      || (actor && typeof actor.name === 'string' ? actor.name : undefined);
    const userIdFromActor = actor && typeof actor.user_id === 'string' ? actor.user_id : undefined;
    const deviceType = this.inferDeviceType(metadata);
    const createdAt = this.toIsoString(row.created_at);
    const updatedAt = this.toIsoString(row.updated_at);
    const occurredAt = this.toIsoString(row.occurred_at);

    const ctx = row as ActivityLogWithContext;
    const deviceName = this.resolveDeviceName(ctx, deviceType);
    const presentationMetadata = this.buildPresentationMetadata(
      row,
      ctx,
      metadata,
      deviceType,
      deviceName,
      userName,
      userIdFromActor || row.actor_id || undefined,
    );

    return {
      id: row.id,
      device_id: row.device_id || row.entity_id,
      device_type: deviceType,
      facility_id: row.facility_id || undefined,
      unit_id: row.unit_id || undefined,
      user_id: userIdFromActor || row.actor_id || undefined,
      action,
      method,
      success: row.result === 'success',
      denial_reason: denialReason,
      reason: reasonMessage,
      metadata: presentationMetadata,
      occurred_at: occurredAt,
      created_at: createdAt,
      updated_at: updatedAt,
      facility_name: ctx.facility_name,
      unit_number: ctx.unit_number,
      user_name: userName,
      user_email: undefined,
      actor_type: row.actor_type,
      device_name: deviceName,
      device_location: ctx.device_location || undefined,
      device_serial: ctx.device_serial || undefined,
    };
  }

  private resolveDeviceName(ctx: ActivityLogWithContext, deviceType: 'blulok' | 'access_control'): string | undefined {
    if (ctx.access_control_device_name) return ctx.access_control_device_name;
    if (ctx.blulok_device_name) return ctx.blulok_device_name;
    if (ctx.device_serial) return `Lock ${ctx.device_serial}`;
    return deviceType === 'access_control' ? 'Access control device' : undefined;
  }

  private buildPresentationMetadata(
    row: ActivityLog,
    ctx: ActivityLogWithContext,
    baseMetadata: Record<string, unknown>,
    deviceType: 'blulok' | 'access_control',
    deviceName: string | undefined,
    userName: string | undefined,
    userId: string | undefined,
  ): Record<string, unknown> {
    const presentation: Record<string, unknown> = { ...baseMetadata };

    if (row.actor_type === 'user' && userId && userName) {
      presentation.user = {
        id: userId,
        name: userName,
        navigation_url: `/users?highlight=${userId}`,
      };
    } else if (row.actor_type) {
      presentation.actor = {
        type: row.actor_type,
        name: userName || row.actor_name || row.actor_type,
      };
    }

    if (row.facility_id && ctx.facility_name) {
      presentation.facility = {
        id: row.facility_id,
        name: ctx.facility_name,
        navigation_url: `/facilities/${row.facility_id}`,
      };
    }

    if (row.unit_id && ctx.unit_number) {
      presentation.unit = {
        id: row.unit_id,
        number: ctx.unit_number,
        navigation_url: `/units/${row.unit_id}`,
      };
    }

    if (row.device_id && deviceName) {
      presentation.device = {
        id: row.device_id,
        name: deviceName,
        type: deviceType,
        location: ctx.device_location || undefined,
        serial: ctx.device_serial || undefined,
        navigation_url: deviceType === 'blulok'
          ? `/devices/blulok/${row.device_id}`
          : `/devices/access-control/${row.device_id}`,
      };
    }

    const description = typeof row.description === 'string' && row.description.trim().length > 0
      ? row.description
      : row.title;
    if (typeof description === 'string' && description.trim().length > 0) {
      presentation.description = description;
    }

    return presentation;
  }

  private extractMetadata(row: ActivityLog): Record<string, unknown> {
    return row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  }

  private extractAction(row: ActivityLog, metadata: Record<string, unknown>): string {
    if (row.activity_type === 'lock' || row.activity_type === 'locking') return 'lock';
    if (row.activity_type === 'unlock' || row.activity_type === 'unlocking') return 'unlock';
    const action = metadata.action;
    return typeof action === 'string' ? action : 'access_granted';
  }

  private extractMethod(row: ActivityLog, metadata: Record<string, unknown>): string {
    if (
      row.activity_type === 'lock' ||
      row.activity_type === 'unlock' ||
      row.activity_type === 'locking' ||
      row.activity_type === 'unlocking'
    ) {
      if (row.actor_type === 'gateway') return 'automatic';
      if (row.actor_type === 'user') return 'app';
      return 'automatic';
    }
    const method = metadata.method;
    return typeof method === 'string' ? method : 'app';
  }

  private extractDenialReason(metadata: Record<string, unknown>): string | undefined {
    const reason = metadata.denial_reason;
    return typeof reason === 'string' ? reason : undefined;
  }

  private inferDeviceType(metadata: Record<string, unknown>): 'blulok' | 'access_control' {
    const type = metadata.device_type;
    return type === 'access_control' ? 'access_control' : 'blulok';
  }

  private toIsoString(value: Date | string | null | undefined): string {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }
    return new Date(0).toISOString();
  }
}
