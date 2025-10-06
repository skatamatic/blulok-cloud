import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { LockClosedIcon, LockOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit } from '@/types/units.types';
import { useAuth } from '@/contexts/AuthContext';

interface LockStatusWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
}

export const LockStatusWidget: React.FC<LockStatusWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
}) => {
  const { authState } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];

  useEffect(() => {
    const fetchUnits = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get units based on user role
        const response = await apiService.getMyUnits();
        setUnits(response.units || []);
      } catch (err) {
        console.error('Error fetching units:', err);
        setError('Failed to load units');
      } finally {
        setLoading(false);
      }
    };

    fetchUnits();
  }, [authState.user]);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 3;
      case 'medium': return 4;
      case 'medium-tall': return 6;
      case 'large': return 8;
      default: return 4;
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
    if (level > 50) return 'text-green-600';
    if (level > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBatteryIcon = (level: number | undefined): string => {
    if (!level) return '🔋';
    if (level > 50) return '🔋';
    if (level > 20) return '🔋';
    return '🔋';
  };

  const handleLockToggle = async (unitId: string) => {
    try {
      setActionLoading(unitId);
      
      const unit = units.find(u => u.id === unitId);
      if (!unit) return;

      if (unit.status === 'locked') {
        await apiService.updateUnit(unitId, { is_locked: false });
        setUnits(prev => prev.map(u => 
          u.id === unitId 
            ? { ...u, status: 'unlocked' as const, last_seen: new Date().toISOString() }
            : u
        ));
      } else {
        await apiService.updateUnit(unitId, { is_locked: true });
        setUnits(prev => prev.map(u => 
          u.id === unitId 
            ? { ...u, status: 'locked' as const, last_seen: new Date().toISOString() }
            : u
        ));
      }
    } catch (err) {
      console.error('Error toggling lock:', err);
      // Could show a toast notification here
    } finally {
      setActionLoading(null);
    }
  };

  const maxItems = getMaxItems(currentSize);
  const displayUnits = units.slice(0, maxItems);
  const unlockedCount = units.filter(unit => unit.status === 'unlocked').length;
  const lowBatteryCount = units.filter(unit => (unit.battery_level || 0) < 20).length;
  const offlineCount = units.filter(unit => !unit.is_online).length;

  if (loading) {
    return (
      <Widget
        id="lock-status-widget-loading"
        title="Lock Status"
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
        id="lock-status-widget-error"
        title="Lock Status"
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
      id="lock-status-widget"
      title="Lock Status"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
    >
      <div className="space-y-2 h-full flex flex-col">
        {units.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <LockClosedIcon className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm">No units found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          // Compact view for small size
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-gray-600 dark:text-gray-300">
                {unlockedCount} unlocked
              </span>
              {lowBatteryCount > 0 && (
                <span className="text-orange-600 flex items-center space-x-1">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  <span>{lowBatteryCount}</span>
                </span>
              )}
            </div>
            {displayUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1">
                  {unit.status === 'locked' ? (
                    <LockClosedIcon className="h-3 w-3 text-green-600" />
                  ) : (
                    <LockOpenIcon className="h-3 w-3 text-red-600" />
                  )}
                  <span className="truncate">{unit.unit_number}</span>
                </div>
                <button
                  onClick={() => handleLockToggle(unit.id)}
                  disabled={actionLoading === unit.id}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                    unit.status === 'locked'
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
                      : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800'
                  }`}
                >
                  {actionLoading === unit.id ? '...' : (unit.status === 'locked' ? 'Unlock' : 'Lock')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          // Full view for larger sizes
          <div className="space-y-3 flex-1 overflow-y-auto">
            {/* Status Summary */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {unlockedCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Unlocked</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {lowBatteryCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Low Battery</div>
              </div>
              <div className="text-center p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {offlineCount}
                </div>
                <div className="text-gray-500 dark:text-gray-400">Offline</div>
              </div>
            </div>

            {/* Units List */}
            <div className="space-y-2">
              {displayUnits.map((unit) => (
                <div key={unit.id} className="flex items-center justify-between p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      {unit.status === 'locked' ? (
                        <LockClosedIcon className="h-5 w-5 text-green-600" />
                      ) : (
                        <LockOpenIcon className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {unit.unit_number}
                      </div>
                      <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className={getBatteryColor(unit.battery_level)}>
                          {getBatteryIcon(unit.battery_level)} {unit.battery_level || 0}%
                        </span>
                        <span>•</span>
                        <span className={unit.is_online ? 'text-green-600' : 'text-red-600'}>
                          {unit.is_online ? 'Online' : 'Offline'}
                        </span>
                        <span>•</span>
                        <span>{formatLastSeen(unit.last_seen)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleLockToggle(unit.id)}
                    disabled={actionLoading === unit.id}
                    className={`px-3 py-1 rounded text-sm font-medium transition-colors disabled:opacity-50 ${
                      unit.status === 'locked'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800'
                        : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800'
                    }`}
                  >
                    {actionLoading === unit.id ? '...' : (unit.status === 'locked' ? 'Unlock' : 'Lock')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {units.length > maxItems && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Showing {maxItems} of {units.length} units
          </div>
        )}
      </div>
    </Widget>
  );
};
