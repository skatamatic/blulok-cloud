import type { ScheduleTimeWindow } from '@/models/schedule.model';

export type SerializedScheduleTimeWindow = {
  day_of_week: number;
  start_time: string;
  end_time: string;
};

export type SerializedSchedule = {
  facility_id: string;
  time_windows: SerializedScheduleTimeWindow[];
};

type ScheduleWindowLike = Pick<ScheduleTimeWindow, 'day_of_week' | 'start_time' | 'end_time'>;

export function serializeScheduleTimeWindow(window: ScheduleWindowLike): SerializedScheduleTimeWindow {
  return {
    day_of_week: Number(window.day_of_week),
    start_time: String(window.start_time),
    end_time: String(window.end_time),
  };
}

export function serializeScheduleForTransport(params: {
  facilityId: string;
  timeWindows: ScheduleWindowLike[];
}): SerializedSchedule {
  const normalizedWindows = (params.timeWindows || [])
    .map(serializeScheduleTimeWindow)
    .filter((window) => (
      Number.isInteger(window.day_of_week)
      && window.day_of_week >= 0
      && window.day_of_week <= 6
      && Boolean(window.start_time)
      && Boolean(window.end_time)
    ))
    .sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
      return a.start_time.localeCompare(b.start_time);
    });

  return {
    facility_id: params.facilityId,
    time_windows: normalizedWindows,
  };
}

