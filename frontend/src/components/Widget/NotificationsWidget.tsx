import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  SignalSlashIcon,
  ShieldExclamationIcon,
  CloudIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  ExclamationTriangleIcon as ExclamationTriangleIconSolid,
  CheckCircleIcon as CheckCircleIconSolid,
  BellIcon as BellIconSolid,
} from '@heroicons/react/24/solid';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { useDashboardFacilityScope } from '@/hooks/useDashboardFacilityScope';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { useToast } from '@/contexts/ToastContext';
import { useFMSSync } from '@/contexts/FMSSyncContext';
import { apiService } from '@/services/api.service';
import {
  FMS_PENDING_REVIEW_CHANGED,
  collectFmsReviewSyncLogIds,
} from '@/utils/fms-pending-review.utils';
import {
  describeFmsNotificationInstance,
  groupDashboardNotifications,
  loadRecordedFmsNotificationGroups,
  pickGroupedFmsReviewTarget,
  recordedFmsGroupsEqual,
  rememberUnreadFmsNotificationGroups,
  saveRecordedFmsNotificationGroups,
} from '@/utils/fms-notification-group.utils';
import { fmsService } from '@/services/fms.service';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import type { UserNotificationApi } from '@/types/notifications.types';
import {
  filterNotificationsForViewer,
  getNotificationCardVisual,
  getNotificationDetailLines,
  getNotificationStructuredDetails,
  formatNotificationTimestamp,
  getNotificationUrgencyBadge,
  mapApiNotificationToDashboardView,
  notificationMessageNeedsExpansion,
  type WidgetNotificationTone,
} from '@/utils/notification-display.utils';
import {
  getWidgetLayoutProfile,
  isWideWidgetSize,
  WIDGET_BODY_CLASS,
  WIDGET_LIST_SCROLL_CLASS,
} from '@/utils/widget-layout.utils';

type DisplayNotification = ReturnType<typeof mapApiNotificationToDashboardView>;
type NotificationFilter = 'all' | 'unread' | 'actionRequired' | 'includingHidden';

function FilterMenuButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 py-2 text-left text-sm rounded ${
        active
          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function NotificationToneIcon({
  tone,
  notificationType,
  compact,
  isRead,
  className,
}: {
  tone: WidgetNotificationTone;
  notificationType: string;
  compact: boolean;
  isRead: boolean;
  className: string;
}) {
  const sizeClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const iconClass = `${sizeClass} ${className}`;

  if (tone === 'error') {
    if (notificationType === 'gateway_offline') {
      return <SignalSlashIcon className={iconClass} aria-hidden />;
    }
    return isRead ? (
      <ExclamationTriangleIcon className={iconClass} aria-hidden />
    ) : (
      <ExclamationTriangleIconSolid className={iconClass} aria-hidden />
    );
  }

  if (tone === 'warning') {
    return isRead ? (
      <ExclamationTriangleIcon className={iconClass} aria-hidden />
    ) : (
      <ShieldExclamationIcon className={iconClass} aria-hidden />
    );
  }

  if (tone === 'success') {
    return isRead ? (
      <CheckCircleIcon className={iconClass} aria-hidden />
    ) : (
      <CheckCircleIconSolid className={iconClass} aria-hidden />
    );
  }

  if (
    notificationType === 'fms_webhook_received' ||
    notificationType === 'fms_sync_complete' ||
    notificationType === 'fms_sync_failed'
  ) {
    return <CloudIcon className={iconClass} aria-hidden />;
  }

  return isRead ? (
    <BellIcon className={iconClass} aria-hidden />
  ) : (
    <BellIconSolid className={iconClass} aria-hidden />
  );
}

const NotificationCard: React.FC<{
  notification: DisplayNotification;
  instances?: DisplayNotification[];
  expanded: boolean;
  compact: boolean;
  index: number;
  facilityLabel?: string | null;
  readOnly?: boolean;
  onToggle: () => void;
  onHide?: () => void;
  onReviewFms?: () => void;
  formatTimestamp: (timestamp: Date, compact?: boolean) => string;
}> = ({
  notification,
  instances,
  expanded,
  compact,
  index,
  facilityLabel,
  readOnly,
  onToggle,
  onHide,
  onReviewFms,
  formatTimestamp,
}) => {
  const grouped = (instances?.length ?? 1) > 1;
  const expandable = notificationMessageNeedsExpansion(notification.message);
  const detailLines = getNotificationDetailLines(notification);
  const structuredDetails = grouped ? null : getNotificationStructuredDetails(notification);
  const visual = getNotificationCardVisual(notification);
  const urgencyBadge = getNotificationUrgencyBadge(notification);
  const hasExpandableDetails =
    grouped || structuredDetails != null || detailLines.length > 1 || expandable;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`relative overflow-hidden border rounded-xl transition-all duration-200 group hover:shadow-md ${
        compact ? 'p-2.5 pl-3' : 'p-3.5 pl-4'
      } ${visual.card} ${expanded ? visual.expandedRing : ''} ${
        notification.isHidden ? 'opacity-60 saturate-75' : ''
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${visual.accentBar} ${
          visual.showPulse ? 'animate-pulse' : ''
        }`}
        aria-hidden
      />

      <div className={`flex items-start ${compact ? 'gap-2.5' : 'gap-3'}`}>
        <div
          className={`flex-shrink-0 rounded-lg flex items-center justify-center ${
            compact ? 'h-7 w-7' : 'h-9 w-9'
          } ${visual.iconShell}`}
        >
          <NotificationToneIcon
            tone={notification.tone}
            notificationType={notification.notificationType}
            compact={compact}
            isRead={notification.isRead}
            className=""
          />
        </div>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            className="no-drag w-full text-left"
            aria-expanded={expanded}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                <h4
                  className={`${compact ? 'text-xs' : 'text-sm'} font-semibold leading-snug ${visual.title}`}
                >
                  {notification.title}
                </h4>
                {grouped && (
                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    {instances!.length} updates
                  </span>
                )}
                {urgencyBadge && (
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${urgencyBadge.className}`}
                  >
                    {urgencyBadge.label}
                  </span>
                )}
                {notification.isHidden && (
                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                    Hidden
                  </span>
                )}
                {!notification.isRead && !urgencyBadge && (
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#147FD4] shrink-0" aria-hidden />
                )}
              </div>
              {(hasExpandableDetails || !notification.isRead) && (
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-gray-400 dark:text-gray-500"
                >
                  <ChevronDownIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                </motion.span>
              )}
            </div>

            {!expanded && (
              <p
                className={`${compact ? 'text-[11px] mt-0.5' : 'text-xs mt-1'} leading-relaxed line-clamp-2 ${visual.message}`}
              >
                {notification.message}
              </p>
            )}
          </button>

          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="overflow-hidden"
              >
                <div className={`space-y-2 ${compact ? 'mt-1.5' : 'mt-2'}`}>
                  <p
                    className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${visual.message}`}
                  >
                    {notification.message}
                  </p>
                  {grouped && instances ? (
                    <div className="rounded-lg border border-gray-100 bg-white/70 px-2.5 py-2 dark:border-gray-700/80 dark:bg-gray-900/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Each update
                      </p>
                      <ul className="mt-1.5 space-y-2">
                        {instances.map((instance) => {
                          const described = describeFmsNotificationInstance(instance);
                          return (
                            <li key={instance.id} className="text-[11px] leading-snug">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-medium text-gray-700 dark:text-gray-200">
                                  {described.eventLabel}
                                </span>
                                <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
                                  {formatTimestamp(instance.timestamp, true)}
                                </span>
                              </div>
                              <p className="mt-0.5 text-gray-600 dark:text-gray-400">
                                {described.message}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : structuredDetails ? (
                    <div className="rounded-lg border border-gray-100 bg-white/70 px-2.5 py-2 dark:border-gray-700/80 dark:bg-gray-900/50">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        Details
                      </p>
                      <dl className="mt-1.5 space-y-1.5">
                        {structuredDetails.map((row) => (
                          <div key={row.label} className="flex gap-2 text-[11px] leading-snug">
                            <dt className="shrink-0 w-[72px] font-medium text-gray-500 dark:text-gray-400">
                              {row.label}
                            </dt>
                            <dd className="min-w-0 flex-1 text-gray-700 dark:text-gray-200 break-words">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : (
                    detailLines.length > 1 && (
                      <div className="rounded-lg border border-gray-100 bg-white/70 px-2.5 py-2 dark:border-gray-700/80 dark:bg-gray-900/50">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                          Details
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {detailLines.slice(1).map((line) => (
                            <li
                              key={line}
                              className="text-[11px] text-gray-600 dark:text-gray-400 break-words font-mono"
                            >
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`flex items-center justify-between gap-2 ${compact ? 'mt-1.5' : 'mt-2.5'}`}>
            <span className={`text-[11px] tabular-nums ${visual.timestamp}`}>
              {formatTimestamp(notification.timestamp, compact)}
            </span>

            <div className="flex items-center gap-2 shrink-0 min-w-0">
              {facilityLabel && (
                <span
                  className="max-w-[140px] truncate text-[11px] text-gray-400 dark:text-gray-500"
                  title={facilityLabel}
                >
                  {facilityLabel}
                </span>
              )}
              {onReviewFms && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReviewFms();
                  }}
                  className="no-drag rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm shadow-amber-500/25 transition-colors hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400"
                >
                  Review changes
                </button>
              )}
              {!readOnly && !notification.isHidden && onHide && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHide();
                  }}
                  className="no-drag rounded-md p-1 text-gray-400 opacity-[0.33] transition-all hover:bg-gray-100 hover:text-red-600 hover:opacity-100 dark:hover:bg-gray-700 dark:hover:text-red-400"
                  aria-label="Hide notification"
                  title="Hide from widget"
                >
                  <TrashIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface NotificationsWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  /** Global facility filter (omit when "All facilities") */
  facilityFilter?: string;
}

type WsNotificationEvent = {
  eventType?: string;
  payload?: unknown;
};

const NOTIFICATION_PAGE_SIZE = 100;

function toApiNotification(
  n: UserNotificationApi | Record<string, unknown>
): UserNotificationApi {
  const r = n as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    type: String(r.type ?? 'general'),
    title: String(r.title ?? ''),
    message: String(r.message ?? ''),
    priority: String(r.priority ?? 'normal'),
    isRead: Boolean(r.isRead ?? r.is_read),
    isHidden: Boolean(r.isHidden ?? r.is_hidden ?? r.is_deleted),
    readAt: (r.readAt ?? r.read_at) as string | null,
    reference: (r.reference as UserNotificationApi['reference']) ?? null,
    facilityId: (r.facilityId ?? r.facility_id) as string | null,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    createdAt: String(r.createdAt ?? r.created_at ?? new Date().toISOString()),
  };
}

export const NotificationsWidget: React.FC<NotificationsWidgetProps> = ({
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
}) => {
  const { wsFilters, matchesFacilityScope } = useDashboardFacilityScope(facilityFilter);
  const { authState } = useAuth();
  const { facilities } = useGlobalFacility();
  const { addToast } = useToast();
  const { openPendingReview } = useFMSSync();
  const viewerRole = authState.user?.role;
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
  const [rows, setRows] = useState<DisplayNotification[]>([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [openFmsReviewLogIds, setOpenFmsReviewLogIds] = useState<Set<string> | null>(null);
  const [recordedFmsGroups, setRecordedFmsGroups] = useState(loadRecordedFmsNotificationGroups);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      let alreadyRead = false;
      setRows((prev) => {
        const target = prev.find((n) => n.id === notificationId);
        alreadyRead = target?.isRead === true;
        return prev;
      });
      if (alreadyRead) return;
      try {
        await apiService.markNotificationRead(notificationId);
        setRows((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
        );
      } catch (e) {
        console.error('Mark read failed', e);
        addToast({
          type: 'error',
          title: 'Could not mark as read',
          message: 'Try again in a moment.',
        });
      }
    },
    [addToast],
  );

  const handleNotificationToggle = useCallback(
    (itemKey: string, instanceIds: string[]) => {
      setExpandedIds((prev) => {
        const willExpand = !prev.has(itemKey);
        if (willExpand && !readOnly) {
          for (const instanceId of instanceIds) {
            void markAsRead(instanceId);
          }
        }
        const next = new Set(prev);
        if (willExpand) {
          next.add(itemKey);
        } else {
          next.delete(itemKey);
        }
        return next;
      });
    },
    [readOnly, markAsRead],
  );

  const refreshOpenFmsReviews = useCallback(async (notifications: DisplayNotification[]) => {
    const syncLogIds = collectFmsReviewSyncLogIds(notifications);
    if (syncLogIds.length === 0) {
      setOpenFmsReviewLogIds(new Set());
      return;
    }

    const open = new Set<string>();
    await Promise.all(
      syncLogIds.map(async (syncLogId) => {
        try {
          const log = await fmsService.getSyncDetails(syncLogId);
          if (log.sync_status !== 'failed' && (log.changes_pending ?? 0) > 0) {
            open.add(syncLogId);
          }
        } catch {
          // Missing or unreadable log — treat as already reviewed/dismissed.
        }
      }),
    );
    setOpenFmsReviewLogIds(open);
  }, []);

  const visibleForViewer = useCallback(
    (items: UserNotificationApi[]) => filterNotificationsForViewer(items, viewerRole),
    [viewerRole],
  );

  const matchesScope = useCallback(
    (n: UserNotificationApi) => matchesFacilityScope(n.facilityId),
    [matchesFacilityScope],
  );

  const mergeById = useCallback((incoming: UserNotificationApi[]) => {
    setRows((prev) => {
      const map = new Map<string, DisplayNotification>();
      prev.forEach((p) => map.set(p.id, p));
      incoming.forEach((raw) => {
        if (!matchesScope(raw)) return;
        if (!filterNotificationsForViewer([raw], viewerRole).length) return;
        const v = mapApiNotificationToDashboardView(raw);
        map.set(v.id, v);
      });
      return Array.from(map.values()).sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
    });
  }, [matchesScope, viewerRole]);

  const includeHiddenInFetch = filter === 'includingHidden';

  const loadNotifications = useCallback(
    async (opts?: { silent?: boolean; append?: boolean; offset?: number }) => {
      const silent = opts?.silent === true;
      const append = opts?.append === true;
      const offset = opts?.offset ?? 0;

      if (append) {
        setIsLoadingMore(true);
      } else if (!silent) {
        setError(null);
      }

      try {
        const response = await apiService.getNotifications({
          facilityId: facilityFilter,
          includeExpired: true,
          includeHidden: includeHiddenInFetch,
          limit: NOTIFICATION_PAGE_SIZE,
          offset,
        });
        if (response.success && response.notifications) {
          const mapped = visibleForViewer(response.notifications)
            .filter((n) => matchesScope(n))
            .map(mapApiNotificationToDashboardView);

          setTotalAvailable(response.total);
          setLoadedOffset(offset + response.notifications.length);

          if (append) {
            setRows((prev) => {
              const map = new Map<string, DisplayNotification>();
              prev.forEach((p) => map.set(p.id, p));
              mapped.forEach((n) => map.set(n.id, n));
              return Array.from(map.values()).sort(
                (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
              );
            });
          } else {
            setRows(mapped);
          }
        } else if (!append) {
          setRows([]);
          setTotalAvailable(0);
          setLoadedOffset(0);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
        if (!silent && !append) {
          setError('Failed to load notifications');
          setRows([]);
          setTotalAvailable(0);
          setLoadedOffset(0);
        }
      } finally {
        if (!silent && !append) {
          setIsLoading(false);
        }
        if (append) {
          setIsLoadingMore(false);
        }
      }
    },
    [facilityFilter, includeHiddenInFetch, matchesScope, visibleForViewer]
  );

  const hideNotification = useCallback(
    async (notificationId: string) => {
      setExpandedIds((prev) => {
        if (!prev.has(notificationId)) return prev;
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });

      const showHidden = filter === 'includingHidden';
      setRows((prev) => {
        if (showHidden) {
          return prev.map((n) =>
            n.id === notificationId ? { ...n, isHidden: true, isRead: true } : n,
          );
        }
        return prev.filter((n) => n.id !== notificationId);
      });

      try {
        await apiService.deleteNotification(notificationId);
      } catch (e) {
        console.error('Hide notification failed', e);
        addToast({
          type: 'error',
          title: 'Could not hide notification',
          message: 'Try again in a moment.',
        });
        void loadNotifications({ silent: true, offset: 0 });
      }
    },
    [addToast, filter, loadNotifications],
  );

  useEffect(() => {
    setExpandedIds(new Set());
    setRows([]);
    setTotalAvailable(0);
    setLoadedOffset(0);
    setOpenFmsReviewLogIds(null);
    setIsLoading(true);
    void loadNotifications({ offset: 0 });
  }, [facilityFilter, includeHiddenInFetch, matchesScope, loadNotifications]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fmsReviewLogKey = useMemo(
    () => collectFmsReviewSyncLogIds(rows).sort().join(','),
    [rows],
  );

  useEffect(() => {
    void refreshOpenFmsReviews(rowsRef.current);
  }, [fmsReviewLogKey, refreshOpenFmsReviews]);

  useEffect(() => {
    const onPendingReviewChanged = () => {
      void refreshOpenFmsReviews(rowsRef.current);
    };
    window.addEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingReviewChanged);
    return () => window.removeEventListener(FMS_PENDING_REVIEW_CHANGED, onPendingReviewChanged);
  }, [refreshOpenFmsReviews]);

  const handleWs = useCallback(
    (message: WsNotificationEvent) => {
      const { eventType, payload } = message;
      const data = payload as Record<string, unknown> | undefined;

      switch (eventType) {
        case 'notifications_update': {
          const recent = data?.recentNotifications as unknown[] | undefined;
          if (recent?.length) {
            mergeById(recent.map((x) => toApiNotification(x as Record<string, unknown>)));
          }
          break;
        }
        case 'notification_created': {
          if (!data?.notificationId) break;
          const apiRow: UserNotificationApi = {
            id: String(data.notificationId),
            type: String(data.type ?? 'general'),
            title: String(data.title ?? ''),
            message: String(data.message ?? ''),
            priority: String(data.priority ?? 'normal'),
            isRead: false,
            readAt: null,
            reference: (data.reference as UserNotificationApi['reference']) ?? null,
            facilityId: (data.facilityId as string) ?? null,
            metadata: (data.metadata as Record<string, unknown> | null) ?? null,
            createdAt: String(data.timestamp ?? new Date().toISOString()),
          };
          if (!matchesScope(apiRow)) break;
          if (!filterNotificationsForViewer([apiRow], viewerRole).length) break;
          mergeById([apiRow]);
          break;
        }
        case 'notification_read': {
          const nid = data?.notificationId as string | undefined;
          if (!nid) break;
          setRows((prev) =>
            prev.map((r) =>
              r.id === nid ? { ...r, isRead: true } : r
            )
          );
          break;
        }
        case 'notifications_batch_read': {
          const ids = data?.notificationIds as string[] | undefined;
          if (!ids?.length) break;
          const idSet = new Set(ids);
          setRows((prev) =>
            prev.map((r) => (idSet.has(r.id) ? { ...r, isRead: true } : r))
          );
          break;
        }
        case 'notifications_count_update':
          // Unread count is derived from local rows; a full reload here races with
          // expand/mark-read and re-sorts the list, collapsing expanded cards.
          break;
        case 'notification_deleted': {
          const nid = data?.notificationId as string | undefined;
          if (!nid) break;
          if (filter === 'includingHidden') {
            setRows((prev) =>
              prev.map((r) => (r.id === nid ? { ...r, isHidden: true, isRead: true } : r)),
            );
          } else {
            setRows((prev) => prev.filter((r) => r.id !== nid));
          }
          break;
        }
        case 'notifications_batch_hidden': {
          setRows((prev) => prev.map((r) => ({ ...r, isHidden: true, isRead: true })));
          break;
        }
        default:
          break;
      }
    },
    [filter, matchesScope, mergeById, viewerRole]
  );

  useWebSocketSubscription('notifications', (data) => handleWs(data as WsNotificationEvent), {
    filters: wsFilters,
  });

  const markAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsRead(facilityFilter);
      setRows((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.error('Mark all read failed', e);
      addToast({
        type: 'error',
        title: 'Could not mark all as read',
        message: 'Try again in a moment.',
      });
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || loadedOffset >= totalAvailable) return;
    await loadNotifications({ append: true, offset: loadedOffset });
  };

  const hasMoreNotifications = loadedOffset < totalAvailable;

  const layout = getWidgetLayoutProfile(size);

  const filteredNotifications = useMemo(() => {
    return rows.filter((notification) => {
      if (notification.isHidden && filter !== 'includingHidden') {
        return false;
      }
      if (filter === 'unread') {
        return !notification.isRead || expandedIds.has(notification.id);
      }
      if (filter === 'actionRequired') return notification.actionRequired;
      return true;
    });
  }, [rows, filter, expandedIds]);

  const sortedNotifications = useMemo(() => {
    return [...filteredNotifications].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }, [filteredNotifications]);

  const groupedItems = useMemo(
    () => groupDashboardNotifications(sortedNotifications, openFmsReviewLogIds, recordedFmsGroups),
    [sortedNotifications, openFmsReviewLogIds, recordedFmsGroups],
  );

  useLayoutEffect(() => {
    const next = rememberUnreadFmsNotificationGroups(groupedItems, recordedFmsGroups);
    if (recordedFmsGroupsEqual(next, recordedFmsGroups)) return;
    setRecordedFmsGroups(next);
    saveRecordedFmsNotificationGroups(next);
  }, [groupedItems, recordedFmsGroups]);

  const displayedItems = groupedItems.slice(0, layout.listCap);
  const visibleRows = useMemo(() => rows.filter((n) => !n.isHidden), [rows]);
  const unreadCount = useMemo(() => visibleRows.filter((n) => !n.isRead).length, [visibleRows]);
  const hiddenCount = useMemo(() => rows.filter((n) => n.isHidden).length, [rows]);
  const criticalUnreadCount = useMemo(
    () => rows.filter((n) => !n.isRead && n.tone === 'error').length,
    [rows],
  );

  const clearAllNotifications = async () => {
    if (visibleRows.length === 0) return;
    try {
      await apiService.hideAllNotifications(facilityFilter);
      setRows((prev) => prev.map((n) => ({ ...n, isHidden: true, isRead: true })));
    } catch (e) {
      console.error('Clear all notifications failed', e);
      addToast({
        type: 'error',
        title: 'Could not clear notifications',
        message: 'Try again in a moment.',
      });
      void loadNotifications({ silent: true, offset: 0 });
    }
  };

  const formatTimestamp = formatNotificationTimestamp;

  const showFacilityInCards = !facilityFilter;

  const resolveFacilityLabel = useCallback(
    (facilityId: string | null | undefined): string | null => {
      if (!showFacilityInCards || !facilityId) return null;
      const fromGlobal = facilities.find((f) => f.id === facilityId)?.name;
      if (fromGlobal) return fromGlobal;
      const userIds = authState.user?.facilityIds ?? [];
      const userNames = authState.user?.facilityNames ?? [];
      const idx = userIds.indexOf(facilityId);
      if (idx >= 0 && userNames[idx]) return userNames[idx];
      return null;
    },
    [showFacilityInCards, facilities, authState.user?.facilityIds, authState.user?.facilityNames],
  );

  const handleReviewFms = useCallback(
    async (instances: DisplayNotification[]) => {
      const target = pickGroupedFmsReviewTarget(instances, openFmsReviewLogIds);
      if (!target) return;
      try {
        await openPendingReview(
          target.facilityId,
          target.syncLogId,
          resolveFacilityLabel(instances[0]?.facilityId) ?? undefined,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Please try again';
        if (/no pending changes/i.test(message)) {
          setOpenFmsReviewLogIds((prev) => {
            const next = new Set(prev ?? []);
            next.delete(target.syncLogId);
            return next;
          });
          return;
        }
        addToast({
          type: 'error',
          title: 'Could not open review',
          message,
        });
      }
    },
    [addToast, openFmsReviewLogIds, openPendingReview, resolveFacilityLabel],
  );

  const hideNotificationGroup = useCallback(
    (instanceIds: string[]) => {
      for (const instanceId of instanceIds) {
        void hideNotification(instanceId);
      }
    },
    [hideNotification],
  );

  return (
    <Widget
      id={id}
      title={
        criticalUnreadCount > 0
          ? `${title} (${unreadCount} · ${criticalUnreadCount} critical)`
          : unreadCount > 0
            ? `${title} (${unreadCount})`
            : title
      }
      size={size}
      availableSizes={availableSizes}
      onSizeChange={handleSizeChange}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      enhancedMenu={
        <div className="space-y-1">
          <FilterMenuButton active={filter === 'all'} onClick={() => setFilter('all')}>
            All Notifications
          </FilterMenuButton>
          <FilterMenuButton active={filter === 'unread'} onClick={() => setFilter('unread')}>
            Unread ({unreadCount})
          </FilterMenuButton>
          <FilterMenuButton
            active={filter === 'actionRequired'}
            onClick={() => setFilter('actionRequired')}
          >
            Action Required
          </FilterMenuButton>
          <FilterMenuButton
            active={filter === 'includingHidden'}
            onClick={() => setFilter('includingHidden')}
          >
            Including Hidden{hiddenCount > 0 ? ` (${hiddenCount})` : ''}
          </FilterMenuButton>
          {!readOnly && visibleRows.length > 0 && (
            <FilterMenuButton active={false} onClick={() => void clearAllNotifications()}>
              Clear all
            </FilterMenuButton>
          )}
        </div>
      }
    >
      <div className={WIDGET_BODY_CLASS}>
        {(isWideWidgetSize(size) || layout.isTall) && (
          <div className="flex space-x-1 mb-3 shrink-0">
            {[
              { key: 'all', label: 'All', count: visibleRows.length },
              { key: 'unread', label: 'Unread', count: unreadCount },
              {
                key: 'actionRequired',
                label: 'Action Required',
                count: visibleRows.filter((n) => n.actionRequired).length,
              },
              {
                key: 'includingHidden',
                label: 'Including Hidden',
                count: rows.length,
              },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as NotificationFilter)}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
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

        {isLoading && rows.length === 0 ? (
          <div className="flex-1 min-h-0 space-y-2 overflow-hidden">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse flex items-start space-x-3 p-3">
                <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
            <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={() => void loadNotifications({ silent: false, offset: 0 })}
              className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              Try again
            </button>
          </div>
        ) : size !== 'small' ? (
          displayedItems.length > 0 ? (
          <div className={`${WIDGET_LIST_SCROLL_CLASS} space-y-2`}>
            <AnimatePresence>
                {displayedItems.map((item, index) => (
                  <NotificationCard
                    key={item.key}
                    notification={item.notification}
                    instances={item.instances}
                    expanded={expandedIds.has(item.key)}
                    compact={size === 'medium'}
                    index={index}
                    facilityLabel={resolveFacilityLabel(item.notification.facilityId)}
                    readOnly={readOnly}
                    onToggle={() =>
                      handleNotificationToggle(
                        item.key,
                        item.instances.map((instance) => instance.id),
                      )
                    }
                    onHide={() => hideNotificationGroup(item.instances.map((instance) => instance.id))}
                    onReviewFms={
                      pickGroupedFmsReviewTarget(item.instances, openFmsReviewLogIds)
                        ? () => void handleReviewFms(item.instances)
                        : undefined
                    }
                    formatTimestamp={formatTimestamp}
                  />
                ))}
            </AnimatePresence>
          </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 text-center">
              <BellIcon
                className={`text-gray-400 mb-1.5 ${
                  layout.density === 'micro' || layout.density === 'compact'
                    ? 'h-6 w-6'
                    : 'h-8 w-8'
                }`}
              />
              <p
                className={`text-gray-500 dark:text-gray-400 ${
                  layout.density === 'micro' || layout.density === 'compact'
                    ? 'text-xs'
                    : 'text-sm'
                }`}
              >
                {filter === 'unread'
                  ? 'No unread notifications'
                  : filter === 'actionRequired'
                    ? 'No actions required'
                    : filter === 'includingHidden'
                      ? 'No notifications (including hidden)'
                      : 'No notifications'}
              </p>
            </div>
          )
        ) : null}

        {hasMoreNotifications && displayedItems.length > 0 && (
          <div className="mt-2 shrink-0">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="w-full rounded-lg border border-gray-200 bg-white py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {isLoadingMore ? 'Loading…' : `Load more (${totalAvailable - loadedOffset} remaining)`}
            </button>
          </div>
        )}

        {(size === 'medium-tall' || size === 'large' || size === 'huge' || size.includes('wide')) &&
          !readOnly &&
          visibleRows.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 shrink-0 flex gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllAsRead()}
                  className="flex-1 py-2 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => void clearAllNotifications()}
                className={`py-2 px-3 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/80 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400 rounded-lg transition-colors ${
                  unreadCount > 0 ? 'flex-1' : 'w-full'
                }`}
              >
                Clear all
              </button>
            </div>
          )}

        {size === 'small' && (
          <div className="h-full min-h-0 flex flex-col justify-center text-center">
            <div className="relative mb-2">
              <BellIcon className="h-8 w-8 text-gray-600 dark:text-gray-400 mx-auto" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{rows.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
};
