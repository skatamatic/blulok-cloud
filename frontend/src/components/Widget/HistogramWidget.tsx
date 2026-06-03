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
            date: item.date,
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

  const getBarHeight = (value: number): string => `${(value / maxValue) * 100}%`;

  const formatDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    switch (timePeriod) {
      case 'day':
        return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
      case 'week':
      case 'month':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'year':
        return date.toLocaleDateString('en-US', { month: 'short' });
      default:
        return dateStr;
    }
  };

  const layout = getWidgetLayoutProfile(size);
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
            <div className={`${chartAreaClass} relative`}>
              <div className="absolute inset-0 flex items-end justify-between px-1 pb-6">
                {Object.entries(groupedData)
                  .slice(-20)
                  .map(([date, dayData], index) => (
                    <div key={date} className="flex flex-col items-center flex-1 max-w-8">
                      <motion.div className="flex flex-col-reverse items-center w-full space-y-reverse space-y-0.5 mb-1">
                        {dayData.map((item) => (
                          <motion.div
                            key={`${item.facilityId}-${date}`}
                            initial={{ height: 0 }}
                            animate={{ height: getBarHeight(item.activityCount) }}
                            transition={{ duration: 0.5, delay: index * 0.05 }}
                            className={`w-full ${facilityColors[facilityColorIndex(item.facilityId) % facilityColors.length]} rounded-sm opacity-80`}
                            title={`${item.facilityName}: ${item.activityCount} events`}
                          />
                        ))}
                      </motion.div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 transform rotate-45 origin-left whitespace-nowrap">
                        {formatDateLabel(date)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
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
          </>
        )}
      </div>
    </Widget>
  );
};
