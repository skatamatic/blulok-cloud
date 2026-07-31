import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { ClockIcon, UserIcon, LockClosedIcon, LockOpenIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessLog } from '@/types/access-history.types';
import { useAuth } from '@/contexts/AuthContext';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { getWidgetLayoutProfile, WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';
import {
  accessLogFromActivityWsData,
  matchesAccessHistoryLiveFilters,
  parseActivityWsEnvelope,
  prependUniqueAccessLog,
} from '@/utils/access-history-live.utils';
import {
  formatAccessAction,
  formatAccessHistoryDeviceLabel,
  formatAccessHistoryUnitLabel,
  getAccessActionToneClass,
  getAccessFailureDetail,
  getAccessLocationDisplay,
  getAccessLogMetadata,
  getAccessUserDisplay,
  hasOccupiedUnlockOverride,
  isManualLockEvent,
} from '@/utils/access-history-display.utils';
import { formatRelativeWithExact } from '@/utils/datetime.utils';

interface AccessHistoryWidgetProps {
  currentSize: WidgetSize;
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  /** When set, scopes REST + activity subscription to one facility */
  facilityFilter?: string;
}

export const AccessHistoryWidget: React.FC<AccessHistoryWidgetProps> = ({
  currentSize,
  onSizeChange,
  onRemove,
  readOnly = false,
  facilityFilter,
}) => {
  const { authState } = useAuth();
  const [accessHistory, setAccessHistory] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];

  const fetchAccessHistory = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true);
        setError(null);
      }

      const response = await apiService.getAccessHistory({
        limit: 20,
        ...(facilityFilter ? { facility_id: facilityFilter } : {}),
      });

      setAccessHistory(response.logs || []);
    } catch (err) {
      console.error('Error fetching access history:', err);
      if (!options?.background) {
        setError('Failed to load access history');
      }
    } finally {
      if (!options?.background) {
        setLoading(false);
      }
    }
  }, [facilityFilter]);

  const fetchAccessHistoryRef = useRef(fetchAccessHistory);
  fetchAccessHistoryRef.current = fetchAccessHistory;

  useEffect(() => {
    void fetchAccessHistory();
  }, [fetchAccessHistory, authState.user?.id]);

  const activityWsFilters = useMemo(
    () => (facilityFilter ? { facility_id: facilityFilter } : undefined),
    [facilityFilter],
  );

  const liveAccessFilters = useMemo(
    () => (facilityFilter ? { facility_id: facilityFilter } : {}),
    [facilityFilter],
  );

  const handleActivityWs = useCallback(
    (data: unknown) => {
      const { eventType, payload } = parseActivityWsEnvelope(data);
      if (eventType === 'activity_update') {
        return;
      }

      const incoming = accessLogFromActivityWsData(payload);
      if (!incoming) {
        void fetchAccessHistoryRef.current({ background: true });
        return;
      }

      if (!matchesAccessHistoryLiveFilters(incoming, liveAccessFilters)) {
        return;
      }

      setAccessHistory((prev) => prependUniqueAccessLog(prev, incoming, 20));
    },
    [liveAccessFilters],
  );

  useWebSocketSubscription('activity', handleActivityWs, {
    filters: activityWsFilters,
    enabled: Boolean(authState.user),
  });

  const layout = getWidgetLayoutProfile(currentSize);

  const formatEntryTime = (dateString: string): { display: string; title: string } =>
    formatRelativeWithExact(dateString, { absoluteAfterHours: 24, absoluteStyle: 'datetime' });

  const getActionIcon = (log: AccessLog) => {
    const tone = getAccessActionToneClass(log);
    if (!log.success || hasOccupiedUnlockOverride(log)) {
      return <ExclamationTriangleIcon className={`h-4 w-4 ${tone}`} />;
    }
    if (isManualLockEvent(log) || log.action === 'lock' || log.action === 'door_close' || log.action === 'gate_close') {
      return <LockClosedIcon className={`h-4 w-4 ${tone}`} />;
    }
    return <LockOpenIcon className={`h-4 w-4 ${tone}`} />;
  };

  const getActionText = (log: AccessLog): string => {
    const label = formatAccessAction(log);
    if (!log.success) {
      const failure = getAccessFailureDetail(log);
      return failure ? `${label} — ${failure}` : label;
    }
    return label;
  };

  const getActionSummary = (log: AccessLog): { primary: string; title: string } => {
    const title = getActionText(log);
    const primary = formatAccessAction(log);
    return { primary, title };
  };

  const getActionColor = (log: AccessLog): string => getAccessActionToneClass(log);

  const getUserDisplayName = (log: AccessLog): string => getAccessUserDisplay(log).primary;

  const getUnitDisplayName = (log: AccessLog): string => {
    const meta = getAccessLogMetadata(log);
    const unit = formatAccessHistoryUnitLabel(log, meta);
    if (unit) return unit;
    const device = formatAccessHistoryDeviceLabel(log, meta);
    if (device) return device;
    const location = getAccessLocationDisplay(log, { hideFacility: Boolean(facilityFilter) });
    return location.primary;
  };

  const maxItems = layout.listCap;
  const displayHistory = accessHistory.slice(0, maxItems);

  if (loading) {
    return (
      <Widget
        id="access-history-widget-loading"
        title="Access History"
        size={currentSize}
        onSizeChange={onSizeChange}
        availableSizes={availableSizes}
        onRemove={onRemove}
        readOnly={readOnly}
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
        id="access-history-widget-error"
        title="Access History"
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
      id="access-history-widget"
      title="Access History"
      size={currentSize}
      onSizeChange={onSizeChange}
      availableSizes={availableSizes}
      onRemove={onRemove}
      readOnly={readOnly}
    >
      <div className="space-y-2 h-full flex flex-col">
        {accessHistory.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500 dark:text-gray-400 text-center">
              <ClockIcon className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm">No access history found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          // Compact view for small size
          <div className="space-y-1">
            {displayHistory.map((entry) => {
              const entryTime = formatEntryTime(entry.occurred_at);
              return (
              <div key={entry.id} className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1">
                  {getActionIcon(entry)}
                  <span className="truncate">{getUnitDisplayName(entry)}</span>
                </div>
                <span className="text-gray-500" title={entryTime.title}>
                  {entryTime.display}
                </span>
              </div>
            );})}
          </div>
        ) : (
          // Full view for larger sizes
          <div className={`space-y-2 ${WIDGET_LIST_SCROLL_CLASS}`}>
            {displayHistory.map((entry) => {
              const entryTime = formatEntryTime(entry.occurred_at);
              const actionSummary = getActionSummary(entry);
              const failureDetail = !entry.success ? getAccessFailureDetail(entry) : null;
              return (
              <div key={entry.id} className="flex items-center space-x-3 p-2 rounded-md bg-gray-50 dark:bg-gray-700">
                <div className="flex-shrink-0">
                  {getActionIcon(entry)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate" title={getUnitDisplayName(entry)}>
                      {getUnitDisplayName(entry)}
                    </span>
                    <span
                      className={`text-sm font-medium truncate ${getActionColor(entry)}`}
                      title={actionSummary.title}
                    >
                      {actionSummary.primary}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                    <UserIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate" title={getUserDisplayName(entry)}>{getUserDisplayName(entry)}</span>
                    <ClockIcon className="h-3 w-3 shrink-0 ml-1" />
                    <span className="truncate" title={entryTime.title}>
                      {entryTime.display}
                    </span>
                  </div>
                  {!entry.success && failureDetail && (
                    <p
                      className="mt-1 text-xs text-red-600 dark:text-red-400 line-clamp-2 break-words"
                      title={failureDetail}
                    >
                      {failureDetail}
                    </p>
                  )}
                </div>
              </div>
            );})}
          </div>
        )}
        
        {accessHistory.length > maxItems && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center pt-2 border-t border-gray-200 dark:border-gray-600">
            Showing {maxItems} of {accessHistory.length} entries
          </div>
        )}
      </div>
    </Widget>
  );
};
