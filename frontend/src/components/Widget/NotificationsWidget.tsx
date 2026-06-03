import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  ArrowPathIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { useDashboardFacilityScope } from '@/hooks/useDashboardFacilityScope';
import { useAuth } from '@/contexts/AuthContext';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { UserNotificationApi } from '@/types/notifications.types';
import {
  filterNotificationsForViewer,
  getNotificationDetailLines,
  mapApiNotificationToDashboardView,
  notificationMessageNeedsExpansion,
} from '@/utils/notification-display.utils';
import {
  getWidgetLayoutProfile,
  isWideWidgetSize,
  WIDGET_BODY_CLASS,
  WIDGET_LIST_SCROLL_CLASS,
} from '@/utils/widget-layout.utils';

type DisplayNotification = ReturnType<typeof mapApiNotificationToDashboardView>;

const NotificationCard: React.FC<{
  notification: DisplayNotification;
  expanded: boolean;
  compact: boolean;
  index: number;
  onToggle: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
  formatTimestamp: (timestamp: Date) => string;
  getNotificationIcon: (displayType: string) => React.ReactElement;
}> = ({
  notification,
  expanded,
  compact,
  index,
  onToggle,
  onMarkRead,
  onDismiss,
  formatTimestamp,
  getNotificationIcon,
}) => {
  const expandable = notificationMessageNeedsExpansion(notification.message);
  const detailLines = getNotificationDetailLines(notification);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className={`relative border rounded-lg transition-all group hover:shadow-sm ${
        compact ? 'p-2' : 'p-3'
      } ${
        notification.isRead
          ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
          : 'border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/10'
      } ${expanded ? 'ring-1 ring-[#147FD4]/20 border-[#147FD4]/40' : ''}`}
    >
      <div className={`flex items-start ${compact ? 'space-x-2' : 'space-x-3'}`}>
        <div className="flex-shrink-0 mt-0.5">
          {React.cloneElement(getNotificationIcon(notification.displayType), {
            className: compact ? 'h-3 w-3' : 'h-4 w-4',
          })}
        </div>

        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={onToggle}
            className="no-drag w-full text-left"
            aria-expanded={expanded}
          >
            <div className="flex items-start justify-between gap-2">
              <h4
                className={`${compact ? 'text-xs' : 'text-sm'} font-medium ${
                  notification.isRead
                    ? 'text-gray-900 dark:text-white'
                    : 'text-gray-900 dark:text-white font-semibold'
                }`}
              >
                {notification.title}
              </h4>
              {(expandable || detailLines.length > 1) && (
                <motion.span
                  animate={{ rotate: expanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="shrink-0 text-gray-400"
                >
                  <ChevronDownIcon className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                </motion.span>
              )}
            </div>

            {!expanded && (
              <p
                className={`${compact ? 'text-xs mt-0.5' : 'text-xs mt-1'} text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2`}
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
                  <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
                    {notification.message}
                  </p>
                  {detailLines.length > 1 && (
                    <div className="rounded-md border border-gray-100 bg-gray-50/80 px-2.5 py-2 dark:border-gray-700/80 dark:bg-gray-900/40">
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
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className={`flex items-center justify-between ${compact ? 'mt-1' : 'mt-2'}`}>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {compact
                ? formatTimestamp(notification.timestamp).split(' ')[0]
                : formatTimestamp(notification.timestamp)}
            </span>

            {notification.actionRequired && !compact && (
              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded-full">
                Action Required
              </span>
            )}
          </div>
        </div>

        {compact ? (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-0.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Dismiss"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {!notification.isRead && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkRead();
                }}
                className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                title="Mark as read"
              >
                <EyeIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              title="Dismiss"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        )}
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
  const [filter, setFilter] = useState<'all' | 'unread' | 'actionRequired'>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((notificationId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      return next;
    });
  }, []);

  const visibleForViewer = useCallback(
    (items: UserNotificationApi[]) => filterNotificationsForViewer(items, viewerRole),
    [viewerRole],
  );

  const { subscribe, unsubscribe, isConnected } = useWebSocket();

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
    [facilityFilter, matchesScope, visibleForViewer]
  );

  useEffect(() => {
    setRows([]);
    setTotalAvailable(0);
    setLoadedOffset(0);
    setIsLoading(true);
    void loadNotifications({ offset: 0 });
  }, [facilityFilter, matchesScope, loadNotifications]);

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
            reference: null,
            facilityId: (data.facilityId as string) ?? null,
            metadata: null,
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
          void loadNotifications({ silent: true, offset: 0 });
          break;
        case 'notification_deleted': {
          const nid = data?.notificationId as string | undefined;
          if (!nid) break;
          setRows((prev) => prev.filter((r) => r.id !== nid));
          break;
        }
        default:
          break;
      }
    },
    [matchesScope, mergeById, loadNotifications, viewerRole]
  );

  useEffect(() => {
    if (!isConnected) return;
    const subId = subscribe('notifications', handleWs, undefined, wsFilters);
    return () => unsubscribe(subId);
  }, [subscribe, unsubscribe, isConnected, handleWs, wsFilters]);

  const markAsRead = async (notificationId: string) => {
    try {
      await apiService.markNotificationRead(notificationId);
      setRows((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
      );
    } catch (e) {
      console.error('Mark read failed', e);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      await apiService.deleteNotification(notificationId);
      setRows((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (e) {
      console.error('Delete notification failed', e);
    }
  };

  const markAllAsRead = async () => {
    try {
      await apiService.markAllNotificationsRead(facilityFilter);
      setRows((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      console.error('Mark all read failed', e);
    }
  };

  const clearRead = () => {
    setRows((prev) => prev.filter((n) => !n.isRead || n.actionRequired));
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadNotifications({ silent: false, offset: 0 });
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || loadedOffset >= totalAvailable) return;
    await loadNotifications({ append: true, offset: loadedOffset });
  };

  const hasMoreNotifications = loadedOffset < totalAvailable;

  const layout = getWidgetLayoutProfile(size);

  const filteredNotifications = useMemo(() => {
    return rows.filter((notification) => {
      if (filter === 'unread') return !notification.isRead;
      if (filter === 'actionRequired') return notification.actionRequired;
      return true;
    });
  }, [rows, filter]);

  const displayedNotifications = filteredNotifications.slice(0, layout.listCap);
  const unreadCount = useMemo(() => rows.filter((n) => !n.isRead).length, [rows]);

  const getNotificationIcon = (displayType: string) => {
    switch (displayType) {
      case 'error':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
      case 'success':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      default:
        return <BellIcon className="h-4 w-4 text-blue-500" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const diffMs = Date.now() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <Widget
      id={id}
      title={`${title} ${unreadCount > 0 ? `(${unreadCount})` : ''}`}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={handleSizeChange}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      enhancedMenu={
        <div className="space-y-1">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
          <button
            onClick={() => setFilter('all')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'all'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            All Notifications
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'unread'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Unread ({unreadCount})
          </button>
          <button
            onClick={() => setFilter('actionRequired')}
            className={`w-full px-3 py-2 text-left text-sm rounded ${
              filter === 'actionRequired'
                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            Action Required
          </button>
        </div>
      }
    >
      <div className={WIDGET_BODY_CLASS}>
        {(isWideWidgetSize(size) || layout.isTall) && (
          <div className="flex space-x-1 mb-3 shrink-0">
            {[
              { key: 'all', label: 'All', count: rows.length },
              { key: 'unread', label: 'Unread', count: unreadCount },
              {
                key: 'actionRequired',
                label: 'Action Required',
                count: rows.filter((n) => n.actionRequired).length,
              },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
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
              onClick={handleRefresh}
              className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
            >
              Try again
            </button>
          </div>
        ) : size !== 'small' ? (
          displayedNotifications.length > 0 ? (
          <div className={`${WIDGET_LIST_SCROLL_CLASS} space-y-2`}>
            <AnimatePresence>
                {displayedNotifications.map((notification, index) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    expanded={expandedIds.has(notification.id)}
                    compact={size === 'medium'}
                    index={index}
                    onToggle={() => toggleExpanded(notification.id)}
                    onMarkRead={() => void markAsRead(notification.id)}
                    onDismiss={() => void dismissNotification(notification.id)}
                    formatTimestamp={formatTimestamp}
                    getNotificationIcon={getNotificationIcon}
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
                    : 'No notifications'}
              </p>
            </div>
          )
        ) : null}

        {hasMoreNotifications && displayedNotifications.length > 0 && (
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
          unreadCount > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 shrink-0">
              <div className="flex space-x-2">
                <button
                  onClick={markAllAsRead}
                  className="flex-1 py-2 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Mark All Read
                </button>
                <button
                  onClick={clearRead}
                  className="flex-1 py-2 px-3 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                >
                  Hide Read
                </button>
              </div>
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
