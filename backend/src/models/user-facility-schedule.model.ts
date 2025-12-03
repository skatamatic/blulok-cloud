import { BaseModel } from './base.model';
import { v4 as uuidv4 } from 'uuid';
import { ScheduleModel, ScheduleWithTimeWindows } from './schedule.model';

/**
 * User Facility Schedule Interface
 *
 * Represents the association between a user, a facility, and a schedule.
 * Each user can have one schedule per facility.
 */
export interface UserFacilitySchedule {
  /** Globally unique identifier for the association */
  id: string;
  /** User ID */
  user_id: string;
  /** Facility ID */
  facility_id: string;
  /** Schedule ID */
  schedule_id: string;
  /** User who created this association (nullable) */
  created_by: string | null;
  /** Association creation timestamp */
  created_at: Date;
  /** Association last update timestamp */
  updated_at: Date;
}

/**
 * User Facility Schedule with Schedule Details
 *
 * Extended association object that includes the full schedule information.
 */
export interface UserFacilityScheduleWithDetails extends UserFacilitySchedule {
  /** Full schedule details including time windows */
  schedule: ScheduleWithTimeWindows;
}

/**
 * User Facility Schedule Model Class
 *
 * Handles all database operations for user-facility-schedule associations.
 * Manages which schedule is assigned to each user for each facility.
 */
export class UserFacilityScheduleModel extends BaseModel {
  protected static override get tableName(): string {
    return 'user_facility_schedules';
  }

  /**
   * Find association by ID
   */
  public static async findById(id: string): Promise<UserFacilitySchedule | undefined> {
    return super.findById(id) as Promise<UserFacilitySchedule | undefined>;
  }

  /**
   * Get user's schedule for a specific facility
   */
  public static async getUserScheduleForFacility(
    userId: string,
    facilityId: string
  ): Promise<UserFacilitySchedule | undefined> {
    return this.query()
      .where('user_id', userId)
      .where('facility_id', facilityId)
      .first() as Promise<UserFacilitySchedule | undefined>;
  }

  /**
   * Get user's schedule for a facility with full schedule details
   */
  public static async getUserScheduleForFacilityWithDetails(
    userId: string,
    facilityId: string
  ): Promise<UserFacilityScheduleWithDetails | undefined> {
    const association = await this.getUserScheduleForFacility(userId, facilityId);
    if (!association) {
      return undefined;
    }

    const schedule = await ScheduleModel.findByIdWithTimeWindows(association.schedule_id);
    if (!schedule) {
      return undefined;
    }

    return {
      ...association,
      schedule,
    };
  }

  /**
   * Get all schedules for a user across all facilities
   */
  public static async getUserSchedules(userId: string): Promise<UserFacilitySchedule[]> {
    return this.query()
      .where('user_id', userId)
      .orderBy('facility_id', 'asc') as Promise<UserFacilitySchedule[]>;
  }

  /**
   * Get all users assigned to a schedule in a facility
   */
  public static async getUsersForSchedule(
    facilityId: string,
    scheduleId: string
  ): Promise<UserFacilitySchedule[]> {
    return this.query()
      .where('facility_id', facilityId)
      .where('schedule_id', scheduleId)
      .orderBy('user_id', 'asc') as Promise<UserFacilitySchedule[]>;
  }

  /**
   * Set or update user's schedule for a facility
   */
  public static async setUserSchedule(
    userId: string,
    facilityId: string,
    scheduleId: string,
    createdBy: string | null = null
  ): Promise<UserFacilitySchedule> {
    // Check if association already exists
    const existing = await this.getUserScheduleForFacility(userId, facilityId);

    if (existing) {
      // Update existing association
      await this.updateById(existing.id, {
        schedule_id: scheduleId,
        created_by: createdBy,
      });

      const updated = await this.findById(existing.id);
      if (!updated) {
        throw new Error('Failed to update user facility schedule');
      }

      return updated as UserFacilitySchedule;
    } else {
      // Create new association
      const associationId = uuidv4();

      await this.query().insert({
        id: associationId,
        user_id: userId,
        facility_id: facilityId,
        schedule_id: scheduleId,
        created_by: createdBy,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      });

      const created = await this.findById(associationId);
      if (!created) {
        throw new Error('Failed to create user facility schedule');
      }

      return created as UserFacilitySchedule;
    }
  }

  /**
   * Remove user's schedule for a facility
   */
  public static async removeUserSchedule(userId: string, facilityId: string): Promise<number> {
    return this.query()
      .where('user_id', userId)
      .where('facility_id', facilityId)
      .del();
  }

  /**
   * Get all schedules for a facility with user counts
   */
  public static async getSchedulesForFacilityWithUserCounts(
    facilityId: string
  ): Promise<Array<{ schedule_id: string; user_count: number }>> {
    return this.query()
      .select('schedule_id')
      .count('user_id as user_count')
      .where('facility_id', facilityId)
      .groupBy('schedule_id') as Promise<Array<{ schedule_id: string; user_count: number }>>;
  }
}

