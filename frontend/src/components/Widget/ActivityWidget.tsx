import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';

interface ActivityItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  timestamp: string;
  user?: string;
}

interface ActivityWidgetProps {
  id: string;
  title: string;
  activities: ActivityItem[];
  initialSize?: WidgetSize;
  currentSize?: WidgetSize; // Add currentSize prop for external size changes
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

export const ActivityWidget: React.FC<ActivityWidgetProps> = ({
  id,
  title,
  activities,
  initialSize = 'medium',
  currentSize,
  availableSizes = ['medium', 'medium-tall', 'large', 'huge', 'large-wide', 'huge-wide'],
  onGridSizeChange,
  onRemove,
}) => {
  const [size, setSize] = useState<WidgetSize>(currentSize || initialSize);
  
  // Update size when currentSize prop changes (for external size changes like WebSocket sync)
  useEffect(() => {
    if (currentSize && currentSize !== size) {
      console.log(`📊 ActivityWidget ${id}: Size changed from ${size} to ${currentSize}`);
      setSize(currentSize);
    }
  }, [currentSize, id, size]);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'medium': return 4;
      case 'medium-tall': return 10;
      case 'large': return 8;
      case 'huge': return 12;
      case 'large-wide': return 10;
      case 'huge-wide': return 15;
      default: return 4;
    }
  };

  const maxItems = getMaxItems(size);
  const displayedActivities = activities.slice(0, maxItems);
  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-400';
      case 'warning':
        return 'bg-yellow-400';
      case 'error':
        return 'bg-red-400';
      case 'info':
        return 'bg-blue-400';
      default:
        return 'bg-gray-400';
    }
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
      className="group"
    >
      <div className="h-full flex flex-col">
        {displayedActivities.length > 0 ? (
          <div className="space-y-4 flex-1 min-h-0">
            {displayedActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-3 group/item hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg p-2 -m-2 transition-colors duration-200"
              >
                <div className="flex-shrink-0">
                  <div className={`h-2 w-2 ${getActivityColor(activity.type)} rounded-full mt-2`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                    {activity.message}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </p>
                    {activity.user && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {activity.user}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-400 dark:text-gray-500 mb-2">
                <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 00-2 2" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
            </div>
          </div>
        )}

        {activities.length > maxItems && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors duration-200">
              View all activity ({activities.length})
            </button>
          </div>
        )}
      </div>
    </Widget>
  );
};
