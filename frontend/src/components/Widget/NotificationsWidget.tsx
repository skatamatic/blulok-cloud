import React, { useState, useEffect, useCallback } from 'react';
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
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { AccessLog } from '@/types/access-history.types';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  isRead: boolean;
  actionRequired: boolean;
  source: 'system' | 'device' | 'user' | 'security';
  metadata?: {
    unitId?: string;
    userId?: string;
    deviceId?: string;
    facilityId?: string;
  };
}

interface NotificationsWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

/**
 * Transform an AccessLog from the API into a Notification for display.
 * Only important events (failures, security events, etc.) are shown as notifications.
 */
const transformAccessLogToNotification = (log: AccessLog): Notification | null => {
  // Only create notifications for significant events
  const isScheduleViolation = log.action === 'schedule_violation';
  const isManualOverride = log.action === 'manual_override';
  
  // Skip successful routine operations - they are not notification-worthy
  // Exception: manual_override actions and emergency methods should always create notifications
  if (log.success && !isScheduleViolation && !isManualOverride && !['manual_override', 'emergency'].includes(log.method)) {
    return null;
  }

  let title = '';
  let message = '';
  let type: Notification['type'] = 'info';
  let source: Notification['source'] = 'system';
  let actionRequired = false;

  const unitNumber = log.unit_number || log.device_name || 'Unknown unit';
  const userName = log.user_name || log.primary_tenant_name || 'Unknown user';
  const facilityName = log.facility_name || 'Unknown facility';

  if (log.action === 'access_denied') {
    title = 'Access Denied';
    message = `Failed access attempt on ${unitNumber} by ${userName}`;
    if (log.denial_reason) {
      message += ` - ${log.denial_reason.replace(/_/g, ' ')}`;
    }
    type = 'error';
    source = 'security';
    actionRequired = true;
  } else if (log.action === 'invalid_credential') {
    title = 'Invalid Credential';
    message = `Invalid credential used on ${unitNumber}`;
    type = 'error';
    source = 'security';
    actionRequired = true;
  } else if (log.action === 'system_error') {
    title = 'System Error';
    message = `Error on ${unitNumber}${log.reason ? ': ' + log.reason : ''}`;
    type = 'error';
    source = 'device';
    actionRequired = true;
  } else if (log.action === 'timeout') {
    title = 'Device Timeout';
    message = `${unitNumber} did not respond`;
    type = 'warning';
    source = 'device';
    actionRequired = false;
  } else if (log.action === 'schedule_violation') {
    title = 'Schedule Violation';
    message = `${userName} accessed ${unitNumber} outside schedule`;
    type = 'warning';
    source = 'security';
    actionRequired = true;
  } else if (log.action === 'manual_override') {
    title = 'Manual Override';
    message = `${userName} used manual override on ${unitNumber}`;
    type = 'warning';
    source = 'security';
    actionRequired = false;
  } else if (!log.success) {
    title = 'Operation Failed';
    message = `${log.action.replace(/_/g, ' ')} failed on ${unitNumber}`;
    type = 'error';
    source = 'device';
    actionRequired = true;
  } else {
    // Other successful events that we want to notify about (emergency access, etc.)
    title = 'Access Event';
    message = `${log.action.replace(/_/g, ' ')} on ${unitNumber}`;
    type = 'info';
    source = 'system';
  }

  return {
    id: log.id,
    title,
    message: `${message} at ${facilityName}`,
    type,
    timestamp: new Date(log.occurred_at),
    isRead: false,
    actionRequired,
    source,
    metadata: {
      unitId: log.unit_id,
      userId: log.user_id,
      deviceId: log.device_id,
      facilityId: log.facility_id,
    },
  };
};

export const NotificationsWidget: React.FC<NotificationsWidgetProps> = ({
  id,
  title,
  initialSize = 'medium-tall',
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onGridSizeChange,
  onRemove
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'actionRequired'>('unread');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  
  const { subscribe, unsubscribe, isConnected } = useWebSocket();

  const loadNotifications = useCallback(async () => {
    setError(null);
    
    try {
      // Fetch recent access logs, filtering for important events (failures, denials)
      const response = await apiService.getAccessHistory({
        limit: 50,
        offset: 0,
        // Note: Backend will filter based on user permissions
      });

      if (response.success && response.logs) {
        const transformedNotifications = response.logs
          .map(transformAccessLogToNotification)
          .filter((n: Notification | null): n is Notification => n !== null)
          .map((n: Notification) => ({
            ...n,
            isRead: readNotificationIds.has(n.id),
          }));
        
        setNotifications(transformedNotifications);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError('Failed to load notifications');
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [readNotificationIds]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Subscribe to real-time access log updates
  useEffect(() => {
    if (!isConnected) return;

    const handleAccessLogUpdate = (data: { log?: AccessLog; logs?: AccessLog[] }) => {
      const newLogs = data.logs || (data.log ? [data.log] : []);
      
      const newNotifications = newLogs
        .map(transformAccessLogToNotification)
        .filter((n): n is Notification => n !== null);

      if (newNotifications.length > 0) {
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const uniqueNew = newNotifications.filter(n => !existingIds.has(n.id));
          return [...uniqueNew, ...prev].slice(0, 100); // Keep max 100 notifications
        });
      }
    };

    const subscriptionId = subscribe('access_logs', handleAccessLogUpdate);

    return () => {
      unsubscribe(subscriptionId);
    };
  }, [subscribe, unsubscribe, isConnected]);

  const markAsRead = (notificationId: string) => {
    setReadNotificationIds(prev => new Set(prev).add(notificationId));
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  };

  const dismissNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const markAllAsRead = () => {
    const allIds = new Set(notifications.map(n => n.id));
    setReadNotificationIds(prev => new Set([...prev, ...allIds]));
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const clearRead = () => {
    setNotifications(prev => prev.filter(n => !n.isRead || n.actionRequired));
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadNotifications();
  };

  const getMaxDisplayItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 2;
      case 'medium': return 4;
      case 'medium-tall': return 8;
      case 'large': return 6;
      case 'large-wide': return 8;
      case 'huge': return 10;
      case 'huge-wide': return 12;
      default: return 4;
    }
  };

  const filteredNotifications = notifications.filter(notification => {
    if (filter === 'unread') return !notification.isRead;
    if (filter === 'actionRequired') return notification.actionRequired;
    return true;
  });

  const displayedNotifications = filteredNotifications.slice(0, getMaxDisplayItems(size));
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
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
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
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
      <div className="h-full flex flex-col">
        {/* Filter Tabs (for larger widgets) */}
        {(size === 'large' || size === 'huge' || size.includes('wide')) && (
          <div className="flex space-x-1 mb-3">
            {[
              { key: 'all', label: 'All', count: notifications.length },
              { key: 'unread', label: 'Unread', count: unreadCount },
              { key: 'actionRequired', label: 'Action Required', count: notifications.filter(n => n.actionRequired).length }
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

        {/* Loading State */}
        {isLoading && notifications.length === 0 ? (
          <div className="flex-1 space-y-2">
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
          /* Notifications List - Hide for small widgets */
          <div className="flex-1 space-y-2 overflow-y-auto">
            <AnimatePresence>
              {displayedNotifications.length > 0 ? (
                displayedNotifications.map((notification, index) => (
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
                        {React.cloneElement(getNotificationIcon(notification.type), {
                          className: size === 'medium' ? 'h-3 w-3' : 'h-4 w-4'
                        })}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <h4 className={`${size === 'medium' ? 'text-xs' : 'text-sm'} font-medium truncate ${
                            notification.isRead 
                              ? 'text-gray-900 dark:text-white' 
                              : 'text-gray-900 dark:text-white font-semibold'
                          }`}>
                            {notification.title}
                          </h4>
                        </div>
                        
                        {/* Show message only for larger sizes or truncated for medium */}
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
                            {size === 'medium' ? formatTimestamp(notification.timestamp).split(' ')[0] : formatTimestamp(notification.timestamp)}
                          </span>
                          
                          {notification.actionRequired && size !== 'medium' && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 rounded-full">
                              Action Required
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons - Simplified for medium */}
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
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <BellIcon className="h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {filter === 'unread' ? 'No unread notifications' : 
                     filter === 'actionRequired' ? 'No actions required' : 
                     'No notifications'}
                  </p>
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : null}

        {/* Quick Actions Footer */}
        {(size === 'medium-tall' || size === 'large' || size === 'huge' || size.includes('wide')) && unreadCount > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
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
                Clear Read
              </button>
            </div>
          </div>
        )}

        {/* Compact view for small widgets */}
        {size === 'small' && (
          <div className="h-full flex flex-col justify-center text-center">
            <div className="relative mb-2">
              <BellIcon className="h-8 w-8 text-gray-600 dark:text-gray-400 mx-auto" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {notifications.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
};
