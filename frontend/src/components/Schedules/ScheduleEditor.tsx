import React, { useState, useCallback } from 'react';
import { TimeWindow, DAY_NAMES_SHORT, DayOfWeek } from '@/types/schedule.types';
import { 
  PlusIcon, 
  TrashIcon, 
  DocumentDuplicateIcon,
  XMarkIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface ScheduleEditorProps {
  timeWindows: TimeWindow[];
  onChange: (timeWindows: TimeWindow[]) => void;
  className?: string;
}

/**
 * Schedule Editor Component
 *
 * Allows editing of time windows for a schedule.
 * Supports adding, removing, and modifying time windows for each day of the week.
 */
export const ScheduleEditor: React.FC<ScheduleEditorProps> = ({ timeWindows, onChange, className = '' }) => {
  // Group time windows by day
  const groupWindowsByDay = useCallback((windows: TimeWindow[]): Record<DayOfWeek, TimeWindow[]> => {
    const grouped: Record<DayOfWeek, TimeWindow[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };

    windows.forEach(window => {
      grouped[window.day_of_week as DayOfWeek].push(window);
    });

    // Sort by start time
    Object.keys(grouped).forEach(day => {
      grouped[day as DayOfWeek].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    return grouped;
  }, []);

  const [windowsByDay, setWindowsByDay] = useState<Record<DayOfWeek, TimeWindow[]>>(() => 
    groupWindowsByDay(timeWindows)
  );

  // Sync with external prop changes
  React.useEffect(() => {
    setWindowsByDay(groupWindowsByDay(timeWindows));
  }, [timeWindows, groupWindowsByDay]);

  const updateWindows = useCallback((newWindowsByDay: Record<DayOfWeek, TimeWindow[]>) => {
    setWindowsByDay(newWindowsByDay);
    // Flatten and emit
    const allWindows: TimeWindow[] = [];
    Object.values(newWindowsByDay).forEach(windows => {
      allWindows.push(...windows);
    });
    onChange(allWindows);
  }, [onChange]);

  const addTimeWindow = (day: DayOfWeek) => {
    const newWindow: TimeWindow = {
      day_of_week: day,
      start_time: '09:00:00',
      end_time: '17:00:00',
    };

    const updated = {
      ...windowsByDay,
      [day]: [...windowsByDay[day], newWindow].sort((a, b) => a.start_time.localeCompare(b.start_time)),
    };

    updateWindows(updated);
  };

  const removeTimeWindow = (day: DayOfWeek, index: number) => {
    const updated = {
      ...windowsByDay,
      [day]: windowsByDay[day].filter((_, i) => i !== index),
    };

    updateWindows(updated);
  };

  const updateTimeWindow = (day: DayOfWeek, index: number, field: 'start_time' | 'end_time', value: string) => {
    const updated = {
      ...windowsByDay,
      [day]: windowsByDay[day].map((window, i) => {
        if (i === index) {
          return { ...window, [field]: value };
        }
        return window;
      }),
    };

    updateWindows(updated);
  };

  const copyToOtherDays = (sourceDay: DayOfWeek) => {
    const sourceWindows = windowsByDay[sourceDay];
    if (sourceWindows.length === 0) return;

    const updated = { ...windowsByDay };
    (Object.keys(DAY_NAMES_SHORT) as DayOfWeek[]).forEach(day => {
      if (day !== sourceDay) {
        updated[day] = sourceWindows.map(w => ({ ...w, day_of_week: day }));
      }
    });

    updateWindows(updated);
  };

  const clearDay = (day: DayOfWeek) => {
    const updated = {
      ...windowsByDay,
      [day]: [],
    };

    updateWindows(updated);
  };

  const setDayAlways = (day: DayOfWeek) => {
    const updated = {
      ...windowsByDay,
      [day]: [{ day_of_week: day, start_time: '00:00:00', end_time: '23:59:59' }],
    };
    updateWindows(updated);
  };

  const setAllDaysAlways = () => {
    const updated: Record<DayOfWeek, TimeWindow[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };
    (Object.keys(DAY_NAMES_SHORT) as DayOfWeek[]).forEach(day => {
      updated[day] = [{ day_of_week: day, start_time: '00:00:00', end_time: '23:59:59' }];
    });
    updateWindows(updated);
  };

  return (
    <div className={`schedule-editor ${className}`}>
      {/* Global "Always" button */}
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={setAllDaysAlways}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors border border-primary-200 dark:border-primary-800"
          title="Set all days to 24/7 access (00:00 - 23:59)"
        >
          <ClockIcon className="h-4 w-4" />
          Always
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {(Object.keys(DAY_NAMES_SHORT) as DayOfWeek[]).map(day => {
          const windows = windowsByDay[day];

          return (
            <div
              key={day}
              className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg p-1.5 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  {DAY_NAMES_SHORT[day]}
                </div>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setDayAlways(day)}
                    className="p-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                    title="Set this day to 24/7 access (00:00 - 23:59)"
                  >
                    <ClockIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToOtherDays(day)}
                    className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Copy this day's schedule to all other days"
                  >
                    <DocumentDuplicateIcon className="h-3.5 w-3.5" />
                  </button>
                  {windows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearDay(day)}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Clear all time windows for this day"
                    >
                      <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 min-h-[160px]">
                {windows.map((window, idx) => (
                  <div
                    key={idx}
                    className="p-1 border border-primary-300 dark:border-primary-700 rounded bg-primary-50 dark:bg-primary-900/20"
                  >
                    <div className="flex items-center gap-0.5">
                      <input
                        type="time"
                        value={window.start_time.substring(0, 5)}
                        onChange={(e) => {
                          const time = e.target.value + ':00';
                          updateTimeWindow(day, idx, 'start_time', time);
                        }}
                        className="flex-1 text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-w-0 w-0"
                        style={{ fontSize: '11px' }}
                      />
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 px-0.5">-</span>
                      <input
                        type="time"
                        value={window.end_time.substring(0, 5)}
                        onChange={(e) => {
                          const time = e.target.value + ':00';
                          updateTimeWindow(day, idx, 'end_time', time);
                        }}
                        className="flex-1 text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 min-w-0 w-0"
                        style={{ fontSize: '11px' }}
                      />
                      <button
                        type="button"
                        onClick={() => removeTimeWindow(day, idx)}
                        className="p-0.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                        title="Remove time window"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addTimeWindow(day)}
                  className="w-full py-1.5 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded text-xs text-gray-600 dark:text-gray-400 hover:border-primary-500 dark:hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors flex items-center justify-center gap-1"
                  title="Add a time window for this day"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

