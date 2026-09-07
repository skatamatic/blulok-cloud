/**
 * Schedule Type Definitions
 *
 * TypeScript interfaces for schedule management in the frontend.
 * These types correspond to the backend schedule models and API responses.
 */

/**
 * Day of week enumeration
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Schedule type enumeration
 */
export type ScheduleType = 'precanned' | 'custom';

/**
 * Time window for a specific day
 */
export interface TimeWindow {
  /** Day of week (0=Sunday, 6=Saturday) */
  day_of_week: DayOfWeek;
  /** Start time in HH:MM:SS format */
  start_time: string;
  /** End time in HH:MM:SS format */
  end_time: string;
}

/**
 * Schedule entity
 */
export interface Schedule {
  /** Globally unique identifier for the schedule */
  id: string;
  /** Facility this schedule belongs to */
  facility_id: string;
  /** Schedule name (e.g., "Default Tenant Schedule", "Maintenance Schedule") */
  name: string;
  /** Type of schedule: precanned (system) or custom (user-created) */
  schedule_type: ScheduleType;
  /** Whether the schedule is currently active */
  is_active: boolean;
  /** User who created this schedule (null for system-created) */
  created_by: string | null;
  /** Schedule creation timestamp */
  created_at: string;
  /** Schedule last update timestamp */
  updated_at: string;
}

/**
 * Schedule with time windows
 */
export interface ScheduleWithTimeWindows extends Schedule {
  /** Array of time windows for this schedule */
  time_windows: TimeWindow[];
}

/**
 * User facility schedule association
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
  created_at: string;
  /** Association last update timestamp */
  updated_at: string;
}

/**
 * User facility schedule with full schedule details
 */
export interface UserFacilityScheduleWithDetails extends UserFacilitySchedule {
  /** Full schedule details including time windows */
  schedule: ScheduleWithTimeWindows;
}

/**
 * Create schedule request
 */
export interface CreateScheduleRequest {
  /** Schedule name */
  name: string;
  /** Schedule type */
  schedule_type: ScheduleType;
  /** Whether the schedule is active */
  is_active?: boolean;
  /** Time windows for the schedule */
  time_windows: TimeWindow[];
}

/**
 * Update schedule request
 */
export interface UpdateScheduleRequest {
  /** Schedule name (optional) */
  name?: string;
  /** Whether the schedule is active (optional) */
  is_active?: boolean;
  /** Time windows for the schedule (optional) */
  time_windows?: TimeWindow[];
}

/**
 * Set user schedule request
 */
export interface SetUserScheduleRequest {
  /** Schedule ID to assign to the user */
  scheduleId: string;
}

/**
 * API response for list of schedules
 */
export interface SchedulesResponse {
  success: boolean;
  schedules: ScheduleWithTimeWindows[];
  total: number;
}

/**
 * API response for a single schedule
 */
export interface ScheduleResponse {
  success: boolean;
  schedule: ScheduleWithTimeWindows;
}

/**
 * API response for user schedule
 */
export interface UserScheduleResponse {
  success: boolean;
  schedule: ScheduleWithTimeWindows | null;
}

/**
 * API response for user facility schedule
 */
export interface UserFacilityScheduleResponse {
  success: boolean;
  userSchedule: UserFacilityScheduleWithDetails;
}

/**
 * Day names for display
 */
export const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/**
 * Short day names for display
 */
export const DAY_NAMES_SHORT: Record<DayOfWeek, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

