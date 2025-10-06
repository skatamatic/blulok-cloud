import { useState, useEffect } from 'react';
import { 
  ClockIcon,
  UserIcon,
  LockClosedIcon,
  LockOpenIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';

interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  type: 'access' | 'lock' | 'unlock' | 'alert' | 'system' | 'user';
  message: string;
  user?: string;
  unit?: string;
  facility?: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

interface ActivityMonitorWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  facilityFilter?: string;
  maxEntries?: number;
}

// Mock data generator for realistic activity
const generateMockActivities = (count: number): ActivityLogEntry[] => {
  const activities: ActivityLogEntry[] = [];
  const now = new Date();
  
  const templates = [
    { type: 'access', message: 'Unit {unit} accessed by {user}', severity: 'info' },
    { type: 'lock', message: 'Unit {unit} locked remotely', severity: 'success' },
    { type: 'unlock', message: 'Unit {unit} unlocked by {user}', severity: 'info' },
    { type: 'alert', message: 'Low battery detected on Unit {unit}', severity: 'warning' },
    { type: 'alert', message: 'Unit {unit} left unlocked for 30+ minutes', severity: 'error' },
    { type: 'system', message: 'Gateway {facility} came online', severity: 'success' },
    { type: 'system', message: 'Backup completed successfully', severity: 'success' },
    { type: 'user', message: 'New user {user} registered', severity: 'info' },
    { type: 'system', message: 'Scheduled maintenance completed', severity: 'info' },
    { type: 'alert', message: 'Failed access attempt on Unit {unit}', severity: 'error' },
  ];

  const users = ['John Smith', 'Sarah Johnson', 'Mike Wilson', 'Lisa Chen', 'David Brown'];
  const units = ['A-101', 'B-205', 'C-312', 'A-150', 'B-088', 'C-401'];
  const facilities = ['Downtown Storage', 'Warehouse District', 'Airport Location'];

  for (let i = 0; i < count; i++) {
    const template = templates[Math.floor(Math.random() * templates.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const unit = units[Math.floor(Math.random() * units.length)];
    const facility = facilities[Math.floor(Math.random() * facilities.length)];
    
    const message = template.message
      .replace('{user}', user)
      .replace('{unit}', unit)
      .replace('{facility}', facility);

    activities.push({
      id: `activity-${i}`,
      timestamp: new Date(now.getTime() - (i * 15 * 60 * 1000) - Math.random() * 10 * 60 * 1000),
      type: template.type as any,
      message,
      user: template.message.includes('{user}') ? user : undefined,
      unit: template.message.includes('{unit}') ? unit : undefined,
      facility: template.message.includes('{facility}') ? facility : undefined,
      severity: template.severity as any
    });
  }

  return activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export const ActivityMonitorWidget: React.FC<ActivityMonitorWidgetProps> = ({
  id,
  title,
  initialSize = 'medium-tall',
  availableSizes = ['medium', 'medium-tall', 'large', 'large-wide', 'huge', 'huge-wide'],
  onGridSizeChange,
  onRemove,
  facilityFilter,
  maxEntries = 50
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'alerts' | 'access'>('all');

  useEffect(() => {
    loadActivities();
    // Simulate real-time updates
    const interval = setInterval(() => {
      if (Math.random() > 0.7) { // 30% chance every 30 seconds
        loadActivities();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [facilityFilter, maxEntries]);

  const loadActivities = async () => {
    setIsRefreshing(true);
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const mockActivities = generateMockActivities(maxEntries);
    setActivities(mockActivities);
    setIsRefreshing(false);
  };

  const getMaxDisplayItems = (size: WidgetSize): number => {
    switch (size) {
      case 'small': return 3;
      case 'medium': return 5;
      case 'medium-tall': return 12;
      case 'large': return 8;
      case 'large-wide': return 10;
      case 'huge': return 15;
      case 'huge-wide': return 20;
      default: return 5;
    }
  };

  const getActivityIcon = (type: string, severity: string) => {
    switch (type) {
      case 'access':
        return <KeyIcon className="h-4 w-4" />;
      case 'lock':
        return <LockClosedIcon className="h-4 w-4" />;
      case 'unlock':
        return <LockOpenIcon className="h-4 w-4" />;
      case 'user':
        return <UserIcon className="h-4 w-4" />;
      case 'alert':
        return severity === 'error' ? 
          <ExclamationTriangleIcon className="h-4 w-4" /> : 
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

  const displayedActivities = filteredActivities.slice(0, getMaxDisplayItems(size));

  const formatTimestamp = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return timestamp.toLocaleDateString();
  };

  const handleRefresh = async () => {
    await loadActivities();
  };

  return (
    <Widget
      id={id}
      title={title}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      enhancedMenu={
        <div className="space-y-1">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded flex items-center space-x-2 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
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
      <div className="space-y-2 h-full overflow-hidden flex flex-col">
        {/* Filter Tabs (for larger widgets) */}
        {(size === 'large' || size === 'huge' || size.includes('wide')) && (
          <div className="flex space-x-1 mb-3">
            {[
              { key: 'all', label: 'All', count: activities.length },
              { key: 'alerts', label: 'Alerts', count: activities.filter(a => a.severity === 'error' || a.severity === 'warning').length },
              { key: 'access', label: 'Access', count: activities.filter(a => ['access', 'lock', 'unlock'].includes(a.type)).length }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
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
        <div className="flex-1 space-y-2 overflow-y-auto">
          {isRefreshing ? (
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
          ) : displayedActivities.length > 0 ? (
            displayedActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="flex items-start space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors group"
              >
                <div className={`p-2 rounded-full ${getSeverityColor(activity.severity)} flex-shrink-0`}>
                  {getActivityIcon(activity.type, activity.severity)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-white leading-tight">
                    {activity.message}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(activity.timestamp)}
                    </span>
                    {activity.facility && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        • {activity.facility}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action button for larger widgets */}
                {(size === 'large' || size === 'huge' || size.includes('wide')) && (
                  <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-all">
                    <EyeIcon className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <ClockIcon className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
              >
                Refresh
              </button>
            </div>
          )}
        </div>

        {/* Footer with refresh button for smaller widgets */}
        {!['large', 'huge', 'large-wide', 'huge-wide'].includes(size) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full flex items-center justify-center space-x-2 py-2 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        )}
      </div>
    </Widget>
  );
};

