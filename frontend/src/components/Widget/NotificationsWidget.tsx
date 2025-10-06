import React, { useState, useEffect } from 'react';
import { 
  BellIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion, AnimatePresence } from 'framer-motion';

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

// Mock notification generator
const generateMockNotifications = (): Notification[] => {
  const notifications: Notification[] = [
    {
      id: 'notif-1',
      title: 'Low Battery Alert',
      message: 'Unit A-101 BluLok device battery is at 15%',
      type: 'warning',
      timestamp: new Date(Date.now() - 5 * 60 * 1000),
      isRead: false,
      actionRequired: true,
      source: 'device'
    },
    {
      id: 'notif-2', 
      title: 'Unauthorized Access Attempt',
      message: 'Failed access attempt detected on Unit B-205',
      type: 'error',
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      isRead: false,
      actionRequired: true,
      source: 'security'
    },
    {
      id: 'notif-3',
      title: 'New User Registration',
      message: 'Sarah Johnson has been added to Downtown Storage',
      type: 'success',
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      isRead: true,
      actionRequired: false,
      source: 'user'
    },
    {
      id: 'notif-4',
      title: 'Gateway Connection Restored',
      message: 'Warehouse District gateway is back online',
      type: 'success',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      isRead: true,
      actionRequired: false,
      source: 'system'
    },
    {
      id: 'notif-5',
      title: 'Unit Left Unlocked',
      message: 'Unit C-312 has been unlocked for over 2 hours',
      type: 'warning',
      timestamp: new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      isRead: false,
      actionRequired: true,
      source: 'security'
    }
  ];

  return notifications.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
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
  const [filter, setFilter] = useState<'all' | 'unread' | 'actionRequired'>('unread');

  useEffect(() => {
    loadNotifications();
    // Simulate real-time notifications
    const interval = setInterval(() => {
      if (Math.random() > 0.8) { // 20% chance every 30 seconds
        addRandomNotification();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 300));
    const mockNotifications = generateMockNotifications();
    setNotifications(mockNotifications);
  };

  const addRandomNotification = () => {
    const newNotification: Notification = {
      id: `notif-${Date.now()}`,
      title: 'Real-time Alert',
      message: 'New activity detected in the system',
      type: 'info',
      timestamp: new Date(),
      isRead: false,
      actionRequired: false,
      source: 'system'
    };
    
    setNotifications(prev => [newNotification, ...prev]);
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );
  };

  const dismissNotification = (notificationId: string) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
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
                onClick={() => setFilter(key as any)}
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

        {/* Notifications List - Hide for small widgets */}
        {size !== 'small' && (
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
        )}

        {/* Quick Actions Footer */}
        {(size === 'medium-tall' || size === 'large' || size === 'huge' || size.includes('wide')) && unreadCount > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                }}
                className="flex-1 py-2 px-3 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Mark All Read
              </button>
              <button
                onClick={() => {
                  setNotifications(prev => prev.filter(n => !n.isRead || n.actionRequired));
                }}
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
