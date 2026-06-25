/**
 * Activity Service
 *
 * Business logic layer for the activity logging system. Provides high-level
 * operations for logging and querying activity with proper RBAC enforcement
 * and event emission.
 *
 * Key Features:
 * - Log device and unit state changes
 * - Track lock/unlock events
 * - Record access attempts
 * - Query activity history with filters
 * - Facility-scoped access control
 * - Event-driven updates via ActivityEventsService
 */

import { ActivityLogModel, ActivityLog, CreateActivityLogData, ActivityLogFilters, ActivityType, ActivityEntityType, ActorType, ActivityResult, ActivityLogWithContext } from '@/models/activity-log.model';
import { ActivityEventsService } from '@/services/events/activity-events.service';
import { UserRole } from '@/types/auth.types';
import { AuthService } from '@/services/auth.service';
import { UnitModel } from '@/models/unit.model';
import { DeviceModel } from '@/models/device.model';
import { UnitAssignmentModel } from '@/models/unit-assignment.model';
import { AccessDeniedError, NotFoundError } from '@/middleware/error.middleware';
import { logger } from '@/utils/logger';

/**
 * Activity log response format for API
 */
export interface ActivityLogResponse {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  activityType: ActivityType;
  title: string;
  description: string | null;
  actor: {
    type: ActorType;
    id: string | null;
    name: string | null;
  };
  result: ActivityResult;
  resultMessage: string | null;
  facilityId: string | null;
  unitId: string | null;
  deviceId: string | null;
  metadata: Record<string, any> | null;
  occurredAt: Date;
  // Enriched context
  unitNumber?: string;
  deviceSerial?: string;
  facilityName?: string;
}

/**
 * Options for logging activity
 */
export interface LogActivityOptions {
  entityType: ActivityEntityType;
  entityId: string;
  activityType: ActivityType;
  title: string;
  description?: string;
  actorType: ActorType;
  actorId?: string;
  actorName?: string;
  result?: ActivityResult;
  resultMessage?: string;
  facilityId?: string;
  unitId?: string;
  deviceId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  occurredAt?: Date;
}

/**
 * Options for querying activity logs
 */
export interface QueryActivityOptions {
  entityType?: ActivityEntityType;
  entityId?: string;
  activityType?: ActivityType;
  actorType?: ActorType;
  actorId?: string;
  result?: ActivityResult;
  facilityId?: string;
  unitId?: string;
  deviceId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export class ActivityService {
  private static instance: ActivityService;
  private activityLogModel: ActivityLogModel;
  private eventService: ActivityEventsService;
  private unitModel: UnitModel;
  private deviceModel: DeviceModel;
  private unitAssignmentModel: UnitAssignmentModel;

  private constructor() {
    this.activityLogModel = new ActivityLogModel();
    this.eventService = ActivityEventsService.getInstance();
    this.unitModel = new UnitModel();
    this.deviceModel = new DeviceModel();
    this.unitAssignmentModel = new UnitAssignmentModel();
  }

  public static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  /**
   * Log a new activity
   */
  async logActivity(options: LogActivityOptions): Promise<ActivityLogResponse> {
    const data: CreateActivityLogData = {
      entity_type: options.entityType,
      entity_id: options.entityId,
      activity_type: options.activityType,
      title: options.title,
      description: options.description,
      actor_type: options.actorType,
      actor_id: options.actorId,
      actor_name: options.actorName,
      result: options.result || 'success',
      result_message: options.resultMessage,
      facility_id: options.facilityId,
      unit_id: options.unitId,
      device_id: options.deviceId,
      metadata: options.metadata,
      ip_address: options.ipAddress,
      occurred_at: options.occurredAt || new Date(),
    };

    const activityLog = await this.activityLogModel.create(data);

    // Emit event for real-time updates
    this.eventService.emitActivityLogged({
      activityId: activityLog.id,
      entityType: activityLog.entity_type,
      entityId: activityLog.entity_id,
      activityType: activityLog.activity_type,
      title: activityLog.title,
      description: activityLog.description || undefined,
      actorType: activityLog.actor_type,
      actorId: activityLog.actor_id || undefined,
      actorName: activityLog.actor_name || undefined,
      result: activityLog.result,
      facilityId: activityLog.facility_id || undefined,
      unitId: activityLog.unit_id || undefined,
      deviceId: activityLog.device_id || undefined,
      occurredAt: activityLog.occurred_at,
    });

    return this.formatActivityLog(activityLog);
  }

  /**
   * Get activity logs with access control
   */
  async getActivityLogs(
    requestingUserId: string,
    requestingUserRole: UserRole,
    requestingUserFacilityIds: string[] | undefined,
    options: QueryActivityOptions = {}
  ): Promise<{ activities: ActivityLogResponse[]; total: number }> {
    // Build filters with facility access control
    const filters: ActivityLogFilters = {
      entity_type: options.entityType,
      entity_id: options.entityId,
      activity_type: options.activityType,
      actor_type: options.actorType,
      actor_id: options.actorId,
      result: options.result,
      unit_id: options.unitId,
      device_id: options.deviceId,
      from_date: options.fromDate,
      to_date: options.toDate,
      limit: options.limit || 50,
      offset: options.offset || 0,
      sortBy: 'occurred_at',
      sortOrder: 'desc',
    };

    // Apply facility filter
    if (options.facilityId) {
      if (!this.canAccessFacility(requestingUserRole, options.facilityId, requestingUserFacilityIds)) {
        throw new AccessDeniedError('Access denied to this facility');
      }
      filters.facility_id = options.facilityId;
    } else if (!AuthService.canAccessAllFacilities(requestingUserRole)) {
      // Non-admin users must filter by their facilities
      if (!requestingUserFacilityIds || requestingUserFacilityIds.length === 0) {
        return { activities: [], total: 0 };
      }
      // Support filtering by multiple facilities using whereIn
      filters.facility_ids = requestingUserFacilityIds;
    }

    const [activities, total] = await Promise.all([
      this.activityLogModel.findWithContext(filters),
      this.activityLogModel.count(filters),
    ]);

    return {
      activities: activities.map(a => this.formatActivityLogWithContext(a)),
      total,
    };
  }

  /**
   * Get activity for a specific unit
   */
  async getUnitActivity(
    requestingUserId: string,
    requestingUserRole: UserRole,
    requestingUserFacilityIds: string[] | undefined,
    unitId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ activities: ActivityLogResponse[]; total: number }> {
    // Look up the unit first to get facility_id BEFORE querying activities
    const unit = await this.unitModel.findById(unitId);
    if (!unit) {
      throw new NotFoundError('Unit');
    }

    // Check facility access BEFORE querying activity logs
    if (!this.canAccessFacility(requestingUserRole, unit.facility_id, requestingUserFacilityIds)) {
      throw new AccessDeniedError('Access denied to this unit');
    }

    // For tenants, verify they have an assignment to this unit
    if (requestingUserRole === UserRole.TENANT) {
      const assignment = await this.unitAssignmentModel.findByUnitAndTenant(unitId, requestingUserId);
      if (!assignment) {
        throw new AccessDeniedError('You do not have access to this unit');
      }
    }

    const filters: ActivityLogFilters = {
      unit_id: unitId,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };

    const [activities, total] = await Promise.all([
      this.activityLogModel.findWithContext(filters),
      this.activityLogModel.count(filters),
    ]);

    return {
      activities: activities.map(a => this.formatActivityLogWithContext(a)),
      total,
    };
  }

  /**
   * Get activity for a specific device
   */
  async getDeviceActivity(
    requestingUserId: string,
    requestingUserRole: UserRole,
    requestingUserFacilityIds: string[] | undefined,
    deviceId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ activities: ActivityLogResponse[]; total: number }> {
    // Look up the device first to get facility_id BEFORE querying activities
    // Try both device types in parallel to avoid N+1
    const [blulokDevice, accessControlDevice] = await Promise.all([
      this.deviceModel.findBluLokDeviceById(deviceId),
      this.deviceModel.findAccessControlDeviceWithGateway(deviceId),
    ]);

    let facilityId: string | null = null;
    if (blulokDevice) {
      facilityId = blulokDevice.facility_id || null;
    } else if (accessControlDevice) {
      facilityId = accessControlDevice.facility_id;
    }

    if (!facilityId) {
      throw new NotFoundError('Device');
    }

    // Check facility access BEFORE querying activity logs
    if (!this.canAccessFacility(requestingUserRole, facilityId, requestingUserFacilityIds)) {
      throw new AccessDeniedError('Access denied to this device');
    }

    const filters: ActivityLogFilters = {
      device_id: deviceId,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };

    const [activities, total] = await Promise.all([
      this.activityLogModel.findWithContext(filters),
      this.activityLogModel.count(filters),
    ]);

    return {
      activities: activities.map(a => this.formatActivityLogWithContext(a)),
      total,
    };
  }

  /**
   * Get activity for a specific facility
   */
  async getFacilityActivity(
    requestingUserId: string,
    requestingUserRole: UserRole,
    requestingUserFacilityIds: string[] | undefined,
    facilityId: string,
    options: { limit?: number; offset?: number; fromDate?: Date; toDate?: Date } = {}
  ): Promise<{ activities: ActivityLogResponse[]; total: number }> {
    // Check facility access
    if (!this.canAccessFacility(requestingUserRole, facilityId, requestingUserFacilityIds)) {
      throw new AccessDeniedError('Access denied to this facility');
    }

    const filters: ActivityLogFilters = {
      facility_id: facilityId,
      from_date: options.fromDate,
      to_date: options.toDate,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };

    const [activities, total] = await Promise.all([
      this.activityLogModel.findWithContext(filters),
      this.activityLogModel.count(filters),
    ]);

    return {
      activities: activities.map(a => this.formatActivityLogWithContext(a)),
      total,
    };
  }

  // ============================================
  // Convenience methods for logging specific activity types
  // ============================================

  /**
   * Log a lock event
   */
  async logLockEvent(
    deviceId: string,
    unitId: string | undefined,
    facilityId: string,
    locked: boolean,
    actorType: ActorType,
    actorId?: string,
    actorName?: string,
    result: ActivityResult = 'success',
    metadata?: Record<string, any>
  ): Promise<ActivityLogResponse> {
    return this.logActivity({
      entityType: 'device',
      entityId: deviceId,
      activityType: locked ? 'lock' : 'unlock',
      title: locked ? 'Device Locked' : 'Device Unlocked',
      description: `Device was ${locked ? 'locked' : 'unlocked'} by ${actorName || actorType}`,
      actorType,
      actorId,
      actorName,
      result,
      facilityId,
      unitId,
      deviceId,
      metadata,
    });
  }

  /**
   * Log an access attempt
   */
  async logAccessAttempt(
    deviceId: string,
    unitId: string | undefined,
    facilityId: string,
    userId: string,
    userName: string,
    granted: boolean,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<ActivityLogResponse> {
    return this.logActivity({
      entityType: 'device',
      entityId: deviceId,
      activityType: 'access_attempt',
      title: granted ? 'Access Granted' : 'Access Denied',
      description: reason || (granted ? 'User was granted access' : 'User was denied access'),
      actorType: 'user',
      actorId: userId,
      actorName: userName,
      result: granted ? 'success' : 'failure',
      resultMessage: reason,
      facilityId,
      unitId,
      deviceId,
      metadata,
    });
  }

  /**
   * Log a device status change
   */
  async logStatusChange(
    deviceId: string,
    facilityId: string,
    oldStatus: string,
    newStatus: string,
    metadata?: Record<string, any>
  ): Promise<ActivityLogResponse> {
    return this.logActivity({
      entityType: 'device',
      entityId: deviceId,
      activityType: 'status_change',
      title: 'Status Changed',
      description: `Device status changed from ${oldStatus} to ${newStatus}`,
      actorType: 'system',
      result: 'success',
      facilityId,
      deviceId,
      metadata: { oldStatus, newStatus, ...metadata },
    });
  }

  /**
   * Log a unit assignment change
   */
  async logAssignmentChange(
    unitId: string,
    facilityId: string,
    userId: string,
    userName: string,
    assigned: boolean,
    performedBy?: string,
    performedByName?: string
  ): Promise<ActivityLogResponse> {
    return this.logActivity({
      entityType: 'unit',
      entityId: unitId,
      activityType: 'assignment_change',
      title: assigned ? 'User Assigned' : 'User Unassigned',
      description: `${userName} was ${assigned ? 'assigned to' : 'unassigned from'} the unit`,
      actorType: performedBy ? 'user' : 'system',
      actorId: performedBy,
      actorName: performedByName,
      result: 'success',
      facilityId,
      unitId,
      metadata: { assignedUserId: userId, assignedUserName: userName, assigned },
    });
  }

  /**
   * Log permanent removal of a unit from a facility.
   */
  async logUnitDeleted(
    unitId: string,
    facilityId: string,
    unitNumber: string,
    performedBy: string,
    performedByName: string,
    stats: { tenantsUnassigned: number; hadDevice: boolean },
  ): Promise<ActivityLogResponse> {
    const parts: string[] = [];
    if (stats.tenantsUnassigned > 0) {
      parts.push(`${stats.tenantsUnassigned} tenant assignment(s) removed`);
    }
    if (stats.hadDevice) {
      parts.push('linked lock detached');
    }
    const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';

    return this.logActivity({
      entityType: 'unit',
      entityId: unitId,
      activityType: 'configuration_change',
      title: 'Unit Deleted',
      description: `Unit ${unitNumber} was permanently deleted${detail}`,
      actorType: 'user',
      actorId: performedBy,
      actorName: performedByName,
      result: 'success',
      facilityId,
      unitId,
      metadata: {
        unitNumber,
        tenantsUnassigned: stats.tenantsUnassigned,
        hadDevice: stats.hadDevice,
      },
    });
  }

  // ============================================
  // Helper methods
  // ============================================

  /**
   * Check if user can access a facility
   */
  private canAccessFacility(
    userRole: UserRole,
    facilityId: string,
    userFacilityIds: string[] | undefined
  ): boolean {
    if (AuthService.canAccessAllFacilities(userRole)) {
      return true;
    }
    return userFacilityIds?.includes(facilityId) || false;
  }

  /**
   * Format activity log for API response
   */
  private formatActivityLog(log: ActivityLog): ActivityLogResponse {
    return {
      id: log.id,
      entityType: log.entity_type,
      entityId: log.entity_id,
      activityType: log.activity_type,
      title: log.title,
      description: log.description,
      actor: {
        type: log.actor_type,
        id: log.actor_id,
        name: log.actor_name,
      },
      result: log.result,
      resultMessage: log.result_message,
      facilityId: log.facility_id,
      unitId: log.unit_id,
      deviceId: log.device_id,
      metadata: log.metadata,
      occurredAt: log.occurred_at,
    };
  }

  /**
   * Format activity log with context for API response
   */
  private formatActivityLogWithContext(log: ActivityLogWithContext): ActivityLogResponse {
    return {
      ...this.formatActivityLog(log),
      unitNumber: log.unit_number,
      deviceSerial: log.device_serial,
      facilityName: log.facility_name,
    };
  }
}
