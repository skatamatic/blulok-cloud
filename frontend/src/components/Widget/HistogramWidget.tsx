import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import { getWidgetLayoutProfile, WIDGET_BODY_CLASS } from '@/utils/widget-layout.utils';

interface HistogramData {
  date: string;
  facilityId: string;
  facilityName: string;
  activityCount: number;
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

function HistogramBarTooltip({
  date,
  dayData,
  timePeriod,
  colorIndex,
}: {
  date: string;
  dayData: HistogramData[];
  timePeriod: TimePeriod;
  colorIndex: (facilityId: string) => number;
}) {
  const total = dayData.reduce((sum, item) => sum + item.activityCount, 0);
  const rows = [...dayData].sort((a, b) => b.activityCount - a.activityCount);

  return (
    <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 w-max max-w-[240px] -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left shadow-lg ring-1 ring-black/5 dark:border-gray-600 dark:bg-gray-900 dark:ring-white/10">
        <p className="text-xs font-semibold text-gray-900 dark:text-white">
          {formatDateLabel(date, timePeriod, true)}
        </p>
        <ul className="mt-2 space-y-1.5">
          {rows.map((item) => (
            <li key={item.facilityId} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-sm ${facilityColors[colorIndex(item.facilityId) % facilityColors.length]}`}
                />
                <span className="truncate text-gray-600 dark:text-gray-300">{item.facilityName}</span>
              </span>
              <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-white">
                {item.activityCount}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
          <span className="text-gray-500 dark:text-gray-400">Total events</span>
          <span className="font-semibold tabular-nums text-gray-900 dark:text-white">{total}</span>
        </div>
      </div>
      <div className="mx-auto h-2 w-2 rotate-45 border-b border-r border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-900" />
    </div>
  );
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
    activity_count: number;
  }>;
  period: string;
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
  const { facilityIdsForApi } = useDashboardFacilityScope(facilityFilter);
  const { size, handleSizeChange } = useWidgetSizeState(currentSize, initialSize, onSizeChange);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [showTimePeriodDropdown, setShowTimePeriodDropdown] = useState(false);
  const [histogramData, setHistogramData] = useState<HistogramData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const facilityColorIndex = useCallback(
    (facilityId: string) => {
      const idx = chartFacilities.findIndex((f) => f.id === facilityId);
      return idx >= 0 ? idx : 0;
    },
    [chartFacilities]
  );

  const loadActivityStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response: ActivityStatsResponse = await apiService.getActivityStats({
        period: timePeriod,
        facility_ids: facilityIdsForApi,
      });
      if (response.success && response.data) {
        setHistogramData(
          response.data.map((item) => ({
            date: normalizeHistogramDateKey(item.date),
            facilityId: item.facility_id,
            facilityName: item.facility_name,
            activityCount: item.activity_count,
          }))
        );
      } else {
        setHistogramData([]);
      }
    } catch (err) {
      console.error('Failed to load activity stats:', err);
      setError('Failed to load activity data');
      setHistogramData([]);
    } finally {
      setIsLoading(false);
    }
  }, [timePeriod, facilityIdsForApi]);

  useEffect(() => {
    loadActivityStats();
  }, [loadActivityStats]);

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

  const maxValue = useMemo(() => {
    const totals = Object.values(groupedData).map((dayData) =>
      dayData.reduce((sum, item) => sum + item.activityCount, 0)
    );
    return Math.max(...totals, 1);
  }, [groupedData]);

  const chartEntries = useMemo(
    () => Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).slice(-20),
    [groupedData],
  );

  const layout = getWidgetLayoutProfile(size);
  const barAreaHeightPx = layout.isDock
    ? 96
    : layout.isTall
      ? 220
      : layout.density === 'micro' || layout.density === 'compact'
        ? 128
        : 176;

  const getBarHeightPx = (value: number): number => {
    if (value <= 0) return 0;
    return Math.max(3, Math.round((value / maxValue) * barAreaHeightPx));
  };

  const chartAreaClass = layout.isDock
    ? 'h-24 flex-shrink-0'
    : layout.isTall
      ? 'flex-1 min-h-0'
      : layout.density === 'micro' || layout.density === 'compact'
        ? 'h-32 flex-shrink-0'
        : 'h-48 flex-shrink-0';

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
      className="group"
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
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 shrink-0">
              Lock, unlock, and access activity by facility
            </p>
            <div className={`${chartAreaClass} flex min-h-0 flex-col`}>
              <div
                className="relative flex flex-1 items-end gap-0.5 border-b border-gray-200/80 px-1 dark:border-gray-700/80"
                style={{ minHeight: barAreaHeightPx }}
              >
                {chartEntries.map(([date, dayData], index) => {
                  const totalEvents = dayData.reduce((sum, item) => sum + item.activityCount, 0);
                  return (
                    <div
                      key={date}
                      className="group relative flex h-full min-w-0 max-w-10 flex-1 flex-col items-center justify-end hover:z-10 focus-within:z-10"
                      tabIndex={0}
                      role="img"
                      aria-label={`${formatDateLabel(date, timePeriod, true)}: ${totalEvents} events`}
                    >
                      <HistogramBarTooltip
                        date={date}
                        dayData={dayData}
                        timePeriod={timePeriod}
                        colorIndex={facilityColorIndex}
                      />
                      <div
                        className="flex w-full flex-col justify-end gap-px"
                        style={{ height: barAreaHeightPx }}
                      >
                        {dayData.map((item) => (
                          <motion.div
                            key={`${item.facilityId}-${date}`}
                            initial={{ height: 0 }}
                            animate={{ height: getBarHeightPx(item.activityCount) }}
                            transition={{ duration: 0.4, delay: index * 0.03 }}
                            className={`w-full ${facilityColors[facilityColorIndex(item.facilityId) % facilityColors.length]} rounded-sm opacity-90 transition-opacity group-hover:opacity-100`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-1.5 flex shrink-0 gap-0.5 px-1">
                {chartEntries.map(([date]) => (
                  <span
                    key={`label-${date}`}
                    className="min-w-0 max-w-10 flex-1 truncate text-center text-[10px] leading-tight text-gray-500 dark:text-gray-400 sm:text-[11px]"
                    title={formatDateLabel(date, timePeriod, true)}
                  >
                    {formatDateLabel(date, timePeriod)}
                  </span>
                ))}
              </div>
            </div>
            {showFacilityLegend && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600 shrink-0">
              <div className="flex flex-wrap gap-2 max-h-16 overflow-y-auto">
                {legendFacilities.map((facility, index) => (
                  <div key={facility.id} className="flex items-center space-x-1">
                    <div className={`h-3 w-3 rounded-sm ${facilityColors[index % facilityColors.length]}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[120px]">
                      {facility.name}
                    </span>
                  </div>
                ))}
                {legendOverflow > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 self-center">
                    +{legendOverflow} more
                  </span>
                )}
              </div>
            </div>
            )}
          </>
        )}
      </div>
    </Widget>
  );
};
