import React, { useState, useCallback, useImperativeHandle, useEffect } from 'react';
import { TimeWindow, DAY_NAMES_SHORT, DayOfWeek } from '@/types/schedule.types';
import { 
  PlusIcon, 
  TrashIcon, 
  DocumentDuplicateIcon,
  XMarkIcon,
  ClockIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface ScheduleEditorProps {
  timeWindows: TimeWindow[];
  onChange?: (timeWindows: TimeWindow[]) => void;
  className?: string;
  // If onChange is not provided, component manages its own state
  // Use getValue() via ref to get current value
}

export interface ScheduleEditorRef {
  getValue: () => TimeWindow[];
  hasValidationErrors: () => boolean;
  getValidationErrors: () => Record<string, string[]>;
}

/**
 * Schedule Editor Component
 *
 * Allows editing of time windows for a schedule.
 * Supports adding, removing, and modifying time windows for each day of the week.
 * 
 * If onChange is provided, it will be called on every change (auto-save mode).
 * If onChange is not provided, use the ref's getValue() method to get current value (manual save mode).
 */
export const ScheduleEditor = React.forwardRef<ScheduleEditorRef, ScheduleEditorProps>(
  ({ timeWindows, onChange, className = '' }, ref) => {
  // Group time windows by day
  const groupWindowsByDay = useCallback((windows: TimeWindow[]): Record<DayOfWeek, TimeWindow[]> => {
    const grouped: Record<DayOfWeek, TimeWindow[]> = {
      0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [],
    };

    windows.forEach(window => {
      grouped[window.day_of_week as DayOfWeek].push(window);
    });

    // Sort by start time
    (Object.keys(grouped) as unknown as DayOfWeek[]).forEach(day => {
      grouped[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

    return grouped;
  }, []);

  const [windowsByDay, setWindowsByDay] = useState<Record<DayOfWeek, TimeWindow[]>>(() => 
    groupWindowsByDay(timeWindows)
  );
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});

  // Sync with external prop changes
  useEffect(() => {
    setWindowsByDay(groupWindowsByDay(timeWindows));
  }, [timeWindows, groupWindowsByDay]);

  // Check if two time windows overlap
  const doWindowsOverlap = useCallback((window1: TimeWindow, window2: TimeWindow): boolean => {
    const start1 = window1.start_time;
    const end1 = window1.end_time;
    const start2 = window2.start_time;
    const end2 = window2.end_time;

    // Check if windows overlap (not including touching at boundaries - adjacent windows are allowed)
    // Overlap occurs when: start1 < end2 && start2 < end1
    // But we want to allow adjacent windows (e.g., 09:00-12:00 and 12:00-17:00 are OK)
    return start1 < end2 && start2 < end1;
  }, []);

  // Validate time windows for a specific day
  const validateDay = useCallback((_day: DayOfWeek, windows: TimeWindow[]): string[] => {
    const errors: string[] = [];
    
    // Check each window against all others
    for (let i = 0; i < windows.length; i++) {
      for (let j = i + 1; j < windows.length; j++) {
        if (doWindowsOverlap(windows[i], windows[j])) {
          errors.push(`Time window ${i + 1} overlaps with time window ${j + 1}`);
        }
      }
      
      // Also check if start_time >= end_time
      if (windows[i].start_time >= windows[i].end_time) {
        errors.push(`Time window ${i + 1} has invalid time range (start must be before end)`);
      }
    }
    
    return errors;
  }, [doWindowsOverlap]);

  // Validate all days and update validation errors
  const validateAll = useCallback((windowsByDay: Record<DayOfWeek, TimeWindow[]>) => {
    const errors: Record<string, string[]> = {};
    
    ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).forEach(day => {
      const dayErrors = validateDay(day, windowsByDay[day]);
      if (dayErrors.length > 0) {
        errors[String(day)] = dayErrors;
      }
    });
    
    setValidationErrors(errors);
    return errors;
  }, [validateDay]);

  // Validate whenever windows change
  useEffect(() => {
    validateAll(windowsByDay);
  }, [windowsByDay, validateAll]);

  const updateWindows = useCallback((newWindowsByDay: Record<DayOfWeek, TimeWindow[]>) => {
    setWindowsByDay(newWindowsByDay);
    // Validate after update
    validateAll(newWindowsByDay);
    // Only call onChange if provided (auto-save mode)
    if (onChange) {
      const allWindows: TimeWindow[] = [];
      Object.values(newWindowsByDay).forEach(windows => {
        allWindows.push(...windows);
      });
      onChange(allWindows);
    }
  }, [onChange, validateAll]);

  // Expose getValue and validation methods via ref
  useImperativeHandle(ref, () => ({
    getValue: () => {
      const allWindows: TimeWindow[] = [];
      Object.values(windowsByDay).forEach(windows => {
        allWindows.push(...windows);
      });
      return allWindows;
    },
    hasValidationErrors: () => {
      return Object.keys(validationErrors).length > 0;
    },
    getValidationErrors: () => {
      return validationErrors;
    },
  }), [windowsByDay, validationErrors]);

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
    ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).forEach(day => {
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
    ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).forEach(day => {
      updated[day] = [{ day_of_week: day, start_time: '00:00:00', end_time: '23:59:59' }];
    });
    updateWindows(updated);
  };

  return (
    <div className={`schedule-editor ${className}`}>
      <style>{`
        /* Hide native browser clock icon in time inputs */
        input[type="time"]::-webkit-calendar-picker-indicator {
          opacity: 0;
          position: absolute;
          right: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
        input[type="time"]::-webkit-inner-spin-button,
        input[type="time"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
      `}</style>
      {/* Global "Always" button */}
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={setAllDaysAlways}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors border border-primary-200 dark:border-primary-800"
          title="Set all days to 24/7 access (00:00 - 23:59)"
        >
          <ClockIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          Always
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map(day => {
          const windows = windowsByDay[day];

          return (
            <div
              key={day}
              className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg p-1.5 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {DAY_NAMES_SHORT[day]}
                  </div>
                  {validationErrors[day] && validationErrors[day].length > 0 && (
                    <ExclamationCircleIcon className="h-3.5 w-3.5 text-red-500 dark:text-red-400" title={`${validationErrors[day].length} validation error${validationErrors[day].length !== 1 ? 's' : ''}`} />
                  )}
                </div>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setDayAlways(day)}
                    className="p-1 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded transition-colors"
                    title="Set this day to 24/7 access (00:00 - 23:59)"
                  >
                    <ClockIcon className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToOtherDays(day)}
                    className="p-1 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                    title="Copy this day's schedule to all other days"
                  >
                    <DocumentDuplicateIcon className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                  </button>
                  {windows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearDay(day)}
                      className="p-1 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      title="Clear all time windows for this day"
                    >
                      <XMarkIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 min-h-[160px]">
                {windows.map((window, idx) => {
                  const dayErrors = validationErrors[day] || [];
                  const hasError = dayErrors.some(err => err.includes(`Time window ${idx + 1}`));
                  
                  return (
                  <div
                    key={idx}
                    className={`p-1 border rounded ${
                      hasError
                        ? 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                        : 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex-1 relative">
                          <input
                            type="time"
                            value={window.start_time.substring(0, 5)}
                            onChange={(e) => {
                              const time = e.target.value + ':00';
                              updateTimeWindow(day, idx, 'start_time', time);
                            }}
                            className="w-full text-xs px-2 py-1 pr-7 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                            style={{ 
                              fontSize: '11px',
                              colorScheme: 'dark'
                            }}
                          />
                          <ClockIcon className="absolute right-1.5 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTimeWindow(day, idx)}
                          className="p-0.5 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                          title="Remove time window"
                        >
                          <TrashIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                      <div className="text-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 italic">to</span>
                      </div>
                      <div className="relative">
                        <input
                          type="time"
                          value={window.end_time.substring(0, 5)}
                          onChange={(e) => {
                            const time = e.target.value + ':00';
                            updateTimeWindow(day, idx, 'end_time', time);
                          }}
                          className="w-full text-xs px-2 py-1 pr-7 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                          style={{ 
                            fontSize: '11px',
                            colorScheme: 'dark'
                          }}
                        />
                        <ClockIcon className="absolute right-1.5 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400 dark:text-gray-500 pointer-events-none" />
                      </div>
                      {/* Validation Error Message */}
                      {hasError && (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                          <ExclamationCircleIcon className="h-3 w-3 flex-shrink-0 mt-0.5" />
                          <span className="leading-tight">
                            {dayErrors.find(err => err.includes(`Time window ${idx + 1}`))?.replace(`Time window ${idx + 1} `, '') || 'Overlaps with another time window'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

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
});

ScheduleEditor.displayName = 'ScheduleEditor';

