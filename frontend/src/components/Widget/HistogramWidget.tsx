import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';
import {
  CalendarIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { useDashboardFacilityScope, DASHBOARD_FACILITY_SCOPE_LIMIT } from '@/hooks/useDashboardFacilityScope';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { getWidgetLayoutProfile, WIDGET_BODY_CLASS } from '@/utils/widget-layout.utils';
import {
  getHistogramTypeBreakdown,
  type HistogramActivityType,
} from '@/utils/histogram-activity-type.utils';
import {
  buildHistogramChartEntries,
  formatHistogramAxisLabel,
  shouldShowHistogramAxisLabel,
} from '@/utils/histogram-timeline.utils';

interface HistogramData {
  date: string;
  facilityId: string;
  facilityName: string;
  activityCount: number;
  byType: Partial<Record<HistogramActivityType, number>>;
}

interface HistogramWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  facilityFilter?: string;
}

type TimePeriod = 'day' | 'week' | 'month' | 'year';

const MAX_HISTOGRAM_FACILITIES = DASHBOARD_FACILITY_SCOPE_LIMIT;
const MAX_LEGEND_FACILITIES = 8;

function normalizeHistogramDateKey(raw: string): string {
  if (!raw) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  if (raw.includes(':')) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:00:00`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function parseChartDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00`);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T'));
  }
  return new Date(dateStr);
}

function formatDateLabel(dateStr: string, timePeriod: TimePeriod, detailed = false): string {
  const date = parseChartDate(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  switch (timePeriod) {
    case 'day':
      return detailed
        ? date.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            hour12: true,
          })
        : date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
    case 'week':
    case 'month':
      return detailed
        ? date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    case 'year':
      return detailed
        ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : date.toLocaleDateString('en-US', { month: 'short' });
    default:
      return dateStr;
  }
}

function HistogramBarTooltipContent({
  dayData,
  singleFacilityMode,
  colorIndex,
}: {
  dayData: HistogramData[];
  singleFacilityMode: boolean;
  colorIndex: (facilityId: string) => number;
}) {
  const total = dayData.reduce((sum, item) => sum + item.activityCount, 0);
  const facilities = [...dayData].sort((a, b) => b.activityCount - a.activityCount);

  const TypeRows = ({ byType, activityCount }: { byType: HistogramData['byType']; activityCount: number }) => {
    const rows = getHistogramTypeBreakdown(byType);
    const displayRows =
      rows.length > 0
        ? rows
        : activityCount > 0
          ? [{ type: 'access_attempt' as HistogramActivityType, label: 'Activity', count: activityCount }]
          : [];

    return (
      <ul className="mt-1.5 space-y-1">
        {displayRows.map((row) => (
          <li key={row.type} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-white">{row.count}</span>
          </li>
        ))}
      </ul>
    );
  };

  if (singleFacilityMode) {
    const facility = facilities[0];
    if (!facility) return null;
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-lg ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-900 dark:ring-white/10">
        <TypeRows byType={facility.byType} activityCount={facility.activityCount} />
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Total</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{total}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-lg ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-900 dark:ring-white/10">
      <div className="flex divide-x divide-gray-100 dark:divide-gray-700">
        {facilities.map((facility) => (
          <div key={facility.facilityId} className="min-w-[108px] px-3 first:pl-0 last:pr-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={`h-2 w-2 shrink-0 rounded-sm ${facilityColors[colorIndex(facility.facilityId) % facilityColors.length]}`}
              />
              <span className="truncate text-xs font-semibold text-gray-900 dark:text-white" title={facility.facilityName}>
                {facility.facilityName}
              </span>
            </div>
            <TypeRows byType={facility.byType} activityCount={facility.activityCount} />
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-1.5 text-[11px] dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{facility.activityCount}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
        <span className="text-gray-500 dark:text-gray-400">Total</span>
        <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{total}</span>
      </div>
    </div>
  );
}

type HistogramTooltipState = {
  dayData: HistogramData[];
  anchorX: number;
  anchorY: number;
};

function mergeActivityStatsRows(
  rows: ActivityStatsResponse['data'],
): HistogramData[] {
  const merged = new Map<string, HistogramData>();

  for (const row of rows) {
    const date = normalizeHistogramDateKey(row.date);
    const key = `${date}|${row.facility_id}`;
    let entry = merged.get(key);
    if (!entry) {
      entry = {
        date,
        facilityId: row.facility_id,
        facilityName: row.facility_name,
        activityCount: 0,
        byType: {},
      };
      merged.set(key, entry);
    }

    entry.activityCount += row.activity_count;
    if (row.activity_type) {
      const type = row.activity_type as HistogramActivityType;
      entry.byType[type] = (entry.byType[type] ?? 0) + row.activity_count;
    }
  }

  return Array.from(merged.values());
}
const timePeriodLabels: Record<TimePeriod, string> = {
  day: 'Last 24 Hours',
  week: 'Last Week',
  month: 'Last Month',
  year: 'Last Year',
};

const facilityColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-teal-500',
];

interface ActivityStatsResponse {
  success: boolean;
  data: Array<{
    date: string;
    facility_id: string;
    facility_name: string;
    activity_type?: HistogramActivityType;
    activity_count: number;
  }>;
  period: string;
  endDate?: string;
}

export const HistogramWidget: React.FC<HistogramWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  currentSize,
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  facilityFilter,
}) => {
  const { authState } = useAuth();
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const { facilityIdsForApi } = useDashboardFacilityScope(facilityFilter);
  const { size, handleSizeChange } = useWidgetSizeState(currentSize, initialSize, onSizeChange);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [showTimePeriodDropdown, setShowTimePeriodDropdown] = useState(false);
  const [histogramData, setHistogramData] = useState<HistogramData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<HistogramTooltipState | null>(null);
  const [statsAnchorDate, setStatsAnchorDate] = useState<Date>(() => new Date());

  const showBarTooltip = useCallback(
    (dayData: HistogramData[], anchorX: number, anchorY: number) => {
      setTooltip({ dayData, anchorX, anchorY });
    },
    [],
  );

  const hideBarTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  const chartFacilities = useMemo(() => {
    const fromAuth =
      authState.user?.facilityIds?.map((fid, index) => ({
        id: fid,
        name: authState.user?.facilityNames?.[index] || fid,
      })) ?? [];
    const fromData = Array.from(
      new Map(histogramData.map((d) => [d.facilityId, { id: d.facilityId, name: d.facilityName }])).values()
    );

    if (facilityFilter) {
      const match =
        fromAuth.find((f) => f.id === facilityFilter) ??
        fromData.find((f) => f.id === facilityFilter);
      return match ? [match] : fromData.filter((f) => f.id === facilityFilter);
    }
    if (fromAuth.length > 0) return fromAuth.slice(0, MAX_HISTOGRAM_FACILITIES);
    return fromData.slice(0, MAX_HISTOGRAM_FACILITIES);
  }, [authState.user?.facilityIds, authState.user?.facilityNames, histogramData, facilityFilter]);

  const legendFacilities = useMemo(() => chartFacilities.slice(0, MAX_LEGEND_FACILITIES), [chartFacilities]);
  const legendOverflow = Math.max(0, chartFacilities.length - MAX_LEGEND_FACILITIES);
  const showFacilityLegend = !facilityFilter && chartFacilities.length > 1;
  const singleFacilityMode = chartFacilities.length <= 1;

  const facilityColorIndex = useCallback(
    (facilityId: string) => {
      const idx = chartFacilities.findIndex((f) => f.id === facilityId);
      return idx >= 0 ? idx : 0;
    },
    [chartFacilities]
  );

  const loadActivityStats = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const response: ActivityStatsResponse = await apiService.getActivityStats({
        period: timePeriod,
        facility_ids: facilityIdsForApi,
      });
      if (response.success && response.data) {
        setHistogramData(mergeActivityStatsRows(response.data));
        if (response.endDate) {
          setStatsAnchorDate(new Date(response.endDate));
        }
      } else {
        setHistogramData([]);
      }
    } catch (err) {
      console.error('Failed to load activity stats:', err);
      if (!options?.background) {
        setError('Failed to load activity data');
        setHistogramData([]);
      }
    } finally {
      if (!options?.background) {
        setIsLoading(false);
      }
    }
  }, [timePeriod, facilityIdsForApi]);

  const loadActivityStatsRef = useRef(loadActivityStats);
  loadActivityStatsRef.current = loadActivityStats;

  useEffect(() => {
    void loadActivityStats();
  }, [loadActivityStats]);

  useEffect(() => {
    if (!isConnected) return;

    const activityFilters =
      facilityFilter != null && facilityFilter !== ''
        ? { facility_id: facilityFilter }
        : facilityIdsForApi?.length === 1
          ? { facility_id: facilityIdsForApi[0] }
          : undefined;

    const subscriptionId = subscribe(
      'activity',
      () => {
        void loadActivityStatsRef.current({ background: true });
      },
      undefined,
      activityFilters,
    );

    return () => unsubscribe(subscriptionId);
  }, [isConnected, subscribe, unsubscribe, facilityFilter, facilityIdsForApi]);

  const groupedData = useMemo(() => {
    const grouped: Record<string, HistogramData[]> = {};
    const scopeIds = facilityIdsForApi;
    const filteredData = scopeIds?.length
      ? histogramData.filter((item) => scopeIds.includes(item.facilityId))
      : histogramData;

    filteredData.forEach((item) => {
      if (!grouped[item.date]) grouped[item.date] = [];
      grouped[item.date].push(item);
    });
    return grouped;
  }, [histogramData, facilityIdsForApi]);

  const chartEntries = useMemo(
    () => buildHistogramChartEntries(timePeriod, groupedData, statsAnchorDate),
    [groupedData, timePeriod, statsAnchorDate],
  );

  const slotCount = chartEntries.length;
  const chartGridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${slotCount}, minmax(0, 1fr))` }),
    [slotCount],
  );

  const layout = getWidgetLayoutProfile(size);
  const minChartHeightPx = layout.isDock
    ? 88
    : layout.isTall
      ? 200
      : layout.density === 'micro' || layout.density === 'compact'
        ? 120
        : 160;

  const maxValue = useMemo(() => {
    const totals = chartEntries.map(([, dayData]) =>
      dayData.reduce((sum, item) => sum + item.activityCount, 0),
    );
    return Math.max(...totals, 1);
  }, [chartEntries]);

  const getBarHeightPercent = useCallback(
    (value: number): number => {
      if (value <= 0) return 0;
      return Math.max(2, (value / maxValue) * 100);
    },
    [maxValue],
  );

  const getStackHeightPercent = useCallback(
    (dayData: HistogramData[]): number =>
      dayData.reduce((sum, item) => sum + getBarHeightPercent(item.activityCount), 0),
    [getBarHeightPercent],
  );

  const positionBarTooltip = useCallback(
    (dayData: HistogramData[], column: HTMLElement) => {
      const stack = column.querySelector('[data-bar-stack]');
      if (!stack) return;
      const stackRect = stack.getBoundingClientRect();
      const stackHeightPercent = getStackHeightPercent(dayData);
      const stackPixelHeight = (stackHeightPercent / 100) * stackRect.height;
      showBarTooltip(
        dayData,
        stackRect.left + stackRect.width / 2,
        stackRect.bottom - stackPixelHeight,
      );
    },
    [showBarTooltip, getStackHeightPercent],
  );

  return (
    <Widget
      id={id}
      title={title}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={handleSizeChange}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      enhancedMenu={
        <motion.div className="space-y-3">
          <button
            onClick={() => loadActivityStats()}
            disabled={isLoading}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600" />
          <div className="relative">
            <button
              onClick={() => setShowTimePeriodDropdown(!showTimePeriodDropdown)}
              className="flex items-center justify-between w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4" />
                <span>{timePeriodLabels[timePeriod]}</span>
              </div>
              <ChevronDownIcon className="h-4 w-4" />
            </button>
            {showTimePeriodDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50">
                {Object.entries(timePeriodLabels).map(([period, label]) => (
                  <button
                    key={period}
                    onClick={() => {
                      setTimePeriod(period as TimePeriod);
                      setShowTimePeriodDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg ${
                      timePeriod === period
                        ? 'bg-primary-50 dark:bg-primary-900 text-primary-600 dark:text-primary-300'
                        : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      }
    >
      <div className={WIDGET_BODY_CLASS}>
        {isLoading && histogramData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : error ? (
          <motion.div className="flex-1 flex flex-col items-center justify-center text-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          </motion.div>
        ) : Object.keys(groupedData).length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <CalendarIcon className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No activity data for this period</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col">
            <div className="relative flex flex-1 min-h-0 flex-col rounded-lg border border-gray-200/80 bg-gradient-to-b from-gray-50/70 to-white px-2 pb-1.5 pt-2 dark:border-gray-700/80 dark:from-gray-900/35 dark:to-transparent">
              {showFacilityLegend && (
                <div className="absolute right-2 top-1.5 z-10 flex max-w-[72%] flex-wrap items-center justify-end gap-x-2.5 gap-y-0.5 rounded-md border border-gray-200/60 bg-white/85 px-2 py-1 shadow-sm backdrop-blur-sm dark:border-gray-600/60 dark:bg-gray-900/85">
                  {legendFacilities.map((facility, index) => (
                    <div key={facility.id} className="flex items-center gap-1">
                      <div className={`h-2 w-2 rounded-sm ${facilityColors[index % facilityColors.length]}`} />
                      <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[96px]">
                        {facility.name}
                      </span>
                    </div>
                  ))}
                  {legendOverflow > 0 && (
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      +{legendOverflow}
                    </span>
                  )}
                </div>
              )}
              <div
                className="relative grid flex-1 w-full items-end gap-px"
                style={{ ...chartGridStyle, minHeight: minChartHeightPx }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between"
                >
                  {[0, 1, 2, 3].map((line) => (
                    <div
                      key={line}
                      className="border-t border-gray-200/50 dark:border-gray-700/50"
                    />
                  ))}
                </div>

                {chartEntries.map(([date, dayData], index) => {
                  const totalEvents = dayData.reduce((sum, item) => sum + item.activityCount, 0);
                  const hasData = totalEvents > 0;

                  return (
                    <div
                      key={date}
                      className={`relative flex h-full min-w-0 flex-col justify-end ${
                        hasData ? 'hover:z-10 focus-within:z-10' : ''
                      }`}
                      tabIndex={hasData ? 0 : -1}
                      role={hasData ? 'img' : undefined}
                      aria-label={
                        hasData
                          ? `${formatDateLabel(date, timePeriod, true)}: ${totalEvents} events`
                          : undefined
                      }
                      onMouseEnter={
                        hasData
                          ? (e) => positionBarTooltip(dayData, e.currentTarget)
                          : undefined
                      }
                      onMouseLeave={hasData ? hideBarTooltip : undefined}
                      onFocus={
                        hasData
                          ? (e) => positionBarTooltip(dayData, e.currentTarget)
                          : undefined
                      }
                      onBlur={hasData ? hideBarTooltip : undefined}
                    >
                      <div
                        data-bar-stack
                        className="flex h-full w-full flex-col justify-end gap-px px-px"
                      >
                        {hasData ? (
                          dayData.map((item) => (
                            <motion.div
                              key={`${item.facilityId}-${date}`}
                              initial={{ height: 0 }}
                              animate={{ height: `${getBarHeightPercent(item.activityCount)}%` }}
                              transition={{ duration: 0.35, delay: index * 0.015 }}
                              className={`w-full min-h-[2px] ${facilityColors[facilityColorIndex(item.facilityId) % facilityColors.length]} rounded-sm opacity-90 transition-opacity hover:opacity-100`}
                            />
                          ))
                        ) : (
                          <div className="h-0.5 w-full rounded-full bg-gray-200/60 dark:bg-gray-700/60" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {tooltip &&
                createPortal(
                  <div
                    className={`pointer-events-none fixed z-[9999] w-max ${singleFacilityMode ? 'max-w-[220px]' : 'max-w-[min(92vw,640px)]'}`}
                    style={{
                      left: tooltip.anchorX,
                      top: tooltip.anchorY,
                      transform: 'translate(-50%, calc(-100% - 10px))',
                    }}
                    role="tooltip"
                  >
                    <HistogramBarTooltipContent
                      dayData={tooltip.dayData}
                      singleFacilityMode={singleFacilityMode}
                      colorIndex={facilityColorIndex}
                    />
                    <div className="mx-auto mt-[-1px] h-2 w-2 rotate-45 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900" />
                  </div>,
                  document.body,
                )}

              <div
                className="mt-1.5 grid w-full gap-px border-t border-gray-200/60 pt-1 dark:border-gray-700/60"
                style={chartGridStyle}
              >
                {chartEntries.map(([date], index) => (
                  <span
                    key={`label-${date}`}
                    className={`min-w-0 text-center text-[7px] leading-none sm:text-[8px] ${
                      shouldShowHistogramAxisLabel(index, slotCount, timePeriod)
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'text-transparent select-none'
                    }`}
                    title={formatDateLabel(date, timePeriod, true)}
                  >
                    {formatHistogramAxisLabel(date, timePeriod, slotCount)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
};
