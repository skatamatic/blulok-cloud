import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';
import { 
  CalendarIcon, 
  BuildingStorefrontIcon,
  ChevronDownIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useAuth } from '@/contexts/AuthContext';

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
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

type TimePeriod = 'day' | 'week' | 'month' | 'year';

const timePeriodLabels: Record<TimePeriod, string> = {
  day: 'Last 24 Hours',
  week: 'Last Week', 
  month: 'Last Month',
  year: 'Last Year'
};

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
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onGridSizeChange,
  onRemove,
}) => {
  const { authState } = useAuth();
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [userFacilities, setUserFacilities] = useState<{ id: string; name: string }[]>([]);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const [showTimePeriodDropdown, setShowTimePeriodDropdown] = useState(false);
  const [histogramData, setHistogramData] = useState<HistogramData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const facilitiesInitializedRef = useRef(false);

  // Load user facilities from auth state
  useEffect(() => {
    // Only initialize once - don't re-run if already initialized
    if (facilitiesInitializedRef.current) return;
    
    if (authState.user?.facilityIds && authState.user.facilityIds.length > 0) {
      const facilityNames = authState.user.facilityNames || [];
      const facilities = authState.user.facilityIds.map((id: string, index: number) => ({
        id,
        name: facilityNames[index] || id
      }));
      const newSelected = facilities.slice(0, 3).map((f: { id: string; name: string }) => f.id);
      // Only set if different to avoid unnecessary re-renders
      setUserFacilities(prev => {
        const prevIds = prev.map((f: { id: string; name: string }) => f.id).sort().join(',');
        const newIds = facilities.map((f: { id: string; name: string }) => f.id).sort().join(',');
        return prevIds === newIds ? prev : facilities;
      });
      setSelectedFacilities(prev => {
        const prevStr = prev.sort().join(',');
        const newStr = newSelected.sort().join(',');
        return prevStr === newStr ? prev : newSelected;
      });
      facilitiesInitializedRef.current = true;
    } else {
      // For admins without specific facilities, we'll fetch from API data
      setUserFacilities([]);
      setSelectedFacilities([]);
      facilitiesInitializedRef.current = false;
    }
  }, [authState.user]);

  const loadActivityStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response: ActivityStatsResponse = await apiService.getActivityStats({
        period: timePeriod,
        facility_ids: selectedFacilities.length > 0 ? selectedFacilities : undefined,
      });

      if (response.success && response.data) {
        // Transform API response to histogram data format
        const transformed = response.data.map(item => ({
          date: item.date,
          facilityId: item.facility_id,
          facilityName: item.facility_name,
          activityCount: item.activity_count
        }));
        setHistogramData(transformed);
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
  }, [timePeriod, selectedFacilities]);

  useEffect(() => {
    loadActivityStats();
  }, [loadActivityStats]);

  // Extract facilities from data if none are set (for admins viewing all facilities)
  // Only do this once on initial load when we have no facilities from auth
  useEffect(() => {
    if (!facilitiesInitializedRef.current && histogramData.length > 0 && userFacilities.length === 0 && selectedFacilities.length === 0) {
      const uniqueFacilities = Array.from(
        new Map(
          histogramData.map(d => [d.facilityId, { id: d.facilityId, name: d.facilityName }])
        ).values()
      );
      if (uniqueFacilities.length > 0) {
        const newSelected = uniqueFacilities.slice(0, 3).map((f: { id: string; name: string }) => f.id);
        // Only set if different to avoid loops
        setUserFacilities(uniqueFacilities);
        setSelectedFacilities(prev => {
          const prevStr = [...prev].sort().join(',');
          const newStr = [...newSelected].sort().join(',');
          return prevStr === newStr ? prev : newSelected;
        });
        facilitiesInitializedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histogramData]);

  // Group data by date for stacked bars
  const groupedData = useMemo(() => {
    const grouped: Record<string, HistogramData[]> = {};
    const filteredData = histogramData.filter(item => 
      selectedFacilities.length === 0 || selectedFacilities.includes(item.facilityId)
    );
    
    filteredData.forEach(item => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }
      grouped[item.date].push(item);
    });
    return grouped;
  }, [histogramData, selectedFacilities]);

  const maxValue = useMemo(() => {
    const totals = Object.values(groupedData).map(dayData => 
      dayData.reduce((sum, item) => sum + item.activityCount, 0)
    );
    return Math.max(...totals, 1); // Ensure at least 1 to avoid division by zero
  }, [groupedData]);

  const facilityColors = [
    'bg-blue-500',
    'bg-green-500', 
    'bg-purple-500',
    'bg-orange-500',
    'bg-pink-500'
  ];

  const handleFacilityToggle = (facilityId: string) => {
    setSelectedFacilities(prev => {
      if (prev.includes(facilityId)) {
        return prev.filter(id => id !== facilityId);
      } else if (prev.length < 3) {
        return [...prev, facilityId];
      }
      return prev;
    });
  };

  const getBarHeight = (value: number): string => {
    if (maxValue === 0) return '0%';
    return `${(value / maxValue) * 100}%`;
  };

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

  const handleRefresh = async () => {
    await loadActivityStats();
  };

  const isCompactSize = size === 'tiny' || size === 'small' || size === 'medium';
  const chartHeight = isCompactSize ? 'h-32' : 'h-48';

  return (
    <Widget 
      id={id} 
      title={title} 
      size={size}
      availableSizes={availableSizes}
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      className="group"
      enhancedMenu={
        <div className="space-y-3">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <div className="border-t border-gray-200 dark:border-gray-600"></div>
          
          {/* Time Period Selector */}
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
                      timePeriod === period ? 'bg-primary-50 dark:bg-primary-900 text-primary-600 dark:text-primary-300' : ''
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Facility Selector */}
          {userFacilities.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowFacilityDropdown(!showFacilityDropdown)}
                className="flex items-center justify-between w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <BuildingStorefrontIcon className="h-4 w-4" />
                  <span>{selectedFacilities.length} of {userFacilities.length} facilities</span>
                </div>
                <ChevronDownIcon className="h-4 w-4" />
              </button>
              
              {showFacilityDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                  {userFacilities.map((facility, index) => {
                    const isSelected = selectedFacilities.includes(facility.id);
                    const isDisabled = !isSelected && selectedFacilities.length >= 3;
                    
                    return (
                      <button
                        key={facility.id}
                        onClick={() => !isDisabled && handleFacilityToggle(facility.id)}
                        disabled={isDisabled}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg flex items-center space-x-2 ${
                          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                        } ${isSelected ? 'bg-primary-50 dark:bg-primary-900' : ''}`}
                      >
                        <div className={`h-3 w-3 rounded-full ${facilityColors[index % facilityColors.length]}`} />
                        <span className="flex-1">{facility.name}</span>
                        {isSelected && <span className="text-primary-600 dark:text-primary-300">✓</span>}
                      </button>
                    );
                  })}
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600">
                    Select up to 3 facilities
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      }
    >
      <div className="h-full flex flex-col">
        {/* Loading State */}
        {isLoading && histogramData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <ArrowPathIcon className="h-8 w-8 text-gray-400 mx-auto mb-2 animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading activity data...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              Try again
            </button>
          </div>
        ) : Object.keys(groupedData).length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <CalendarIcon className="h-8 w-8 text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No activity data for this period</p>
          </div>
        ) : (
          <>
            {/* Chart Area */}
            <div className={`flex-1 ${chartHeight} relative`}>
              <div className="absolute inset-0 flex items-end justify-between px-1 pb-6">
                {Object.entries(groupedData).slice(-20).map(([date, dayData], index) => {
                  return (
                    <div key={date} className="flex flex-col items-center flex-1 max-w-8">
                      <div className="flex flex-col-reverse items-center w-full space-y-reverse space-y-0.5 mb-1">
                        {dayData.map((item) => {
                          const facilityColorIndex = selectedFacilities.indexOf(item.facilityId);
                          const colorIndex = facilityColorIndex >= 0 ? facilityColorIndex : 
                            userFacilities.findIndex(f => f.id === item.facilityId);
                          return (
                            <motion.div
                              key={`${item.facilityId}-${date}`}
                              initial={{ height: 0 }}
                              animate={{ height: getBarHeight(item.activityCount) }}
                              transition={{ duration: 0.5, delay: index * 0.05 }}
                              className={`w-full ${facilityColors[colorIndex % facilityColors.length]} rounded-sm opacity-80`}
                              title={`${item.facilityName}: ${item.activityCount} activities`}
                            />
                          );
                        })}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400 transform rotate-45 origin-left whitespace-nowrap">
                        {formatDateLabel(date)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Legend */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex flex-wrap gap-2">
                {(selectedFacilities.length > 0 ? selectedFacilities : userFacilities.slice(0, 3).map(f => f.id)).map((facilityId, index) => {
                  const facility = userFacilities.find(f => f.id === facilityId);
                  if (!facility) return null;
                  
                  return (
                    <div key={facilityId} className="flex items-center space-x-1">
                      <div className={`h-3 w-3 rounded-sm ${facilityColors[index % facilityColors.length]}`} />
                      <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                        {facility.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </Widget>
  );
};
