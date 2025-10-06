import React, { useState } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';

interface StatusItem {
  label: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  details?: string;
}

interface StatusWidgetProps {
  id: string;
  title: string;
  items: StatusItem[];
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
}

export const StatusWidget: React.FC<StatusWidgetProps> = ({
  id,
  title,
  items,
  initialSize = 'medium',
  availableSizes = ['small', 'medium', 'medium-tall', 'large', 'large-wide'],
  onGridSizeChange,
  onRemove,
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);

  const getMaxItems = (size: WidgetSize): number => {
    switch (size) {
      case 'tiny': return 2;
      case 'small': return 3;
      case 'medium': return 6;
      case 'medium-tall': return 10;
      case 'large': return 10;
      case 'large-wide': return 12;
      default: return 6;
    }
  };

  const maxItems = getMaxItems(size);
  const displayedItems = items.slice(0, maxItems);
  const getStatusColor = (status: StatusItem['status']) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'offline':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const getStatusDot = (status: StatusItem['status']) => {
    switch (status) {
      case 'online':
        return 'bg-green-400';
      case 'warning':
        return 'bg-yellow-400';
      case 'error':
        return 'bg-red-400';
      case 'offline':
        return 'bg-gray-400';
      default:
        return 'bg-gray-400';
    }
  };

  const formatStatus = (status: StatusItem['status']) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'warning':
        return 'Warning';
      case 'error':
        return 'Error';
      case 'offline':
        return 'Offline';
      default:
        return status;
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
        <div className={`${size === 'tiny' || size === 'small' ? 'space-y-2' : 'space-y-4'} flex-1 min-h-0`}>
          {displayedItems.map((item, index) => (
            <motion.div
              key={`${item.label}-${index}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-center ${size === 'tiny' || size === 'small' ? 'justify-center space-x-1.5' : 'justify-between'} group/item ${size === 'small' ? '' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'} rounded-lg ${size === 'small' ? 'p-1' : 'p-2'} -m-1 transition-colors duration-200`}
            >
              <div className={`flex items-center ${size === 'tiny' || size === 'small' ? 'space-x-2' : 'space-x-3'} flex-1 min-w-0`}>
                <div className="flex-shrink-0">
                  <div className={`h-3 w-3 ${getStatusDot(item.status)} rounded-full`}>
                    {item.status === 'online' && (
                      <motion.div
                        className="h-3 w-3 bg-green-400 rounded-full"
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </div>
                </div>
                {size !== 'tiny' && (
                  <div className="flex-1 min-w-0">
                    <p className={`${size === 'small' ? 'text-xs' : 'text-sm'} font-medium text-gray-900 dark:text-gray-100 truncate`}>
                      {size === 'small' ? item.label.split(' ')[0] : item.label}
                    </p>
                    {item.details && size !== 'small' && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {item.details}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {size !== 'tiny' && size !== 'small' && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                  {formatStatus(item.status)}
                </span>
              )}
            </motion.div>
          ))}
        </div>

        {displayedItems.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-gray-400 dark:text-gray-500 mb-2">
                <svg className="mx-auto h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No status data</p>
            </div>
          </div>
        )}
      </div>
    </Widget>
  );
};
