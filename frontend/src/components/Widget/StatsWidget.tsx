import React, { useState, useEffect } from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { motion } from 'framer-motion';

interface StatsWidgetProps {
  id: string;
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down' | 'neutral';
  };
  icon: React.ComponentType<{ className?: string }>;
  color?: 'blue' | 'green' | 'red' | 'yellow' | 'purple';
  initialSize?: WidgetSize;
  currentSize?: WidgetSize; // Add currentSize prop for external size changes
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  loading?: boolean;
  error?: string | null;
}

export const StatsWidget: React.FC<StatsWidgetProps> = ({
  id,
  title,
  value,
  change,
  icon: Icon,
  color = 'blue',
  initialSize = 'medium',
  currentSize,
  availableSizes = ['tiny', 'small', 'medium'],
  onGridSizeChange,
  onRemove,
  loading = false,
  error = null
}) => {
  const [size, setSize] = useState<WidgetSize>(currentSize || initialSize);
  
  // Update size when currentSize prop changes (for external size changes like WebSocket sync)
  useEffect(() => {
    if (currentSize && currentSize !== size) {
      console.log(`📊 StatsWidget ${id}: Size changed from ${size} to ${currentSize}`);
      setSize(currentSize);
    }
  }, [currentSize, id, size]);
  const colorClasses = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/20',
    green: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/20',
    red: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/20',
    yellow: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/20',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/20',
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'neutral') => {
    switch (trend) {
      case 'up':
        return (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 4.414 6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        );
      case 'down':
        return (
          <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M14.707 12.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 15.586l3.293-3.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const renderContent = () => {
    switch (size) {
      case 'tiny':
        return (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <motion.div 
              className={`p-2 rounded-lg ${colorClasses[color]} mb-2`}
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.2 }}
            >
              <Icon className="h-6 w-6" />
            </motion.div>
            <div className="text-xl font-bold text-gray-900 dark:text-white leading-none">
              {value}
            </div>
          </div>
        );

      case 'small':
        return (
          <div className="flex items-center justify-between h-full">
            <div className="flex-1 min-w-0">
              <motion.div 
                className="text-lg font-bold text-gray-900 dark:text-white leading-none"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {value}
              </motion.div>
              
              {change && (
                <div className="flex items-center space-x-1 text-xs mt-0.5">
                  {getTrendIcon(change.trend)}
                  <span className={
                    change.trend === 'up' 
                      ? 'text-green-600 dark:text-green-400' 
                      : change.trend === 'down' 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-gray-500 dark:text-gray-400'
                  }>
                    {change.value > 0 ? '+' : ''}{Math.abs(change.value)}%
                  </span>
                </div>
              )}
            </div>
            
            <motion.div 
              className={`p-1.5 rounded-lg ${colorClasses[color]} ml-2 flex-shrink-0`}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            >
              <Icon className="h-4 w-4" />
            </motion.div>
          </div>
        );

      case 'large':
        return (
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <motion.div 
                  className="text-4xl font-bold text-gray-900 dark:text-white mb-2"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {value}
                </motion.div>
                
                {change && (
                  <motion.div 
                    className="flex items-center space-x-2 text-base"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {getTrendIcon(change.trend)}
                    <span className={
                      change.trend === 'up' 
                        ? 'text-green-600 dark:text-green-400' 
                        : change.trend === 'down' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-gray-500 dark:text-gray-400'
                    }>
                      {Math.abs(change.value)}% vs last period
                    </span>
                  </motion.div>
                )}
              </div>
              
              <motion.div 
                className={`p-4 rounded-xl ${colorClasses[color]}`}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <Icon className="h-12 w-12" />
              </motion.div>
            </div>
            
            {/* Additional content for large widgets */}
            <div className="flex-1 grid grid-cols-2 gap-4 text-sm">
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">+5.2%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">This Month</div>
              </div>
              <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-lg font-semibold text-gray-900 dark:text-white">+12.8%</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">This Quarter</div>
              </div>
            </div>
          </div>
        );

      case 'huge':
        return (
          <div className="h-full flex flex-col">
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1">
                <motion.div 
                  className="text-5xl font-bold text-gray-900 dark:text-white mb-3"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {value}
                </motion.div>
                
                {change && (
                  <motion.div 
                    className="flex items-center space-x-2 text-lg"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    {getTrendIcon(change.trend)}
                    <span className={
                      change.trend === 'up' 
                        ? 'text-green-600 dark:text-green-400' 
                        : change.trend === 'down' 
                          ? 'text-red-600 dark:text-red-400' 
                          : 'text-gray-500 dark:text-gray-400'
                    }>
                      {Math.abs(change.value)}% vs last period
                    </span>
                  </motion.div>
                )}
                
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                  Comprehensive overview with detailed analytics and trends
                </p>
              </div>
              
              <motion.div 
                className={`p-6 rounded-2xl ${colorClasses[color]}`}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <Icon className="h-16 w-16" />
              </motion.div>
            </div>
            
            {/* Rich content for huge widgets */}
            <div className="flex-1 grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">+5.2%</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">This Month</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">vs last month</div>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">+12.8%</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">This Quarter</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">vs last quarter</div>
              </div>
              <div className="text-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">+28.3%</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">This Year</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">vs last year</div>
              </div>
            </div>
          </div>
        );

      case 'medium-tall':
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <motion.div 
                className="text-2xl font-bold text-gray-900 dark:text-white"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {value}
              </motion.div>
              
              <motion.div 
                className={`p-3 rounded-xl ${colorClasses[color]} flex-shrink-0`}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <Icon className="h-6 w-6" />
              </motion.div>
            </div>
            
            {change && (
              <motion.div 
                className="flex items-center space-x-2 text-sm mb-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {getTrendIcon(change.trend)}
                <span className={
                  change.trend === 'up' 
                    ? 'text-green-600 dark:text-green-400' 
                    : change.trend === 'down' 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-gray-500 dark:text-gray-400'
                }>
                  {Math.abs(change.value)}% vs last period
                </span>
              </motion.div>
            )}

            {/* Additional metrics for tall layout */}
            <div className="flex-1 space-y-3 text-sm">
              <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">This Month</span>
                <span className="font-medium text-gray-900 dark:text-white">{value}</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">Last Month</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {change ? Math.round(parseInt(String(value)) / (1 + change.value/100)) : value}
                </span>
              </div>
              <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400">Growth Rate</span>
                <span className={`font-medium ${
                  change?.trend === 'up' 
                    ? 'text-green-600 dark:text-green-400' 
                    : change?.trend === 'down' 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {change ? `${change.value > 0 ? '+' : ''}${change.value}%` : '0%'}
                </span>
              </div>
            </div>
          </div>
        );

      default: // medium
        return (
          <div className="flex items-center justify-between h-full min-h-0">
            <div className="flex-1 min-w-0">
              <motion.div 
                className="text-2xl font-bold text-gray-900 dark:text-white mb-2 truncate"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                {value}
              </motion.div>
              
              {change && (
                <motion.div 
                  className="flex items-center space-x-1 text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {getTrendIcon(change.trend)}
                  <span className={
                    change.trend === 'up' 
                      ? 'text-green-600 dark:text-green-400' 
                      : change.trend === 'down' 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-gray-500 dark:text-gray-400'
                  }>
                    {Math.abs(change.value)}%
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">vs last period</span>
                </motion.div>
              )}
            </div>
            
            <motion.div 
              className={`p-3 rounded-xl ${colorClasses[color]} ml-4 flex-shrink-0`}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
            >
              <Icon className="h-7 w-7" />
            </motion.div>
          </div>
        );
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
      className="group"
      onRemove={onRemove}
    >
      {loading ? (
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
        </div>
      ) : error ? (
        <div className="flex items-center justify-center h-full text-red-500 dark:text-red-400">
          <div className="text-center">
            <div className="text-sm font-medium">Error loading data</div>
            <div className="text-xs mt-1 opacity-75">{error}</div>
          </div>
        </div>
      ) : (
        renderContent()
      )}
    </Widget>
  );
};
