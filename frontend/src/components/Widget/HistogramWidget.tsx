import React, { useState, useMemo } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';
import { 
  CalendarIcon, 
  BuildingStorefrontIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';

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
  userFacilities?: { id: string; name: string }[];
}

type TimePeriod = 'day' | 'week' | 'month' | 'year';

const timePeriodLabels: Record<TimePeriod, string> = {
  day: 'Last 24 Hours',
  week: 'Last Week', 
  month: 'Last Month',
  year: 'Last Year'
};

export const HistogramWidget: React.FC<HistogramWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onGridSizeChange,
  onRemove,
  userFacilities = [
    { id: '1', name: 'Downtown Storage' },
    { id: '2', name: 'Warehouse District' },
    { id: '3', name: 'Airport Facility' },
    { id: '4', name: 'Industrial Park' },
    { id: '5', name: 'Suburban Center' }
  ]
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('month');
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>(['1', '2', '3']);
  const [showFacilityDropdown, setShowFacilityDropdown] = useState(false);
  const [showTimePeriodDropdown, setShowTimePeriodDropdown] = useState(false);

  // Generate mock data based on time period and facilities
  const histogramData = useMemo(() => {
    const data: HistogramData[] = [];
    const now = new Date();
    let days = 30;
    let interval = 1;

    switch (timePeriod) {
      case 'day':
        days = 1;
        interval = 1/24; // hourly
        break;
      case 'week':
        days = 7;
        interval = 1;
        break;
      case 'month':
        days = 30;
        interval = 1;
        break;
      case 'year':
        days = 365;
        interval = 7; // weekly
        break;
    }

    const selectedFacilityData = userFacilities.filter(f => selectedFacilities.includes(f.id));

    for (let i = days; i >= 0; i -= interval) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      selectedFacilityData.forEach(facility => {
        data.push({
          date: date.toISOString().split('T')[0],
          facilityId: facility.id,
          facilityName: facility.name,
          activityCount: Math.floor(Math.random() * 50) + 10
        });
      });
    }

    return data;
  }, [timePeriod, selectedFacilities, userFacilities]);

  // Group data by date for stacked bars
  const groupedData = useMemo(() => {
    const grouped: Record<string, HistogramData[]> = {};
    histogramData.forEach(item => {
      if (!grouped[item.date]) {
        grouped[item.date] = [];
      }
      grouped[item.date].push(item);
    });
    return grouped;
  }, [histogramData]);

  const maxValue = useMemo(() => {
    return Math.max(...Object.values(groupedData).map(dayData => 
      dayData.reduce((sum, item) => sum + item.activityCount, 0)
    ));
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
        </div>
      }
    >
      <div className="h-full flex flex-col">
        {/* Chart Area */}
        <div className={`flex-1 ${chartHeight} relative`}>
          <div className="absolute inset-0 flex items-end justify-between px-1 pb-6">
            {Object.entries(groupedData).slice(-20).map(([date, dayData], index) => {
              
              return (
                <div key={date} className="flex flex-col items-center flex-1 max-w-8">
                  <div className="flex flex-col-reverse items-center w-full space-y-reverse space-y-0.5 mb-1">
                    {dayData.map((item, _facilityIndex) => {
                      const facilityColorIndex = selectedFacilities.indexOf(item.facilityId);
                      return (
                        <motion.div
                          key={`${item.facilityId}-${date}`}
                          initial={{ height: 0 }}
                          animate={{ height: getBarHeight(item.activityCount) }}
                          transition={{ duration: 0.5, delay: index * 0.05 }}
                          className={`w-full ${facilityColors[facilityColorIndex % facilityColors.length]} rounded-sm opacity-80`}
                          title={`${item.facilityName}: ${item.activityCount} activities`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 transform rotate-45 origin-left">
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
            {selectedFacilities.map((facilityId, index) => {
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
      </div>
    </Widget>
  );
};
