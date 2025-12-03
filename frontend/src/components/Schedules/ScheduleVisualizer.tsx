import React from 'react';
import { ScheduleWithTimeWindows, TimeWindow, DAY_NAMES_SHORT, DayOfWeek } from '@/types/schedule.types';

interface ScheduleVisualizerProps {
  schedule: ScheduleWithTimeWindows;
  className?: string;
}

/**
 * Schedule Visualizer Component
 *
 * Displays a schedule in a read-only, visual format.
 * Shows a week view with time windows highlighted for each day.
 */
export const ScheduleVisualizer: React.FC<ScheduleVisualizerProps> = ({ schedule, className = '' }) => {
  // Group time windows by day
  const windowsByDay: Record<DayOfWeek, TimeWindow[]> = {
    0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
  };

  schedule.time_windows.forEach(window => {
    windowsByDay[window.day_of_week as DayOfWeek].push(window);
  });

  // Sort time windows by start time for each day
  Object.keys(windowsByDay).forEach(day => {
    windowsByDay[day as DayOfWeek].sort((a, b) => {
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Convert time string (HH:MM:SS) to minutes since midnight for positioning
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const minutesToPercent = (minutes: number): number => {
    // 24 hours = 1440 minutes
    return (minutes / 1440) * 100;
  };

  const formatTime = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className={`schedule-visualizer ${className}`}>
      <div className="grid grid-cols-7 gap-2">
        {(Object.keys(DAY_NAMES_SHORT) as DayOfWeek[]).map(day => {
          const windows = windowsByDay[day];
          const hasWindows = windows.length > 0;

          return (
            <div
              key={day}
              className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg p-1.5 bg-white dark:bg-gray-800"
            >
              <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5 text-center">
                {DAY_NAMES_SHORT[day]}
              </div>
              <div className="relative flex-1 min-h-[180px] bg-gray-50 dark:bg-gray-900 rounded">
                {hasWindows ? (
                  windows.map((window, idx) => {
                    const startMinutes = timeToMinutes(window.start_time);
                    const endMinutes = timeToMinutes(window.end_time);
                    const top = minutesToPercent(startMinutes);
                    const height = minutesToPercent(endMinutes - startMinutes);

                    return (
                      <div
                        key={idx}
                        className="absolute left-0 right-0 rounded border-2 border-primary-500 bg-primary-100 dark:bg-primary-900/30 dark:border-primary-400"
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                        }}
                        title={`${formatTime(window.start_time)} - ${formatTime(window.end_time)}`}
                      >
                        <div className="text-xs text-primary-700 dark:text-primary-300 p-0.5 font-medium leading-tight">
                          {formatTime(window.start_time)} - {formatTime(window.end_time)}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-600">
                    No access
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

