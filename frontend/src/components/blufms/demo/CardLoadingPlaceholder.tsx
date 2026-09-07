import React from 'react';
import { motion } from 'framer-motion';

interface CardLoadingPlaceholderProps {
  title: string;
  progress?: number;
  message?: string;
  statusColor?: 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'gray';
  icon?: React.ComponentType<{ className?: string }>;
}

export const CardLoadingPlaceholder: React.FC<CardLoadingPlaceholderProps> = ({
  title,
  progress = 0,
  message,
  statusColor = 'blue',
  icon: Icon,
}) => {
  const accentBorderColor = {
    green: 'border-l-green-400 dark:border-l-green-500',
    blue: 'border-l-blue-400 dark:border-l-blue-500',
    yellow: 'border-l-yellow-400 dark:border-l-yellow-500',
    orange: 'border-l-orange-400 dark:border-l-orange-500',
    red: 'border-l-red-400 dark:border-l-red-500',
    gray: 'border-l-gray-300 dark:border-l-gray-600',
  }[statusColor];

  const iconBgColor = {
    green: 'bg-green-50 dark:bg-green-900/20',
    blue: 'bg-blue-50 dark:bg-blue-900/20',
    yellow: 'bg-yellow-50 dark:bg-yellow-900/20',
    orange: 'bg-orange-50 dark:bg-orange-900/20',
    red: 'bg-red-50 dark:bg-red-900/20',
    gray: 'bg-gray-50 dark:bg-gray-900/20',
  }[statusColor];

  const iconTextColor = {
    green: 'text-green-600 dark:text-green-400',
    blue: 'text-blue-600 dark:text-blue-400',
    yellow: 'text-yellow-600 dark:text-yellow-400',
    orange: 'text-orange-600 dark:text-orange-400',
    red: 'text-red-600 dark:text-red-400',
    gray: 'text-gray-600 dark:text-gray-400',
  }[statusColor];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`bg-white dark:bg-gray-900 rounded-lg border-l-2 ${accentBorderColor} border-r border-t border-b border-gray-200 dark:border-gray-800 p-3 shadow-md`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2 flex-1 min-w-0">
          {Icon && (
            <div className={`p-1.5 rounded ${iconBgColor} flex-shrink-0`}>
              <Icon className={`h-4 w-4 ${iconTextColor}`} />
            </div>
          )}
          <h3 className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {title}
          </h3>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress || 0, 100)}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`h-full ${
              statusColor === 'green' ? 'bg-green-500' :
              statusColor === 'blue' ? 'bg-blue-500' :
              statusColor === 'yellow' ? 'bg-yellow-500' :
              statusColor === 'orange' ? 'bg-orange-500' :
              statusColor === 'red' ? 'bg-red-500' :
              'bg-gray-500'
            }`}
          />
        </div>
      </div>

      {/* Loading Message */}
      {message && (
        <motion.p
          key={message}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="text-xs text-gray-500 dark:text-gray-400 truncate"
        >
          {message}
        </motion.p>
      )}
    </motion.div>
  );
};

