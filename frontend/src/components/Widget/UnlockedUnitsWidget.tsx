import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LockOpenIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  UserIcon,
  MapPinIcon,
  LockClosedIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';
import { useUnitsData } from '@/hooks/useUnitsData';

interface UnlockedUnitsWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

// Helper function to calculate duration since unlock
const calculateDuration = (unlockedSince: string): { hours: number; minutes: number; display: string } => {
  if (!unlockedSince) {
    console.warn('⚠️ calculateDuration: unlockedSince is null/undefined');
    return { hours: 0, minutes: 0, display: 'Unknown' };
  }
  
  const now = new Date();
  const unlocked = new Date(unlockedSince);
  
  // Check if the date is valid
  if (isNaN(unlocked.getTime())) {
    console.warn('⚠️ calculateDuration: Invalid date string:', unlockedSince);
    return { hours: 0, minutes: 0, display: 'Invalid date' };
  }
  
  const diffMs = now.getTime() - unlocked.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  
  let display = '';
  if (diffMinutes < 60) {
    display = `${diffMinutes}m`;
  } else if (diffHours < 24) {
    display = `${diffHours}h ${diffMinutes % 60}m`;
  } else {
    const days = Math.floor(diffHours / 24);
    display = `${days}d ${diffHours % 24}h`;
  }
  
  return { hours: diffHours, minutes: diffMinutes, display };
};

export const UnlockedUnitsWidget: React.FC<UnlockedUnitsWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  availableSizes = ['small', 'medium', 'medium-tall', 'large', 'large-wide', 'huge'],
  onGridSizeChange,
  onRemove
}) => {
  const navigate = useNavigate();
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [filter, setFilter] = useState<'all' | 'long_unlocked' | 'recent_unlocked'>('all');
  
  const { data: unitsData, loading, error, refetch } = useUnitsData();


  // Filter units based on duration
  const filteredUnits = unitsData?.unlockedUnits?.filter(unit => {
    if (filter === 'all') return true;
    
    const duration = calculateDuration(unit.unlocked_since);
    
    if (filter === 'long_unlocked') {
      return duration.hours >= 2; // 2+ hours
    }
    
    if (filter === 'recent_unlocked') {
      return duration.hours < 2; // Less than 2 hours
    }
    
    return true;
  }) || [];

  const handleUnitClick = async (unitId: string) => {
    navigate(`/units/${unitId}`);
  };


  const displayedUnits = filteredUnits; // Show all unlocked units, no artificial limit
  const longUnlockedCount = filteredUnits.filter(u => {
    const duration = calculateDuration(u.unlocked_since);
    return duration.hours >= 2;
  }).length;

  const getDurationColor = (unlockedSince: string) => {
    const duration = calculateDuration(unlockedSince);
    
    if (duration.hours >= 6) {
      return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    } else if (duration.hours >= 2) {
      return 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
    } else {
      return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  // Group units by facility
  const groupUnitsByFacility = (units: any[]) => {
    const groups = units.reduce((acc, unit) => {
      const facilityName = unit.facility_name || 'Unknown Facility';
      if (!acc[facilityName]) {
        acc[facilityName] = [];
      }
      acc[facilityName].push(unit);
      return acc;
    }, {} as Record<string, any[]>);

    return Object.entries(groups).map(([facilityName, facilityUnits]) => ({
      facilityName,
      units: facilityUnits as any[]
    }));
  };

  const groupedUnits = groupUnitsByFacility(displayedUnits);
  const hasMultipleFacilities = groupedUnits.length > 1;



  return (
    <Widget
      id={id}
      title={`${title} ${displayedUnits.length > 0 ? `(${displayedUnits.length})` : ''}`}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      enhancedMenu={
        <div className="space-y-1">
          <button
            onClick={refetch}
            disabled={loading}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
          {[
            { key: 'all', label: 'All Unlocked' },
            { key: 'long_unlocked', label: 'Long Unlocked (2h+)' },
            { key: 'recent_unlocked', label: 'Recent (< 2h)' }
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as any)}
              className={`w-full px-3 py-2 text-left text-sm rounded ${
                filter === key 
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' 
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col">
        {/* Error Display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
          </div>
        )}

        {/* Alert Summary */}
        {displayedUnits.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
            <div className="flex items-center space-x-2">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {displayedUnits.length} unit{displayedUnits.length !== 1 ? 's' : ''} unlocked
                </p>
                {longUnlockedCount > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {longUnlockedCount} unlocked for 2+ hours
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Units List - Hide for small widgets */}
        {size !== 'small' && (
          <div className="space-y-2">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center space-x-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : displayedUnits.length > 0 ? (
            <div className="space-y-4">
              {groupedUnits.map((group, groupIndex) => (
                <div key={group.facilityName} className="space-y-2">
                  {/* Facility Header */}
                  {hasMultipleFacilities && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-3 py-2 -mx-2">
                      <div className="flex items-center space-x-2">
                        <MapPinIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {group.facilityName}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          ({group.units.length} unit{group.units.length !== 1 ? 's' : ''})
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Units in this facility */}
                  <div className="space-y-2">
                    {group.units.map((unit: any, unitIndex: number) => {
                      const duration = calculateDuration(unit.unlocked_since);
                      const globalIndex = groupIndex * 10 + unitIndex; // Ensure unique animation delays
                      return (
                        <motion.div
                          key={`${group.facilityName}-${unit.id}-${unitIndex}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: globalIndex * 0.05, duration: 0.3 }}
                          className={`border rounded-lg p-3 transition-all group hover:shadow-sm ${getDurationColor(unit.unlocked_since)}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <LockOpenIcon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <button
                                    onClick={() => handleUnitClick(unit.id)}
                                    className="text-sm font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer text-left"
                                  >
                                    Unit {unit.unit_number}
                                  </button>
                                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                    duration.hours >= 6 ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                                    duration.hours >= 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' :
                                    'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                  }`}>
                                    {duration.hours >= 6 ? 'LONG' : duration.hours >= 2 ? 'MEDIUM' : 'RECENT'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center space-x-2 mt-1 text-xs text-gray-600 dark:text-gray-400">
                                  <UserIcon className="h-3 w-3" />
                                  <span>{unit.tenant_name}</span>
                                </div>
                                
                                <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  <ClockIcon className="h-3 w-3" />
                                  <span>Unlocked for {duration.display}</span>
                                </div>
                                
                                {/* Only show facility name if not grouped */}
                                {!hasMultipleFacilities && (
                                  <div className="flex items-center space-x-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    <MapPinIcon className="h-3 w-3" />
                                    <span>{unit.facility_name}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <LockClosedIcon className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm text-green-600 dark:text-green-400 font-medium">All units secured</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                No unlocked units detected
              </p>
            </div>
          )}
          </div>
        )}

        {/* Compact view for small widgets */}
        {size === 'small' && (
          <div className="h-full flex flex-col">
            {displayedUnits.length > 0 ? (
              <>
                {/* Status Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-1.5">
                    <ExclamationTriangleIcon className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                      {displayedUnits.length} Unlocked
                    </span>
                  </div>
                  <button
                    onClick={refetch}
                    disabled={loading}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded"
                    title="Refresh"
                  >
                    <ArrowPathIcon className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {/* Duration Summary - More compact */}
                <div className="flex items-center justify-between mb-3 px-1">
                  {longUnlockedCount > 0 && (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                        {longUnlockedCount} Long
                      </span>
                    </div>
                  )}
                  {(displayedUnits.length - longUnlockedCount) > 0 && (
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                        {displayedUnits.length - longUnlockedCount} Recent
                      </span>
                    </div>
                  )}
                </div>

                {/* Most Critical Units - Refined layout with grouping */}
                <div className="flex-1 space-y-1.5 overflow-y-auto">
                  {groupedUnits.slice(0, hasMultipleFacilities ? 2 : 1).map((group, groupIndex) => (
                    <div key={group.facilityName} className="space-y-1.5">
                      {/* Facility Header for small mode */}
                      {hasMultipleFacilities && (
                        <div className="px-1 py-1 border-b border-gray-200 dark:border-gray-700">
                          <div className="flex items-center space-x-1.5">
                            <MapPinIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 truncate">
                              {group.facilityName}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Units in this facility */}
                      {group.units.slice(0, hasMultipleFacilities ? 1 : 2).map((unit: any, unitIndex: number) => {
                        const duration = calculateDuration(unit.unlocked_since);
                        const globalIndex = groupIndex * 1000 + unitIndex;
                        return (
                          <motion.div
                            key={`${group.facilityName}-${unit.id}-${unitIndex}-small`}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: globalIndex * 0.1, duration: 0.2 }}
                            className={`p-2.5 rounded-lg border ${getDurationColor(unit.unlocked_since)} group cursor-pointer hover:shadow-md transition-all duration-200`}
                            onClick={() => handleUnitClick(unit.id)}
                            title={`Click to view Unit ${unit.unit_number} details`}
                          >
                            <div className="flex items-center space-x-2">
                              <LockOpenIcon className="h-3.5 w-3.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <button className="text-xs font-semibold truncate text-left hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
                                    Unit {unit.unit_number}
                                  </button>
                                  <span className="text-xs font-bold ml-2 px-1.5 py-0.5 rounded bg-white/50 dark:bg-black/20">
                                    {duration.display}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                  {unit.tenant_name}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  ))}
                  
                  {/* Show more indicator */}
                  {displayedUnits.length > 2 && (
                    <div className="text-center py-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        +{displayedUnits.length - 2} more units
                      </span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-4">
                <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-2">
                  <LockOpenIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 font-semibold">
                  All Secured
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  No unlocked units
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Widget>
  );
};
