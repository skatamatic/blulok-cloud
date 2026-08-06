import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { AccessSession } from '@/types/access-session.types';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessHistoryLiveUpdates } from '@/hooks/useAccessHistoryLiveUpdates';
import { getWidgetLayoutProfile, WIDGET_LIST_SCROLL_CLASS } from '@/utils/widget-layout.utils';
import { AccessHistoryWidgetSessionRow } from '@/components/Widget/AccessHistoryWidgetSessionRow';
import { getAccessSessionActionIcon } from '@/components/AccessHistory/accessHistoryIcons';
import {
  getAccessSessionIconTileClass,
  getAccessSessionOutcomeDisplay,
  getAccessSessionOutcomePillClass,
  getAccessSessionSubjectDisplay,
  getAccessSessionTitleToneClass,
} from '@/utils/access-session-display.utils';
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
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const availableSizes: WidgetSize[] = ['small', 'medium', 'large', 'medium-tall'];

  const fetchAccessHistory = useCallback(async (options?: { background?: boolean }) => {
    try {
      if (!options?.background) {
        setLoading(true);
        setError(null);
      }

      const response = await apiService.getAccessSessions({
        limit: 20,
        ...(facilityFilter ? { facility_id: facilityFilter } : {}),
      });

      const next = (response.sessions || []) as AccessSession[];
      setSessions(next);
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

  useAccessHistoryLiveUpdates({
    enabled: Boolean(authState.user),
    subscriptionFilters: activityWsFilters,
    liveFilters: liveAccessFilters,
    maxRows: 20,
    canUpsertSessions: true,
    onSessionUpsert: setSessions,
    onFallbackRefresh: (options) => fetchAccessHistoryRef.current(options),
  });

  const layout = getWidgetLayoutProfile(currentSize);
  const maxItems = layout.listCap;
  const displayHistory = sessions.slice(0, maxItems);
  const hideFacility = Boolean(facilityFilter);

  const handleToggle = (sessionId: string) => {
    setExpandedId((prev) => (prev === sessionId ? null : sessionId));
  };

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
      <div className="flex h-full flex-col space-y-2">
        {sessions.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <ClockIcon className="mx-auto mb-2 h-8 w-8" />
              <div className="text-sm">No access history found</div>
            </div>
          </div>
        ) : currentSize === 'small' ? (
          <div className="space-y-1.5">
            {displayHistory.map((entry) => {
              const entryTime = formatRelativeWithExact(entry.started_at, {
                absoluteAfterHours: 24,
                absoluteStyle: 'datetime',
              });
              const outcome = getAccessSessionOutcomeDisplay(entry);
              const subject = getAccessSessionSubjectDisplay(entry, { hideFacility });
              const Icon = getAccessSessionActionIcon(entry);
              const tone = getAccessSessionTitleToneClass(entry);
              const tile = getAccessSessionIconTileClass(entry);
              const liveStatus =
                outcome.tone === 'open'
                || outcome.tone === 'open_stale'
                || outcome.tone === 'open_critical'
                || outcome.tone === 'pending';
              return (
                <div key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${tile}`}>
                      <Icon className={`h-3.5 w-3.5 ${tone}`} />
                    </span>
                    <span className="truncate font-medium text-gray-900 dark:text-gray-100">
                      {subject.primary}
                    </span>
                  </div>
                  <span
                    className={`max-w-[45%] shrink-0 truncate rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getAccessSessionOutcomePillClass(outcome.tone)}`}
                    title={entryTime.title}
                  >
                    {liveStatus ? outcome.label : entryTime.display}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={`space-y-2 ${WIDGET_LIST_SCROLL_CLASS}`}>
            {displayHistory.map((entry) => (
              <AccessHistoryWidgetSessionRow
                key={entry.id}
                session={entry}
                hideFacility={hideFacility}
                expanded={expandedId === entry.id}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}

        {sessions.length > maxItems && (
          <div className="border-t border-gray-200 pt-2 text-center text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">
            Showing {maxItems} of {sessions.length} entries
          </div>
        )}
      </div>
    </Widget>
  );
};
