import { ActivityLog, ActivityLogFilters, ActivityLogModel, ActivityLogWithContext, ActivityType } from '@/models/activity-log.model';
import { UserRole } from '@/types/auth.types';
import { AccessEventScopeService, AccessEventScope } from '@/services/access/access-event-scope.service';
import { AuthService } from '@/services/auth.service';
import { AccessLogFilters, AccessLogModel } from '@/models/access-log.model';
import {
  ACCESS_HISTORY_ACTIVITY_TYPES,
  buildAccessFailureSummary,
  isGatewaySyncActivityDescription,
  MAX_ACCESS_HISTORY_EXPORT,
} from '@/constants/access-history.constants';
import { parseQueryDateFrom, parseQueryDateTo, toIsoStringOrEpoch } from '@/utils/datetime.utils';
import { mapLegacyAccessAction, mapLegacyAccessMethod } from '@/utils/access-history-remote.utils';
import { resolveBluLokDeviceDisplayName, isLikelyUuid } from '@/utils/blulok-device-display.utils';
import { isUsableAccessDisplayName } from '@/utils/access-event-placeholder.utils';

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
  status: 'success' | 'failed' | 'pending';
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

  static readonly ACCESS_HISTORY_ACTIVITY_TYPES = ACCESS_HISTORY_ACTIVITY_TYPES;

  /** Load a single access history row with presentation fields (for live WS updates). */
  public async findAccessRecordById(id: string): Promise<AccessHistoryRecord | null> {
    const rows = await this.activityLogModel.findWithContext({ id, limit: 1 });
    if (rows.length === 0) return null;
    return this.mapToAccessHistoryRecord(rows[0]);
  }

  /** Public mapper for session detail event trails and tests. */
  public mapToAccessHistoryRecordPublic(row: ActivityLog | ActivityLogWithContext): AccessHistoryRecord {
    return this.mapToAccessHistoryRecord(row);
  }

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

    const activityFilters = this.buildActivityFilters(filters, scope, ACCESS_HISTORY_ACTIVITY_TYPES, role);

    const rows = await this.activityLogModel.findWithContext(activityFilters);

    const scopedRows = this.applyPostQueryScope(rows, scope);
    const tenantScopedRows = this.excludeAccessControlForTenant(scopedRows, role);
    const filteredRows = tenantScopedRows.filter((row) => this.matchesAccessFilters(row, filters));
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
        date_from: filters.date_from ? parseQueryDateFrom(filters.date_from) : undefined,
        date_to: filters.date_to ? parseQueryDateTo(filters.date_to) : undefined,
        limit: Math.min(filters.limit || 50, 100),
        offset: Math.max(filters.offset || 0, 0),
        sort_by: 'occurred_at',
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
        if (filters.action && log.action !== this.normalizeActionFilter(filters.action)) return false;
        if (filters.method && !this.methodMatchesFilter(log.method, filters.method)) return false;
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
          if (log.device_type === 'access_control') {
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
        logs: scopedLegacyLogs.map((log) => this.mapLegacyAccessLog(log)),
        total: scopedLegacyLogs.length,
        limit: filters.limit || 50,
        offset: filters.offset || 0,
      };
    }

    const countFilters = this.buildActivityFilters(
      { ...filters, limit: undefined, offset: undefined },
      scope,
      ACCESS_HISTORY_ACTIVITY_TYPES,
      role,
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
    if (log && AccessHistoryReadService.ACCESS_HISTORY_ACTIVITY_TYPES.includes(log.activity_type)) {
      const scope = await this.scopeService.buildScope(userId, role, facilityIds);
      const postScoped = this.applyPostQueryScope([log], scope);
      const tenantScoped = this.excludeAccessControlForTenant(postScoped, role);
      if (tenantScoped.length === 0) {
        return null;
      }
      const withContext = await this.activityLogModel.findWithContext({
        id: log.id,
        limit: 1,
      });
      const enriched = withContext[0] ?? tenantScoped[0];
      return this.mapToAccessHistoryRecord(enriched);
    }

    const legacy = await this.legacyAccessLogModel.findById(id);
    if (!legacy) return null;
    return this.mapLegacyAccessLog(legacy as unknown as AccessHistoryRecord);
  }

  private buildActivityFilters(
    filters: QueryFilters,
    scope: AccessEventScope,
    activityTypes: ActivityType[],
    role: UserRole,
  ): ActivityLogFilters {
    const activityFilters: ActivityLogFilters = {
      activity_types: activityTypes,
      facility_id: filters.facility_id,
      unit_id: filters.unit_id,
      device_id: filters.device_id,
      from_date: filters.date_from ? parseQueryDateFrom(filters.date_from) : undefined,
      to_date: filters.date_to ? parseQueryDateTo(filters.date_to) : undefined,
      limit: Math.min(filters.limit || 50, 100),
      max_limit: undefined,
      offset: Math.max(filters.offset || 0, 0),
      sortBy: filters.sort_by === 'created_at' ? 'created_at' : 'occurred_at',
      sortOrder: filters.sort_order === 'asc' ? 'asc' : 'desc',
      facility_ids: scope.allowedFacilityIds && scope.allowedFacilityIds.length > 0 ? scope.allowedFacilityIds : undefined,
    };

    if (role === UserRole.TENANT) {
      if (filters.user_id) {
        activityFilters.actor_id = filters.user_id;
      } else if (filters.unit_id) {
        // Unit-scoped route already verified access; do not default actor_id.
      } else if (scope.allowedUnitIds?.length && scope.ownUserId) {
        activityFilters.unit_or_actor_scope = {
          unit_ids: scope.allowedUnitIds,
          actor_id: scope.ownUserId,
        };
      } else if (scope.ownUserId) {
        activityFilters.actor_id = scope.ownUserId;
      }
    } else if (role === UserRole.MAINTENANCE) {
      activityFilters.actor_id = filters.user_id ?? scope.ownUserId;
    } else if (filters.user_id) {
      activityFilters.actor_id = filters.user_id;
    }

    return activityFilters;
  }

  private excludeAccessControlForTenant(rows: ActivityLog[], role: UserRole): ActivityLog[] {
    if (role !== UserRole.TENANT) {
      return rows;
    }
    return rows.filter((row) => {
      const ctx = row as ActivityLogWithContext;
      return this.inferDeviceType(this.extractMetadata(row), ctx) !== 'access_control';
    });
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

    if (filters.action && action !== this.normalizeActionFilter(filters.action)) return false;
    if (filters.method) {
      const methodMatches = this.methodMatchesFilter(method, filters.method);
      if (!methodMatches) return false;
    }
    if (filters.denial_reason && denialReason !== filters.denial_reason) return false;
    if (filters.success !== undefined) {
      const { success } = this.deriveResultStatus(row.result);
      if (success !== filters.success) return false;
    }
    return true;
  }

  private deriveResultStatus(result: string | null | undefined): {
    success: boolean;
    status: 'success' | 'failed' | 'pending';
  } {
    if (result === 'success') {
      return { success: true, status: 'success' };
    }
    if (result === 'failure') {
      return { success: false, status: 'failed' };
    }
    if (result === 'pending') {
      return { success: false, status: 'pending' };
    }
    return { success: false, status: 'failed' };
  }

  private resolveActorDisplayName(
    ctx: ActivityLogWithContext,
    actor: Record<string, unknown> | undefined,
    storedActorName: string | undefined,
  ): string | undefined {
    const joinedName = [ctx.actor_user_first_name, ctx.actor_user_last_name]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' ')
      .trim();
    if (joinedName && !isLikelyUuid(joinedName) && isUsableAccessDisplayName(joinedName)) {
      return joinedName;
    }

    const actorMetaName = typeof actor?.name === 'string' ? actor.name.trim() : '';
    if (actorMetaName && !isLikelyUuid(actorMetaName) && isUsableAccessDisplayName(actorMetaName)) {
      return actorMetaName;
    }

    const actorName = typeof storedActorName === 'string' ? storedActorName.trim() : '';
    if (actorName && !isLikelyUuid(actorName) && isUsableAccessDisplayName(actorName)) {
      return actorName;
    }

    const email = typeof ctx.actor_user_email === 'string' ? ctx.actor_user_email.trim() : '';
    if (email) {
      return email;
    }

    return undefined;
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

    const ctx = row as ActivityLogWithContext;
    const userName = this.resolveActorDisplayName(ctx, actor, row.actor_name
      || (actor && typeof actor.name === 'string' ? actor.name : undefined));
    const userIdFromActor = actor && typeof actor.user_id === 'string' ? actor.user_id : undefined;
    const deviceType = this.inferDeviceType(metadata, ctx);
    const createdAt = toIsoStringOrEpoch(row.created_at);
    const updatedAt = toIsoStringOrEpoch(row.updated_at);
    const occurredAt = toIsoStringOrEpoch(row.occurred_at);

    const deviceName = this.resolveDeviceName(ctx, deviceType);
    const resolvedDeviceId = this.resolveCloudDeviceId(row, ctx, deviceType);
    const resolvedUserId = userIdFromActor || row.actor_id || undefined;
    const resultStatus = this.deriveResultStatus(row.result);
    const failureSummary = buildAccessFailureSummary(denialReason, reasonMessage);

    const presentationMetadata = this.buildPresentationMetadata(
      row,
      ctx,
      metadata,
      deviceType,
      deviceName,
      userName,
      resolvedUserId,
      failureSummary,
      resolvedDeviceId,
    );

    return {
      id: row.id,
      device_id: resolvedDeviceId,
      device_type: deviceType,
      facility_id: row.facility_id || undefined,
      unit_id: row.unit_id || undefined,
      user_id: resolvedUserId,
      action,
      method,
      success: resultStatus.success,
      status: resultStatus.status,
      denial_reason: denialReason,
      reason: reasonMessage,
      metadata: presentationMetadata,
      occurred_at: occurredAt,
      created_at: createdAt,
      updated_at: updatedAt,
      facility_name: ctx.facility_name,
      unit_number: ctx.unit_number,
      user_name: userName,
      user_email: ctx.actor_user_email || undefined,
      actor_type: row.actor_type,
      device_name: deviceName,
      device_location: ctx.device_location || undefined,
      device_serial: ctx.device_serial || ctx.access_control_device_serial || undefined,
    };
  }

  private resolveDeviceName(ctx: ActivityLogWithContext, deviceType: 'blulok' | 'access_control'): string | undefined {
    if (deviceType === 'access_control' || this.hasAccessControlJoin(ctx)) {
      const name = ctx.access_control_device_name?.trim();
      if (name) return name;
      const location = ctx.device_location?.trim();
      if (location) return location;
      const acSerial = ctx.access_control_device_serial?.trim() || ctx.device_serial?.trim();
      if (acSerial) return acSerial;
      if (deviceType === 'access_control' || this.hasAccessControlJoin(ctx)) {
        return 'Access point';
      }
    }

    if (this.hasBluLokJoin(ctx)) {
      return resolveBluLokDeviceDisplayName({
        device_settings: ctx.blulok_device_settings,
        device_serial: ctx.device_serial,
        unit_number: ctx.unit_number,
      });
    }

    // No device row joined — avoid "Unassigned - ?????" for missing devices.
    return undefined;
  }

  private hasBluLokJoin(ctx: ActivityLogWithContext): boolean {
    return Boolean(
      (typeof ctx.device_serial === 'string' && ctx.device_serial.trim())
      || (ctx.blulok_device_settings && typeof ctx.blulok_device_settings === 'object'),
    );
  }

  private hasAccessControlJoin(ctx: ActivityLogWithContext): boolean {
    return Boolean(
      (typeof ctx.access_control_device_name === 'string' && ctx.access_control_device_name.trim())
      || (typeof ctx.access_control_device_serial === 'string' && ctx.access_control_device_serial.trim())
      || (typeof ctx.device_location === 'string' && ctx.device_location.trim()),
    );
  }

  private normalizeActionFilter(action: string): string {
    if (action === 'access_denied') return 'unlock_attempt';
    return action;
  }

  private mapLegacyAccessLog(log: AccessHistoryRecord): AccessHistoryRecord {
    return {
      ...log,
      action: mapLegacyAccessAction(log.action, log.success),
      method: mapLegacyAccessMethod(log.method),
    };
  }

  private resolveCloudDeviceId(
    row: ActivityLog,
    ctx: ActivityLogWithContext,
    deviceType: 'blulok' | 'access_control',
  ): string {
    if (deviceType === 'access_control' && ctx.access_control_device_id) {
      return ctx.access_control_device_id;
    }
    if (deviceType === 'blulok' && ctx.blulok_device_id) {
      return ctx.blulok_device_id;
    }
    if (ctx.access_control_device_id) return ctx.access_control_device_id;
    if (ctx.blulok_device_id) return ctx.blulok_device_id;
    return row.device_id || row.entity_id || '';
  }

  private buildPresentationMetadata(
    row: ActivityLog,
    ctx: ActivityLogWithContext,
    baseMetadata: Record<string, unknown>,
    deviceType: 'blulok' | 'access_control',
    deviceName: string | undefined,
    userName: string | undefined,
    userId: string | undefined,
    failureSummary: string | undefined,
    resolvedDeviceId?: string,
  ): Record<string, unknown> {
    const presentation: Record<string, unknown> = {};

    const method = baseMetadata.method;
    if (typeof method === 'string') {
      presentation.method = method === 'automatic' ? 'local_device' : method;
    }
    const eventId = baseMetadata.event_id;
    if (typeof eventId === 'string' && eventId.trim()) {
      presentation.event_id = eventId.trim();
    }
    const denialReason = baseMetadata.denial_reason;
    if (typeof denialReason === 'string') {
      presentation.denial_reason = denialReason;
    }
    if (baseMetadata.initiated_remotely === true) {
      presentation.initiated_remotely = true;
    }
    if (baseMetadata.correlated_remote === true) {
      presentation.correlated_remote = true;
    }
    if (baseMetadata.occupied_unit_override === true) {
      presentation.occupied_unit_override = true;
    }
    const tenantUnlockOverride = baseMetadata.tenant_unlock_override;
    if (tenantUnlockOverride && typeof tenantUnlockOverride === 'object' && tenantUnlockOverride !== null) {
      presentation.tenant_unlock_override = tenantUnlockOverride;
    }
    const gatewayId = baseMetadata.gateway_id;
    if (typeof gatewayId === 'string') {
      presentation.gateway_id = gatewayId;
    }
    const keypad = baseMetadata.keypad;
    if (keypad && typeof keypad === 'object' && keypad !== null) {
      presentation.keypad = keypad;
    }
    const initiatedBy = baseMetadata.initiated_by;
    if (initiatedBy && typeof initiatedBy === 'object' && initiatedBy !== null) {
      const ib = initiatedBy as Record<string, unknown>;
      const initiatedId = typeof ib.id === 'string' ? ib.id : undefined;
      const initiatedName = typeof ib.name === 'string' ? ib.name : undefined;
      if (initiatedId && initiatedName) {
        presentation.initiated_by = {
          id: initiatedId,
          name: initiatedName,
          role: typeof ib.role === 'string' ? ib.role : undefined,
          navigation_url: `/users/${initiatedId}/details`,
        };
      }
    } else if (row.actor_type === 'user' && userId && userName && baseMetadata.initiated_remotely) {
      presentation.initiated_by = {
        id: userId,
        name: userName,
        navigation_url: `/users/${userId}/details`,
      };
    }

    if (failureSummary) {
      presentation.failure_summary = failureSummary;
    }

    if (row.actor_type === 'user' && userId) {
      const metadataEmail = typeof baseMetadata.user_email === 'string' ? baseMetadata.user_email.trim() : '';
      const joinedEmail = typeof ctx.actor_user_email === 'string' ? ctx.actor_user_email.trim() : '';
      const email = metadataEmail || joinedEmail;
      const resolvedUserName = userName || email;
      if (resolvedUserName) {
        presentation.user = {
          id: userId,
          name: resolvedUserName,
          ...(email ? { email } : {}),
          navigation_url: `/users/${userId}/details`,
        };
      }
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

    if (row.unit_id && ctx.unit_number && !/^[0-9a-f-]{36}$/i.test(ctx.unit_number)) {
      presentation.unit = {
        id: row.unit_id,
        number: ctx.unit_number,
        navigation_url: `/units/${row.unit_id}`,
      };
    }

    const deviceId = resolvedDeviceId || row.device_id;
    if (deviceId && deviceName) {
      presentation.device = {
        id: deviceId,
        name: deviceName,
        type: deviceType,
        location: ctx.device_location || undefined,
        serial: ctx.access_control_device_serial || ctx.device_serial || undefined,
        ...(deviceType === 'blulok' && ctx.blulok_device_settings
          ? { device_settings: ctx.blulok_device_settings }
          : {}),
        navigation_url: deviceType === 'blulok'
          ? `/devices/blulok/${deviceId}`
          : `/devices/access-control/${deviceId}`,
      };
    }

    const rawDescription = typeof row.description === 'string' && row.description.trim().length > 0
      ? row.description
      : row.title;
    if (
      typeof rawDescription === 'string'
      && rawDescription.trim().length > 0
      && !isGatewaySyncActivityDescription(rawDescription)
    ) {
      presentation.description = rawDescription;
    }

    return presentation;
  }

  private extractMetadata(row: ActivityLog): Record<string, unknown> {
    return row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  }

  private extractAction(row: ActivityLog, metadata: Record<string, unknown>): string {
    if (row.activity_type === 'lock') return 'lock';
    if (row.activity_type === 'unlock') return 'unlock';

    const action = metadata.action;
    if (typeof action === 'string') {
      if (action === 'access_denied') return 'unlock_attempt';
      if (action === 'keypad_attempt' && row.result === 'failure') return 'unlock_attempt';
      if (action === 'lock_attempt' || action === 'unlock_attempt') return action;
      return action;
    }

    if (row.result === 'failure') {
      return 'unlock_attempt';
    }

    return 'access_granted';
  }

  private extractMethod(row: ActivityLog, metadata: Record<string, unknown>): string {
    if (row.activity_type === 'lock' || row.activity_type === 'unlock') {
      const storedMethod = metadata.method;
      // Prefer explicit stored method (e.g. correlated remote unlock → local_device).
      if (typeof storedMethod === 'string' && storedMethod.trim()) {
        return storedMethod === 'automatic' ? 'local_device' : storedMethod;
      }
      if (metadata.initiated_remotely === true) {
        return 'remote_gateway';
      }
      if (row.actor_type === 'user' && metadata.correlated_remote !== true) {
        return 'remote_gateway';
      }
      return 'local_device';
    }

    const method = metadata.method;
    if (typeof method === 'string') {
      if (method === 'automatic') return 'local_device';
      return method;
    }
    return 'app';
  }

  /** `cloud` matches both admin and tenant/app cloud-issued remote methods. */
  private methodMatchesFilter(method: string, filter: string): boolean {
    if (filter === 'cloud') {
      return method === 'admin_remote' || method === 'remote_gateway';
    }
    const normalizedFilter = filter === 'automatic' ? 'local_device' : filter;
    return method === normalizedFilter;
  }

  private extractDenialReason(metadata: Record<string, unknown>): string | undefined {
    const reason = metadata.denial_reason;
    return typeof reason === 'string' ? reason : undefined;
  }

  private inferDeviceType(
    metadata: Record<string, unknown>,
    ctx?: ActivityLogWithContext,
  ): 'blulok' | 'access_control' {
    // Live joins beat stale ingest metadata (gateway often defaults / mis-tags device_type).
    if (ctx) {
      const hasAc = this.hasAccessControlJoin(ctx);
      const hasBluLok = this.hasBluLokJoin(ctx);
      if (hasAc && !hasBluLok) return 'access_control';
      if (hasBluLok && !hasAc) return 'blulok';
    }

    const type = metadata.device_type;
    return type === 'access_control' ? 'access_control' : 'blulok';
  }

}
