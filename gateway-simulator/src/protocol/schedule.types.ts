/** Mirrors backend SerializedScheduleTimeWindow for device-side schedule checks. */
export type ScheduleTimeWindow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type SerializedSchedule = {
  facility_id?: string;
  time_windows?: ScheduleTimeWindow[];
};
