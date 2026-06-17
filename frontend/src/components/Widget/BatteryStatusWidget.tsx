import React, { useState, useEffect, useCallback } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import {
  BoltIcon,
  ExclamationTriangleIcon,
  BoltSlashIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { Unit } from '@/types/units.types';
import { apiService } from '@/services/api.service';
import { getWidgetLayoutProfile, WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';
import { formatRelativeTime, RELATIVE_LAST_SEEN_OPTS } from '@/utils/datetime.utils';

interface BatteryStatusWidgetProps {
  currentSize: WidgetSize;
  onSizeChange: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  /** When set, GET /units is filtered to this facility (backend enforces RBAC) */
  facilityFilter?: string;
}

interface BatteryData {
  /** Full list, online first then offline; lowest battery first within each group */
  rankedUnits?: Unit[];
  lowBatteryUnits: Unit[];
  totalUnits: number;
  criticalBatteryUnits: number;
  lowBatteryCount: number;
  offlineUnits: number;
  onlineUnits: number;
  lastUpdated: string;
}

function buildBatteryDataFromUnits(units: Unit[]): BatteryData {
  const rankedUnits = [...units].sort((a, b) => {
    const ao = a.is_online ? 0 : 1;
    const bo = b.is_online ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return (a.battery_level ?? 0) - (b.battery_level ?? 0);
  });
  const lowBatteryUnits = rankedUnits.filter((u) => (u.battery_level || 0) <= 20);
  const totalUnits = units.length;
  const criticalBatteryUnits = units.filter((u) => (u.battery_level || 0) <= 5).length;
  const lowBatteryCount = units.filter(
    (u) => (u.battery_level || 0) <= 20 && (u.battery_level || 0) > 5
  ).length;
  const offlineUnits = units.filter((u) => !u.is_online).length;
  const onlineUnits = units.filter((u) => u.is_online).length;
  return {
    rankedUnits,
    lowBatteryUnits,
    totalUnits,
    criticalBatteryUnits,
    lowBatteryCount,
    offlineUnits,
    onlineUnits,
    lastUpdated: new Date().toISOString(),
  };
}

export const BatteryStatusWidget: React.FC<BatteryStatusWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
  readOnly,
  facilityFilter,
}) => {
  const { authState } = useAuth();
  const [batteryData, setBatteryData] = useState<BatteryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'critical' | 'low' | 'offline'>('all');
  const availableSizes: WidgetSize[] = ['small', 'medium', 'medium-tall', 'large'];

  const loadFromApi = useCallback(async (opts?: { force?: boolean }) => {
    const res = await apiService.getUnits({
      limit: 500,
      offset: 0,
      ...(facilityFilter ? { facility_id: facilityFilter } : {}),
    });
    const units = (res as { units?: Unit[] }).units ?? [];
    const built = buildBatteryDataFromUnits(units);
    const force = opts?.force === true;
    setBatteryData((prev) => {
      if (
        !force &&
        built.totalUnits === 0 &&
        prev &&
        ((prev.rankedUnits?.length ?? 0) > 0 || (prev.lowBatteryUnits?.length ?? 0) > 0)
      ) {
        return prev;
      }
      return built;
    });
    setError(null);
  }, [facilityFilter]);

  useEffect(() => {
    if (!authState.user) return;

    let cancelled = false;
    (async () => {
      try {
        await loadFromApi();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load battery data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authState.user, loadFromApi, facilityFilter]);

  useWebSocketSubscription(
    'battery_status',
    (data) => {
      const payload = data as BatteryData;
      const raw = payload.rankedUnits ?? payload.lowBatteryUnits ?? [];
      if (facilityFilter) {
        const filtered = raw.filter((u) => u.facility_id === facilityFilter);
        setBatteryData(buildBatteryDataFromUnits(filtered));
      } else {
        setBatteryData(payload);
      }
      setLoading(false);
      setError(null);
    },
    {
      enabled: Boolean(authState.user),
      onError: (err) => {
        setError(err);
        setLoading(false);
      },
    },
  );

  const layout = getWidgetLayoutProfile(currentSize);

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

  const baseUnits = batteryData?.rankedUnits ?? batteryData?.lowBatteryUnits ?? [];

  const filteredUnits =
    baseUnits.filter((unit) => {
      const status = getBatteryStatus(unit);
      switch (filter) {
        case 'critical':
          return status === 'critical';
        case 'low':
          return status === 'low';
        case 'offline':
          return status === 'offline';
        default:
          return true;
      }
    }) || [];

  const maxItems = layout.listCap;
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
        readOnly={readOnly}
      >
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      </Widget>
    );
  }

  if (error && !batteryData) {
    return (
      <Widget
        id="battery-status-widget-error"
        title="Battery Status"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
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
      readOnly={readOnly}
      enhancedMenu={
        <div className="space-y-1">
          {[
            { key: 'all', label: 'All units' },
            { key: 'critical', label: 'Critical (≤5%)' },
            { key: 'low', label: 'Low (≤20%)' },
            { key: 'offline', label: 'Offline' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key as 'all' | 'critical' | 'low' | 'offline')}
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
        {error && batteryData && (
          <div className="text-xs text-amber-600 dark:text-amber-400 mb-2 px-1">{error}</div>
        )}
        {/* Summary Stats */}
        <div
          className={`grid grid-cols-3 ${currentSize === 'small' ? 'gap-1 mb-2' : 'gap-2 mb-4'}`}
        >
          <div
            className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-red-50 dark:bg-red-900/20 rounded-lg`}
          >
            <div
              className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-red-600 dark:text-red-400`}
            >
              {criticalCount}
            </div>
            <div className="text-xs text-red-600 dark:text-red-400">Critical</div>
          </div>
          <div
            className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-yellow-50 dark:bg-yellow-900/20 rounded-lg`}
          >
            <div
              className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-yellow-600 dark:text-yellow-400`}
            >
              {lowCount}
            </div>
            <div className="text-xs text-yellow-600 dark:text-yellow-400">Low</div>
          </div>
          <div
            className={`text-center ${currentSize === 'small' ? 'p-1' : 'p-2'} bg-gray-50 dark:bg-gray-700/50 rounded-lg`}
          >
            <div
              className={`${currentSize === 'small' ? 'text-sm' : 'text-lg'} font-bold text-gray-600 dark:text-gray-400`}
            >
              {offlineCount}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Offline</div>
          </div>
        </div>

        {/* Unit List */}
        <div
          className={`${WIDGET_LIST_SCROLL_CLASS} ${currentSize === 'small' ? 'space-y-1' : 'space-y-2'}`}
        >
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
                  <div
                    className={`${currentSize === 'small' ? 'p-1' : 'p-2'} rounded-lg ${
                      status === 'offline'
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : status === 'critical'
                          ? 'bg-red-100 dark:bg-red-900/20'
                          : status === 'low'
                            ? 'bg-yellow-100 dark:bg-yellow-900/20'
                            : 'bg-green-100 dark:bg-green-900/20'
                    } flex-shrink-0`}
                  >
                    <div className={getBatteryColor(batteryLevel)}>
                      {getBatteryIcon(batteryLevel, isOnline)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p
                        className={`${currentSize === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-900 dark:text-white truncate`}
                      >
                        {currentSize === 'small' ? unit.unit_number : `Unit ${unit.unit_number}`}
                      </p>
                      <span
                        className={`${currentSize === 'small' ? 'text-xs' : 'text-sm'} font-bold ${getBatteryColor(batteryLevel)}`}
                      >
                        {!isOnline ? 'Off' : `${batteryLevel}%`}
                      </span>
                    </div>

                    {currentSize !== 'small' && (
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {unit.facility?.name || (unit as { facility_name?: string }).facility_name || 'Unknown Facility'}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          • {formatRelativeTime(unit.last_seen, RELATIVE_LAST_SEEN_OPTS)}
                        </span>
                      </div>
                    )}
                  </div>

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
                {filter === 'critical'
                  ? 'No critical battery alerts'
                  : filter === 'low'
                    ? 'No low battery devices'
                    : filter === 'offline'
                      ? 'No offline devices'
                      : 'No units in scope'}
              </p>
            </div>
          )}
        </div>

        {batteryData?.lastUpdated && currentSize !== 'small' && (
          <div className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            Updated {formatRelativeTime(batteryData.lastUpdated, RELATIVE_LAST_SEEN_OPTS)}
          </div>
        )}
      </div>
    </Widget>
  );
};
