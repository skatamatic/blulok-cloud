import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { 
  BoltIcon,
  ExclamationTriangleIcon,
  BoltSlashIcon,
  ArrowPathIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { Unit } from '@/types/units.types';

interface BatteryStatusWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
}

interface BatteryData {
  lowBatteryUnits: Unit[];
  totalUnits: number;
  criticalBatteryUnits: number;
  lowBatteryCount: number;
  offlineUnits: number;
  onlineUnits: number;
  lastUpdated: string;
}

export const BatteryStatusWidget: React.FC<BatteryStatusWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
}) => {
  const { authState } = useAuth();
  const { subscribe, unsubscribe } = useWebSocket();
  const [batteryData, setBatteryData] = useState<BatteryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'critical' | 'low' | 'offline'>('critical');
  const availableSizes: WidgetSize[] = ['small', 'medium', 'medium-tall', 'large'];

  useEffect(() => {
    if (!authState.user) return;

    const handleBatteryData = (data: BatteryData) => {
      setBatteryData(data);
      setLoading(false);
      setError(null);
    };

    const handleError = (error: string) => {
      setError(error);
      setLoading(false);
    };

    // Subscribe to battery status updates
    const subscriptionId = subscribe('battery_status', handleBatteryData, handleError);

    return () => {
      if (subscriptionId) {
        unsubscribe(subscriptionId);
      }
    };
  }, [authState.user, subscribe, unsubscribe]);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 3;
      case 'medium': return 5;
      case 'medium-tall': return 8;
      case 'large': return 10;
      default: return 5;
    }
  };

  const formatLastSeen = (dateString: string | undefined): string => {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const getBatteryColor = (level: number | undefined): string => {
    if (!level) return 'text-gray-500';
    if (level <= 5) return 'text-red-600 dark:text-red-400';
    if (level <= 20) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getBatteryIcon = (level: number | undefined, isOnline: boolean): React.ReactNode => {
    if (!isOnline) return <BoltSlashIcon className="h-4 w-4" />;
    if (!level) return <BoltIcon className="h-4 w-4" />;
    if (level <= 5) return <ExclamationTriangleIcon className="h-4 w-4" />;
    return <BoltIcon className="h-4 w-4" />;
  };

  const getBatteryStatus = (unit: Unit): 'critical' | 'low' | 'offline' | 'good' => {
    if (!unit.is_online) return 'offline';
    const batteryLevel = unit.battery_level || 0;
    if (batteryLevel <= 5) return 'critical';
    if (batteryLevel <= 20) return 'low';
    return 'good';
  };

  const filteredUnits = batteryData?.lowBatteryUnits.filter(unit => {
    const status = getBatteryStatus(unit);
    switch (filter) {
      case 'critical':
        return status === 'critical';
      case 'low':
        return status === 'low';
      case 'offline':
        return status === 'offline';
      default:
        return status === 'critical' || status === 'low' || status === 'offline';
    }
  }) || [];

  const maxItems = getMaxItems(currentSize);
  const displayUnits = filteredUnits.slice(0, maxItems);

  const criticalCount = batteryData?.criticalBatteryUnits || 0;
  const lowCount = batteryData?.lowBatteryCount || 0;
  const offlineCount = batteryData?.offlineUnits || 0;

  if (loading) {
    return (
      <Widget
        id="battery-status-widget-loading"
        title="Battery Status"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500 dark:text-gray-400">Loading...</div>
        </div>
      </Widget>
    );
  }

  if (error) {
    return (
      <Widget
        id="battery-status-widget-error"
        title="Battery Status"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500 text-center">
            <ExclamationTriangleIcon className="h-8 w-8 mx-auto mb-2" />
            <div className="text-sm">{error}</div>
          </div>
        </div>
      </Widget>
    );
  }

  return (
    <Widget
      id="battery-status-widget"
      title="Battery Status"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
      enhancedMenu={
        <div className="space-y-1">
          <button
            onClick={() => setIsRefreshing(true)}
            disabled={isRefreshing}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
          {[
            { key: 'all', label: 'All Issues' },
            { key: 'critical', label: 'Critical (≤5%)' },
            { key: 'low', label: 'Low (≤20%)' },
            { key: 'offline', label: 'Offline' }
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
      <div className="h-full flex flex-col">
        {/* Summary Stats */}
        <div className={`grid grid-cols-3 ${currentSize === 'small' ? 'gap-1 mb-2' : 'gap-2 mb-4'}`}>
          <div className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-red-50 dark:bg-red-900/20 rounded-lg`}>
            <div className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-red-600 dark:text-red-400`}>{criticalCount}</div>
            <div className="text-xs text-red-600 dark:text-red-400">Critical</div>
          </div>
          <div className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-yellow-50 dark:bg-yellow-900/20 rounded-lg`}>
            <div className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-yellow-600 dark:text-yellow-400`}>{lowCount}</div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">Low</div>
          </div>
          <div className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-gray-50 dark:bg-gray-700/50 rounded-lg`}>
            <div className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-gray-600 dark:text-gray-400`}>{offlineCount}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Offline</div>
          </div>
        </div>

        {/* Unit List */}
        <div className={`flex-1 ${currentSize === 'small' ? 'space-y-1 overflow-hidden' : 'space-y-2 overflow-y-auto'}`}>
          {displayUnits.length > 0 ? (
            displayUnits.map((unit) => {
              const batteryLevel = unit.battery_level || 0;
              const isOnline = unit.is_online || false;
              const status = getBatteryStatus(unit);
              
              return (
                <div
                  key={unit.id}
                  className={`flex items-center ${currentSize === 'small' ? 'space-x-2 p-1' : 'space-x-3 p-2'} ${currentSize === 'small' ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} rounded-lg transition-colors group`}
                >
                  <div className={`${currentSize === 'small' ? 'p-1' : 'p-2'} rounded-lg ${
                    status === 'offline' ? 'bg-gray-100 dark:bg-gray-700' :
                    status === 'critical' ? 'bg-red-100 dark:bg-red-900/20' :
                    status === 'low' ? 'bg-yellow-100 dark:bg-yellow-900/20' :
                    'bg-green-100 dark:bg-green-900/20'
                  } flex-shrink-0`}>
                    <div className={getBatteryColor(batteryLevel)}>
                      {getBatteryIcon(batteryLevel, isOnline)}
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`${currentSize === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-900 dark:text-white truncate`}>
                        {currentSize === 'small' ? unit.unit_number : `Unit ${unit.unit_number}`}
                      </p>
                      <span className={`${currentSize === 'small' ? 'text-xs' : 'text-sm'} font-bold ${getBatteryColor(batteryLevel)}`}>
                        {!isOnline ? 'Off' : `${batteryLevel}%`}
                      </span>
                    </div>
                    
                    {currentSize !== 'small' && (
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {(unit as any).facility_name || 'Unknown Facility'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          • {formatLastSeen(unit.last_seen)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action button for larger widgets */}
                  {(currentSize === 'large' || currentSize === 'medium-tall') && (
                    <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                      <EyeIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <BoltIcon className="h-8 w-8 text-green-500 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {filter === 'critical' ? 'No critical battery alerts' :
                 filter === 'low' ? 'No low battery devices' :
                 filter === 'offline' ? 'No offline devices' :
                 'All devices have good battery levels'}
              </p>
            </div>
          )}
        </div>

        {/* Footer with refresh for smaller widgets */}
        {currentSize === 'small' && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <button
              onClick={() => setIsRefreshing(true)}
              disabled={isRefreshing}
              className="w-full flex items-center justify-center space-x-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        )}

        {/* Last updated timestamp */}
        {batteryData?.lastUpdated && currentSize !== 'small' && (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            Updated {formatLastSeen(batteryData.lastUpdated)}
          </div>
        )}
      </div>
    </Widget>
  );
};