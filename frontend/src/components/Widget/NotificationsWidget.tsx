import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useAuth } from '@/contexts/AuthContext';
import type { UserNotificationApi } from '@/types/notifications.types';
import {
  mapApiNotificationToDashboardView,
} from '@/utils/notification-display.utils';
import {
  getWidgetLayoutProfile,
  isWideWidgetSize,
  WIDGET_BODY_CLASS,
  WIDGET_LIST_SCROLL_CLASS,
} from '@/utils/widget-layout.utils';

type DisplayNotification = ReturnType<typeof mapApiNotificationToDashboardView>;

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

function matchesFacilityFilter(
  n: UserNotificationApi,
  facilityFilter: string | undefined,
  allowedFacilityIds: string[] | undefined,
  canAccessAllFacilities: boolean,
): boolean {
  if (facilityFilter) {
    return n.facilityId === facilityFilter;
  }
  if (canAccessAllFacilities) {
    return true;
  }
  if (!n.facilityId) {
    return false;
  }
  if (!allowedFacilityIds?.length) {
    return false;
  }
  return allowedFacilityIds.includes(n.facilityId);
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
  const { authState } = useAuth();
  const canAccessAllFacilities =
    authState.user?.role === 'admin' || authState.user?.role === 'dev_admin';
  const allowedFacilityIds = authState.user?.facilityIds;

  const notificationWsFilters = useMemo(() => {
    if (facilityFilter) {
      return { facilityId: facilityFilter };
    }
    if (!canAccessAllFacilities && allowedFacilityIds?.length) {
      return { facilityIds: allowedFacilityIds };
    }
    return undefined;
  }, [facilityFilter, canAccessAllFacilities, allowedFacilityIds]);

  const matchesScope = useCallback(
    (n: UserNotificationApi) =>
      matchesFacilityFilter(n, facilityFilter, allowedFacilityIds, canAccessAllFacilities),
    [facilityFilter, allowedFacilityIds, canAccessAllFacilities],
  );
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
  const [rows, setRows] = useState<DisplayNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'actionRequired'>('unread');

  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  const mergeById = useCallback((incoming: UserNotificationApi[]) => {
    setRows((prev) => {
      const map = new Map<string, DisplayNotification>();
      prev.forEach((p) => map.set(p.id, p));
      incoming.forEach((raw) => {
        if (!matchesScope(raw)) return;
        const v = mapApiNotificationToDashboardView(raw);
        map.set(v.id, v);
      });
      return Array.from(map.values()).sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
    });
  }, [matchesScope]);

  const loadNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setError(null);
    try {
      const response = await apiService.getNotifications({
        facilityId: facilityFilter,
        limit: 50,
        offset: 0,
      });
      if (response.success && response.notifications) {
        const mapped = response.notifications
          .filter((n) => matchesScope(n))
          .map(mapApiNotificationToDashboardView);
        setRows(mapped);
      } else {
        setRows([]);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      if (!silent) {
        setError('Failed to load notifications');
        setRows([]);
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [facilityFilter, matchesScope]);

  useEffect(() => {
    setRows([]);
    setIsLoading(true);
    loadNotifications();
  }, [loadNotifications]);

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
          void loadNotifications({ silent: true });
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
    [matchesScope, mergeById, loadNotifications]
  );

  useEffect(() => {
    if (!isConnected) return;
    const subId = subscribe('notifications', handleWs, undefined, notificationWsFilters);
    return () => unsubscribe(subId);
  }, [subscribe, unsubscribe, isConnected, handleWs, notificationWsFilters]);

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
    await loadNotifications({ silent: false });
  };

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
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05, duration: 0.3 }}
                    className={`relative ${
                      size === 'medium' ? 'p-2' : 'p-3'
                    } border rounded-lg transition-all group hover:shadow-sm ${
                      notification.isRead
                        ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                        : 'border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/10'
                    }`}
                  >
                    <div className={`flex items-start ${size === 'medium' ? 'space-x-2' : 'space-x-3'}`}>
                      <div className="flex-shrink-0 mt-0.5">
                        {React.cloneElement(getNotificationIcon(notification.displayType), {
                          className: size === 'medium' ? 'h-3 w-3' : 'h-4 w-4',
                        })}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <h4
                            className={`${size === 'medium' ? 'text-xs' : 'text-sm'} font-medium truncate ${
                              notification.isRead
                                ? 'text-gray-900 dark:text-white'
                                : 'text-gray-900 dark:text-white font-semibold'
                            }`}
                          >
                            {notification.title}
                          </h4>
                        </div>

                        {size === 'medium' ? (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                            {notification.message}
                          </p>
                        ) : (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                            {notification.message}
                          </p>
                        )}

                        <div className={`flex items-center justify-between ${size === 'medium' ? 'mt-1' : 'mt-2'}`}>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {size === 'medium'
                              ? formatTimestamp(notification.timestamp).split(' ')[0]
                              : formatTimestamp(notification.timestamp)}
                          </span>

                          {notification.actionRequired && size !== 'medium' && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded-full">
                              Action Required
                            </span>
                          )}
                        </div>
                      </div>

                      {size === 'medium' ? (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => dismissNotification(notification.id)}
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
                              onClick={() => markAsRead(notification.id)}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                              title="Mark as read"
                            >
                              <EyeIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => dismissNotification(notification.id)}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            title="Dismiss"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
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
