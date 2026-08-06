import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { 
  ClockIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessHistoryLiveUpdates } from '@/hooks/useAccessHistoryLiveUpdates';
import {
  getWidgetLayoutProfile,
  isWideWidgetSize,
  WIDGET_BODY_CLASS,
  WIDGET_LIST_SCROLL_CLASS,
} from '@/utils/widget-layout.utils';
import {
  formatAccessAction,
  formatAccessHistoryDeviceLabel,
  formatAccessHistoryUnitLabel,
  formatAccessMethod,
  getAccessFailureDetail,
  getAccessLogMetadata,
  getAccessUserDisplay,
} from '@/utils/access-history-display.utils';
import { formatRelativeTime } from '@/utils/datetime.utils';

interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  type: 'access' | 'lock' | 'unlock' | 'alert' | 'system';
  message: string;
  facility?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

interface ActivityMonitorWidgetProps {
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
  maxEntries?: number;
}

/**
 * Transform an AccessLog from the API into an ActivityLogEntry for display
 */
const transformAccessLogToActivity = (log: AccessLog): ActivityLogEntry => {
  // Determine the activity type based on action
  let type: ActivityLogEntry['type'] = 'access';
  if (log.action === 'lock') {
    type = 'lock';
  } else if (log.action === 'unlock') {
    type = 'unlock';
  } else if (
    log.action === 'access_denied'
    || log.action === 'unlock_attempt'
    || log.action === 'lock_attempt'
    || log.action === 'system_error'
    || log.action === 'invalid_credential'
  ) {
    type = 'alert';
  } else if (log.action === 'schedule_violation' || log.action === 'timeout') {
    type = 'system';
  }

  // Determine severity based on success and action
  let severity: ActivityLogEntry['severity'] = 'info';
  if (!log.success) {
    severity = 'error';
  } else if (log.action === 'lock' || log.action === 'access_granted') {
    severity = 'success';
  } else if (log.action === 'schedule_violation') {
    severity = 'warning';
  }

  // Build a descriptive message
  let message = '';
  const userName = getAccessUserDisplay(log).primary;
  const meta = getAccessLogMetadata(log);
  const unitNumber =
    formatAccessHistoryUnitLabel(log, meta)?.replace(/^Unit /, '')
    || formatAccessHistoryDeviceLabel(log, meta)
    || 'Unknown location';
  const failureDetail = getAccessFailureDetail(log);

  switch (log.action) {
    case 'unlock':
      message = userName !== '—'
        ? `Unit ${unitNumber} unlocked by ${userName}`
        : `Unit ${unitNumber} unlocked (${formatAccessMethod(log.method)})`;
      break;
    case 'lock':
      message = userName !== '—'
        ? `Unit ${unitNumber} locked by ${userName}`
        : `Unit ${unitNumber} locked (${formatAccessMethod(log.method)})`;
      break;
    case 'access_granted':
      message = `Access granted to ${unitNumber} for ${userName}`;
      break;
    case 'unlock_attempt':
    case 'access_denied':
      message = `Unlock attempt denied at ${unitNumber}`;
      if (userName !== '—') {
        message += ` for ${userName}`;
      }
      if (failureDetail) {
        message += ` — ${failureDetail}`;
      }
      break;
    case 'lock_attempt':
      message = `Lock attempt failed at ${unitNumber}`;
      if (userName !== '—') {
        message += ` by ${userName}`;
      }
      if (failureDetail) {
        message += ` — ${failureDetail}`;
      }
      break;
    case 'door_open':
    case 'gate_open':
      message = `${log.device_name || 'Access point'} opened`;
      break;
    case 'door_close':
    case 'gate_close':
      message = `${log.device_name || 'Access point'} closed`;
      break;
    case 'system_error':
      message = `System error on ${unitNumber}`;
      if (log.reason) {
        message += `: ${log.reason}`;
      }
      break;
    case 'timeout':
      message = `Timeout on ${unitNumber}`;
      break;
    case 'invalid_credential':
      message = `Invalid credential attempt on ${unitNumber}`;
      break;
    case 'schedule_violation':
      message = `Schedule violation on ${unitNumber} by ${userName}`;
      break;
    case 'manual_override':
      message = `Manual override on ${unitNumber} by ${userName}`;
      break;
    default:
      message = `${formatAccessAction(log)} on ${unitNumber}`;
      if (failureDetail) {
        message += ` — ${failureDetail}`;
      }
  }

  return {
    id: log.id,
    timestamp: new Date(log.occurred_at),
    type,
    message,
    facility: log.facility_name,
    severity
  };
};

export const ActivityMonitorWidget: React.FC<ActivityMonitorWidgetProps> = ({
  id,
  title,
  initialSize = 'medium-tall',
  currentSize,
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  facilityFilter,
  maxEntries = 50
}) => {
  const { authState } = useAuth();
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'alerts' | 'access'>('all');

  const loadActivities = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) {
      setError(null);
    }

    try {
      const response = await apiService.getAccessHistory({
        facility_id: facilityFilter,
        limit: maxEntries,
        offset: 0,
        view: 'raw',
      });

      if (response.success && response.logs) {
        setLogs(response.logs);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Failed to load access history:', err);
      if (!options?.background) {
        setError('Failed to load activity data');
        setLogs([]);
      }
    } finally {
      if (!options?.background) {
        setIsLoading(false);
      }
    }
  }, [facilityFilter, maxEntries]);

  const loadActivitiesRef = useRef(loadActivities);
  loadActivitiesRef.current = loadActivities;

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const liveFilters = useMemo(
    () => (facilityFilter ? { facility_id: facilityFilter } : {}),
    [facilityFilter],
  );

  useAccessHistoryLiveUpdates({
    enabled: Boolean(authState.user),
    subscriptionFilters: facilityFilter ? { facility_id: facilityFilter } : undefined,
    liveFilters,
    maxRows: maxEntries,
    canPrepend: true,
    onPrepend: setLogs,
    onFallbackRefresh: (options) => loadActivitiesRef.current(options),
  });

  const activities = useMemo(
    () => logs.map(transformAccessLogToActivity),
    [logs],
  );

  const layout = getWidgetLayoutProfile(size);

  const getActivityIcon = (type: string, severity: string) => {
    switch (type) {
      case 'access':
        return <KeyIcon className="h-4 w-4" />;
      case 'lock':
        return <LockClosedIcon className="h-4 w-4" />;
      case 'unlock':
        return <LockOpenIcon className="h-4 w-4" />;
      case 'alert':
        return severity === 'error' ? 
          <XCircleIcon className="h-4 w-4" /> : 
          <ExclamationTriangleIcon className="h-4 w-4" />;
      case 'system':
        return <CheckCircleIcon className="h-4 w-4" />;
      default:
        return <ClockIcon className="h-4 w-4" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20';
      case 'success':
        return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20';
      default:
        return 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20';
    }
  };

  const filteredActivities = activities.filter(activity => {
    if (filter === 'alerts') return activity.severity === 'error' || activity.severity === 'warning';
    if (filter === 'access') return activity.type === 'access' || activity.type === 'lock' || activity.type === 'unlock';
    return true;
  });

  const displayedActivities = filteredActivities.slice(0, layout.listCap);

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
        <div className="space-y-1">
          <button
            onClick={() => setFilter('all')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'all' 
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            All Activity
          </button>
          <button
            onClick={() => setFilter('alerts')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'alerts' 
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Alerts Only
          </button>
          <button
            onClick={() => setFilter('access')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'access' 
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Access Events
          </button>
        </div>
      }
    >
      <div className={`${WIDGET_BODY_CLASS} gap-2`}>
        {/* Filter Tabs (for larger / wide / dock widgets) */}
        {(isWideWidgetSize(size) || layout.isTall) && (
          <div className="flex space-x-1 mb-3">
            {[
              { key: 'all', label: 'All', count: activities.length },
              { key: 'alerts', label: 'Alerts', count: activities.filter(a => a.severity === 'error' || a.severity === 'warning').length },
              { key: 'access', label: 'Access', count: activities.filter(a => ['access', 'lock', 'unlock'].includes(a.type)).length }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === key
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Activity List */}
        <div className={`${WIDGET_LIST_SCROLL_CLASS} space-y-1.5`}>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse flex items-center space-x-3 p-2">
                  <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                  <div className="flex-1 space-y-1">
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-2" />
              <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              <button
                onClick={() => void loadActivities()}
                className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Try again
              </button>
            </div>
          ) : displayedActivities.length > 0 ? (
            displayedActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className={`flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors group ${
                  layout.isDock ? 'p-1.5' : 'p-2'
                }`}
              >
                <div
                  className={`rounded-full ${getSeverityColor(activity.severity)} flex-shrink-0 ${
                    layout.isDock ? 'p-1' : 'p-2'
                  }`}
                >
                  {getActivityIcon(activity.type, activity.severity)}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={`text-gray-900 dark:text-white leading-tight ${
                      layout.isDock ? 'text-xs line-clamp-1' : 'text-sm'
                    }`}
                  >
                    {activity.message}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                      {formatRelativeTime(activity.timestamp, { absoluteAfterHours: 24, absoluteStyle: 'date' })}
                    </span>
                    {activity.facility && !layout.isDock && (
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                        • {activity.facility}
                      </span>
                    )}
                  </div>
                </div>

              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <ClockIcon className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </Widget>
  );
};
