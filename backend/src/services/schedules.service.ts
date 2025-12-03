import { UserRole, AuthenticatedRequest } from '@/types/auth.types';
import { ScheduleModel, Schedule, ScheduleWithTimeWindows, ScheduleTimeWindow } from '@/models/schedule.model';
import { UserFacilityScheduleModel, UserFacilityScheduleWithDetails } from '@/models/user-facility-schedule.model';
import { FacilityAccessService } from '@/services/facility-access.service';
import { AuthService } from '@/services/auth.service';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * User Context Interface
 *
 * Represents the authenticated user making a request, used for RBAC checks.
 */
export interface UserContext {
  userId: string;
  role: UserRole;
  facilityIds?: string[];
}

/**
 * Schedules Service
 *
 * Business logic for schedule management operations. Handles CRUD operations
 * for schedules with proper RBAC enforcement and facility scoping.
 *
 * Key Features:
 * - Facility-scoped schedule management
 * - RBAC enforcement (admin, facility-admin, tenant, maintenance)
 * - Default schedule initialization
 * - User schedule assignment
 * - Precanned schedule protection
 */
export class SchedulesService {
  /**
   * Get schedules for a facility based on user permissions
   *
   * - Admins/dev-admins: See all schedules
   * - Facility admins: See schedules for their facilities
   * - Tenants/maintenance: See only their own schedule
   */
  public static async getSchedulesForFacility(
    facilityId: string,
    userContext: UserContext
  ): Promise<ScheduleWithTimeWindows[]> {
    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // Admins and facility admins can see all schedules
    if (AuthService.isAdmin(userContext.role) || AuthService.isFacilityAdmin(userContext.role)) {
      return ScheduleModel.findByFacilityWithTimeWindows(facilityId);
    }

    // Tenants and maintenance can only see their own schedule
    const userSchedule = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
      userContext.userId,
      facilityId
    );

    if (userSchedule) {
      return [userSchedule.schedule];
    }

    return [];
  }

  /**
   * Get a specific schedule by ID
   */
  public static async getSchedule(
    facilityId: string,
    scheduleId: string,
    userContext: UserContext
  ): Promise<ScheduleWithTimeWindows> {
    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    const schedule = await ScheduleModel.findByIdWithTimeWindows(scheduleId);

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    // Verify schedule belongs to facility
    if (schedule.facility_id !== facilityId) {
      throw new Error('Schedule does not belong to this facility');
    }

    // Admins and facility admins can see any schedule
    if (AuthService.isAdmin(userContext.role) || AuthService.isFacilityAdmin(userContext.role)) {
      return schedule;
    }

    // Tenants and maintenance can only see their own schedule
    const userSchedule = await UserFacilityScheduleModel.getUserScheduleForFacility(
      userContext.userId,
      facilityId
    );

    if (!userSchedule || userSchedule.schedule_id !== scheduleId) {
      throw new Error('Access denied to this schedule');
    }

    return schedule;
  }

  /**
   * Create a new schedule
   *
   * Only admins and facility admins can create schedules.
   * Facility admins can only create for their facilities.
   */
  public static async createSchedule(
    facilityId: string,
    data: {
      name: string;
      schedule_type: 'precanned' | 'custom';
      is_active?: boolean;
    },
    timeWindows: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>,
    userContext: UserContext
  ): Promise<ScheduleWithTimeWindows> {
    // Verify user can manage schedules
    if (!AuthService.isAdmin(userContext.role) && !AuthService.isFacilityAdmin(userContext.role)) {
      throw new Error('Insufficient permissions to create schedules');
    }

    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // Create schedule
    const schedule = await ScheduleModel.createWithTimeWindows(
      {
        facility_id: facilityId,
        name: data.name,
        schedule_type: data.schedule_type,
        is_active: data.is_active ?? true,
        created_by: userContext.userId,
      },
      timeWindows
    );

    logger.info(`Schedule created: ${schedule.id} by user ${userContext.userId} for facility ${facilityId}`);

    return schedule;
  }

  /**
   * Update an existing schedule
   *
   * Only admins and facility admins can update schedules.
   * Precanned schedules can be updated but not deleted.
   */
  public static async updateSchedule(
    facilityId: string,
    scheduleId: string,
    userContext: UserContext,
    data: {
      name?: string;
      is_active?: boolean;
    },
    timeWindows?: Array<{
      day_of_week: number;
      start_time: string;
      end_time: string;
    }>
  ): Promise<ScheduleWithTimeWindows> {
    // Verify user can manage schedules
    if (!AuthService.isAdmin(userContext.role) && !AuthService.isFacilityAdmin(userContext.role)) {
      throw new Error('Insufficient permissions to update schedules');
    }

    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // Verify schedule exists and belongs to facility
    const existing = await ScheduleModel.findById(scheduleId);
    if (!existing || existing.facility_id !== facilityId) {
      throw new Error('Schedule not found');
    }

    // Update schedule
    const schedule = await ScheduleModel.updateWithTimeWindows(scheduleId, data, timeWindows);

    logger.info(`Schedule updated: ${scheduleId} by user ${userContext.userId}`);

    return schedule;
  }

  /**
   * Delete a schedule
   *
   * Only admins and facility admins can delete schedules.
   * Precanned schedules cannot be deleted (only deactivated).
   */
  public static async deleteSchedule(
    facilityId: string,
    scheduleId: string,
    userContext: UserContext
  ): Promise<void> {
    // Verify user can manage schedules
    if (!AuthService.isAdmin(userContext.role) && !AuthService.isFacilityAdmin(userContext.role)) {
      throw new Error('Insufficient permissions to delete schedules');
    }

    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // Verify schedule exists and belongs to facility
    const existing = await ScheduleModel.findById(scheduleId);
    if (!existing || existing.facility_id !== facilityId) {
      throw new Error('Schedule not found');
    }

    // Prevent deletion of precanned schedules
    if (existing.schedule_type === 'precanned') {
      throw new Error('Precanned schedules cannot be deleted. They can only be deactivated.');
    }

    // Delete schedule (cascade will delete time windows)
    await ScheduleModel.deleteById(scheduleId);

    logger.info(`Schedule deleted: ${scheduleId} by user ${userContext.userId}`);
  }

  /**
   * Get user's schedule for a facility
   */
  public static async getUserScheduleForFacility(
    userId: string,
    facilityId: string,
    requestingUserContext: UserContext
  ): Promise<ScheduleWithTimeWindows | null> {
    // Users can see their own schedule, admins can see any
    const isSelf = requestingUserContext.userId === userId;
    const isAdmin = AuthService.isAdmin(requestingUserContext.role) || AuthService.isFacilityAdmin(requestingUserContext.role);

    if (!isSelf && !isAdmin) {
      throw new Error('Insufficient permissions to view this schedule');
    }

    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      requestingUserContext.userId,
      requestingUserContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // If admin viewing another user's schedule, verify that user has access to facility
    if (!isSelf) {
      const userHasAccess = await FacilityAccessService.hasAccessToFacility(
        userId,
        'tenant' as UserRole, // We don't know the role, but this will check association
        facilityId
      );
      if (!userHasAccess) {
        throw new Error('User does not have access to this facility');
      }
    }

    const userSchedule = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
      userId,
      facilityId
    );

    return userSchedule?.schedule ?? null;
  }

  /**
   * Set user's schedule for a facility
   *
   * Only admins, facility admins, or the user themselves can set schedules.
   * Facility admins can only set for users in their facilities.
   */
  public static async setUserSchedule(
    userId: string,
    facilityId: string,
    scheduleId: string,
    userContext: UserContext
  ): Promise<UserFacilityScheduleWithDetails> {
    // Verify user can manage schedules
    const isSelf = userContext.userId === userId;
    const canManageUsers = AuthService.canManageUsers(userContext.role);
    const isFacilityAdmin = AuthService.isFacilityAdmin(userContext.role);

    if (!isSelf && !canManageUsers && !isFacilityAdmin) {
      throw new Error('Insufficient permissions to set user schedules');
    }

    // Verify facility access
    const hasAccess = await FacilityAccessService.hasAccessToFacility(
      userContext.userId,
      userContext.role,
      facilityId
    );

    if (!hasAccess) {
      throw new Error('Access denied to this facility');
    }

    // If facility admin, verify user is in their facility
    if (isFacilityAdmin && !isSelf) {
      const userHasAccess = await FacilityAccessService.hasAccessToFacility(
        userId,
        'tenant' as UserRole,
        facilityId
      );
      if (!userHasAccess) {
        throw new Error('User does not have access to this facility');
      }
    }

    // Verify schedule exists and belongs to facility
    const schedule = await ScheduleModel.findById(scheduleId);
    if (!schedule || schedule.facility_id !== facilityId) {
      throw new Error('Schedule not found');
    }

    // Set user schedule
    const userSchedule = await UserFacilityScheduleModel.setUserSchedule(
      userId,
      facilityId,
      scheduleId,
      userContext.userId
    );

    const result = await UserFacilityScheduleModel.getUserScheduleForFacilityWithDetails(
      userId,
      facilityId
    );

    if (!result) {
      throw new Error('Failed to retrieve user schedule');
    }

    logger.info(`User schedule set: user ${userId} -> schedule ${scheduleId} in facility ${facilityId} by ${userContext.userId}`);

    return result;
  }

  /**
   * Initialize default schedules for a new facility
   *
   * Creates "Default Tenant Schedule" and "Maintenance Schedule" as precanned schedules.
   * Default Tenant Schedule starts with 24/7 access (all days, 00:00-23:59).
   */
  public static async initializeDefaultSchedules(facilityId: string): Promise<void> {
    try {
      // Check if schedules already exist
      const existing = await ScheduleModel.findByFacility(facilityId, { schedule_type: 'precanned' });
      if (existing.length > 0) {
        logger.info(`Default schedules already exist for facility ${facilityId}`);
        return;
      }

      // Create Default Tenant Schedule (24/7 access)
      const defaultTenantTimeWindows: Array<{ day_of_week: number; start_time: string; end_time: string }> = [];
      for (let day = 0; day <= 6; day++) {
        defaultTenantTimeWindows.push({
          day_of_week: day,
          start_time: '00:00:00',
          end_time: '23:59:59',
        });
      }

      await ScheduleModel.createWithTimeWindows(
        {
          facility_id: facilityId,
          name: 'Default Tenant Schedule',
          schedule_type: 'precanned',
          is_active: true,
          created_by: null, // System-created
        },
        defaultTenantTimeWindows
      );

      // Create Maintenance Schedule (empty initially, can be customized)
      await ScheduleModel.createWithTimeWindows(
        {
          facility_id: facilityId,
          name: 'Maintenance Schedule',
          schedule_type: 'precanned',
          is_active: true,
          created_by: null, // System-created
        },
        [] // Empty initially
      );

      logger.info(`Default schedules initialized for facility ${facilityId}`);
    } catch (error) {
      logger.error(`Failed to initialize default schedules for facility ${facilityId}:`, error);
      throw error;
    }
  }
}

