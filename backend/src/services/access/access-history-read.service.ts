import { ActivityLog, ActivityLogFilters, ActivityLogModel } from '@/models/activity-log.model';
import { UserRole } from '@/types/auth.types';
import { AccessEventScopeService } from '@/services/access/access-event-scope.service';
import { AuthService } from '@/services/auth.service';
import { AccessLogFilters, AccessLogModel } from '@/models/access-log.model';

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
  device_name?: string;
};

export class AccessHistoryReadService {
  private readonly activityLogModel = new ActivityLogModel();
  private readonly scopeService = new AccessEventScopeService();
  private readonly legacyAccessLogModel = new AccessLogModel();

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

    const activityFilters: ActivityLogFilters = {
      activity_type: 'access_attempt',
      facility_id: filters.facility_id,
      unit_id: filters.unit_id,
      device_id: filters.device_id,
      actor_id: filters.user_id,
      from_date: filters.date_from ? new Date(filters.date_from) : undefined,
      to_date: filters.date_to ? new Date(filters.date_to) : undefined,
      limit: Math.min(filters.limit || 50, 100),
      offset: Math.max(filters.offset || 0, 0),
      sortBy: filters.sort_by === 'created_at' ? 'created_at' : 'occurred_at',
      sortOrder: filters.sort_order === 'asc' ? 'asc' : 'desc',
      facility_ids: scope.allowedFacilityIds && scope.allowedFacilityIds.length > 0 ? scope.allowedFacilityIds : undefined,
    };

    const rows = await this.activityLogModel.find(activityFilters);

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

    return {
      logs: mapped,
      total: mapped.length,
      limit: activityFilters.limit || 50,
      offset: activityFilters.offset || 0,
    };
  }

  public async findById(
    id: string,
    userId: string,
    role: UserRole,
    facilityIds: string[] | undefined,
  ): Promise<AccessHistoryRecord | null> {
    const log = await this.activityLogModel.findById(id);
    if (!log || log.activity_type !== 'access_attempt') {
      const legacy = await this.legacyAccessLogModel.findById(id);
      return (legacy as unknown as AccessHistoryRecord) || null;
    }
    const scope = await this.scopeService.buildScope(userId, role, facilityIds);
    const postScoped = this.applyPostQueryScope([log], scope);
    if (postScoped.length === 0) {
      return null;
    }
    return this.mapToAccessHistoryRecord(postScoped[0]);
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
    const action = this.extractAction(metadata);
    const method = this.extractMethod(metadata);
    const denialReason = this.extractDenialReason(metadata);

    if (filters.action && action !== filters.action) return false;
    if (filters.method && method !== filters.method) return false;
    if (filters.denial_reason && denialReason !== filters.denial_reason) return false;
    if (filters.success !== undefined && row.result === 'success' !== filters.success) return false;
    return true;
  }

  private mapToAccessHistoryRecord(row: ActivityLog): AccessHistoryRecord {
    const metadata = this.extractMetadata(row);
    const action = this.extractAction(metadata);
    const method = this.extractMethod(metadata);
    const denialReason = this.extractDenialReason(metadata);
    const reasonMessage = typeof row.result_message === 'string' ? row.result_message : undefined;

    const actor = metadata.actor && typeof metadata.actor === 'object' && metadata.actor !== null
      ? (metadata.actor as Record<string, unknown>)
      : undefined;

    const userName = actor && typeof actor.name === 'string' ? actor.name : row.actor_name || undefined;
    const userIdFromActor = actor && typeof actor.user_id === 'string' ? actor.user_id : undefined;
    const deviceType = this.inferDeviceType(metadata);
    const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString();
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString();

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
      metadata,
      occurred_at: row.occurred_at.toISOString(),
      created_at: createdAt,
      updated_at: updatedAt,
      facility_name: undefined,
      unit_number: undefined,
      user_name: userName,
      user_email: undefined,
      device_name: undefined,
    };
  }

  private extractMetadata(row: ActivityLog): Record<string, unknown> {
    return row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  }

  private extractAction(metadata: Record<string, unknown>): string {
    const action = metadata.action;
    return typeof action === 'string' ? action : 'access_granted';
  }

  private extractMethod(metadata: Record<string, unknown>): string {
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
}
