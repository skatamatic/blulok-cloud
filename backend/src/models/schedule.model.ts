import { BaseModel } from './base.model';
import { v4 as uuidv4 } from 'uuid';

/**
 * Schedule Entity Interface
 *
 * Represents a facility-level schedule definition that defines time-based access control.
 * Schedules can be precanned (system-defined) or custom (user-defined).
 */
export interface Schedule {
  /** Globally unique identifier for the schedule */
  id: string;
  /** Facility this schedule belongs to */
  facility_id: string;
  /** Schedule name (e.g., "Default Tenant Schedule", "Maintenance Schedule") */
  name: string;
  /** Type of schedule: precanned (system) or custom (user-created) */
  schedule_type: 'precanned' | 'custom';
  /** Whether the schedule is currently active */
  is_active: boolean;
  /** User who created this schedule (null for system-created) */
  created_by: string | null;
  /** Schedule creation timestamp */
  created_at: Date;
  /** Schedule last update timestamp */
  updated_at: Date;
}

/**
 * Schedule Time Window Interface
 *
 * Represents a time window within a schedule for a specific day of the week.
 * Multiple time windows per day are supported.
 */
export interface ScheduleTimeWindow {
  /** Globally unique identifier for the time window */
  id: string;
  /** Schedule this time window belongs to */
  schedule_id: string;
  /** Day of week (0=Sunday, 1=Monday, ..., 6=Saturday) */
  day_of_week: number;
  /** Start time in HH:MM:SS format */
  start_time: string;
  /** End time in HH:MM:SS format */
  end_time: string;
  /** Time window creation timestamp */
  created_at: Date;
  /** Time window last update timestamp */
  updated_at: Date;
}

/**
 * Schedule with Time Windows
 *
 * Extended schedule object that includes all associated time windows.
 */
export interface ScheduleWithTimeWindows extends Schedule {
  /** Array of time windows for this schedule */
  time_windows: ScheduleTimeWindow[];
}

/**
 * Schedule Model Class
 *
 * Handles all database operations for schedules and their time windows.
 * Provides methods for creating, updating, and querying schedules with their
 * associated time windows.
 */
export class ScheduleModel extends BaseModel {
  protected static override get tableName(): string {
    return 'schedules';
  }

  private static get timeWindowsTableName(): string {
    return 'schedule_time_windows';
  }

  /**
   * Find schedule by ID
   */
  public static async findById(id: string): Promise<Schedule | undefined> {
    return super.findById(id) as Promise<Schedule | undefined>;
  }

  /**
   * Find all schedules for a facility
   */
  public static async findByFacility(
    facilityId: string,
    filters: { schedule_type?: 'precanned' | 'custom'; is_active?: boolean } = {}
  ): Promise<Schedule[]> {
    let query = this.query().where('facility_id', facilityId);

    if (filters.schedule_type) {
      query = query.where('schedule_type', filters.schedule_type);
    }

    if (filters.is_active !== undefined) {
      query = query.where('is_active', filters.is_active);
    }

    return query.orderBy('name', 'asc') as Promise<Schedule[]>;
  }

  /**
   * Get schedule with all its time windows
   */
  public static async findByIdWithTimeWindows(id: string): Promise<ScheduleWithTimeWindows | undefined> {
    const schedule = await this.findById(id);
    if (!schedule) {
      return undefined;
    }

    const timeWindows = await this.db(this.timeWindowsTableName)
      .where('schedule_id', id)
      .orderBy(['day_of_week', 'start_time']) as ScheduleTimeWindow[];

    return {
      ...schedule,
      time_windows: timeWindows,
    };
  }

  /**
   * Get schedule for facility with time windows
   */
  public static async findByFacilityWithTimeWindows(
    facilityId: string,
    filters: { schedule_type?: 'precanned' | 'custom'; is_active?: boolean } = {}
  ): Promise<ScheduleWithTimeWindows[]> {
    const schedules = await this.findByFacility(facilityId, filters);

    const schedulesWithWindows: ScheduleWithTimeWindows[] = [];

    for (const schedule of schedules) {
      const timeWindows = await this.db(this.timeWindowsTableName)
        .where('schedule_id', schedule.id)
        .orderBy(['day_of_week', 'start_time']) as ScheduleTimeWindow[];

      schedulesWithWindows.push({
        ...schedule,
        time_windows: timeWindows,
      });
    }

    return schedulesWithWindows;
  }

  /**
   * Create a new schedule with time windows
   */
  public static async createWithTimeWindows(
    data: Omit<Schedule, 'id' | 'created_at' | 'updated_at'>,
    timeWindows: Omit<ScheduleTimeWindow, 'id' | 'schedule_id' | 'created_at' | 'updated_at'>[]
  ): Promise<ScheduleWithTimeWindows> {
    const scheduleId = uuidv4();

    // Create schedule
    await this.query().insert({
      id: scheduleId,
      ...data,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });

    // Create time windows
    if (timeWindows.length > 0) {
      const windowsToInsert = timeWindows.map(window => ({
        id: uuidv4(),
        schedule_id: scheduleId,
        day_of_week: window.day_of_week,
        start_time: window.start_time,
        end_time: window.end_time,
        created_at: this.db.fn.now(),
        updated_at: this.db.fn.now(),
      }));

      await this.db(this.timeWindowsTableName).insert(windowsToInsert);
    }

    // Return schedule with time windows
    const result = await this.findByIdWithTimeWindows(scheduleId);
    if (!result) {
      throw new Error('Failed to create schedule');
    }

    return result;
  }

  /**
   * Update schedule and its time windows
   */
  public static async updateWithTimeWindows(
    id: string,
    data: Partial<Omit<Schedule, 'id' | 'created_at' | 'updated_at'>>,
    timeWindows?: Omit<ScheduleTimeWindow, 'id' | 'schedule_id' | 'created_at' | 'updated_at'>[]
  ): Promise<ScheduleWithTimeWindows> {
    // Update schedule
    if (Object.keys(data).length > 0) {
      await this.updateById(id, data);
    }

    // Update time windows if provided
    if (timeWindows !== undefined) {
      // Delete existing time windows
      await this.db(this.timeWindowsTableName).where('schedule_id', id).del();

      // Insert new time windows
      if (timeWindows.length > 0) {
        const windowsToInsert = timeWindows.map(window => ({
          id: uuidv4(),
          schedule_id: id,
          day_of_week: window.day_of_week,
          start_time: window.start_time,
          end_time: window.end_time,
          created_at: this.db.fn.now(),
          updated_at: this.db.fn.now(),
        }));

        await this.db(this.timeWindowsTableName).insert(windowsToInsert);
      }
    }

    // Return updated schedule with time windows
    const result = await this.findByIdWithTimeWindows(id);
    if (!result) {
      throw new Error('Failed to update schedule');
    }

    return result;
  }

  /**
   * Delete schedule and all its time windows (cascade)
   */
  public static async deleteById(id: string): Promise<number> {
    // Time windows will be deleted via CASCADE foreign key
    return super.deleteById(id);
  }

  /**
   * Get time windows for a schedule
   */
  public static async getTimeWindows(scheduleId: string): Promise<ScheduleTimeWindow[]> {
    return this.db(this.timeWindowsTableName)
      .where('schedule_id', scheduleId)
      .orderBy(['day_of_week', 'start_time']) as Promise<ScheduleTimeWindow[]>;
  }

  /**
   * Add a time window to a schedule
   */
  public static async addTimeWindow(
    scheduleId: string,
    window: Omit<ScheduleTimeWindow, 'id' | 'schedule_id' | 'created_at' | 'updated_at'>
  ): Promise<ScheduleTimeWindow> {
    const windowId = uuidv4();

    await this.db(this.timeWindowsTableName).insert({
      id: windowId,
      schedule_id: scheduleId,
      day_of_week: window.day_of_week,
      start_time: window.start_time,
      end_time: window.end_time,
      created_at: this.db.fn.now(),
      updated_at: this.db.fn.now(),
    });

    const result = await this.db(this.timeWindowsTableName)
      .where('id', windowId)
      .first() as ScheduleTimeWindow | undefined;

    if (!result) {
      throw new Error('Failed to create time window');
    }

    return result;
  }

  /**
   * Remove a time window
   */
  public static async removeTimeWindow(windowId: string): Promise<number> {
    return this.db(this.timeWindowsTableName).where('id', windowId).del();
  }
}

