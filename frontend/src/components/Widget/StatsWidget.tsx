import React from 'react';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';
import { useWidgetSizeState } from '@/hooks/useWidgetSizeState';
import {
  StatKpiContent,
  StatTinyContent,
  statTinyLabel,
  TINY_TILE_LABEL_CLASS,
  TINY_TILE_SPINNER_CLASS,
} from '@/components/Widget/widget-content.utils';
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
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  readOnly?: boolean;
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
  onSizeChange,
  onGridSizeChange,
  onRemove,
  readOnly,
  loading = false,
  error = null
}) => {
  const { size, handleSizeChange } = useWidgetSizeState(
    currentSize,
    initialSize,
    onSizeChange
  );
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
          <StatTinyContent
            icon={Icon}
            value={value}
            label={title}
            iconClassName={colorClasses[color]}
          />
        );

      case 'small':
      case 'medium':
        return (
          <StatKpiContent
            icon={Icon}
            value={value}
            iconClassName={colorClasses[color]}
            size={size === 'medium' ? 'medium' : 'small'}
          />
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
                
              </div>
              
              <motion.div 
                className={`p-6 rounded-2xl ${colorClasses[color]}`}
                whileHover={{ scale: 1.05 }}
                transition={{ duration: 0.2 }}
              >
                <Icon className="h-16 w-16" />
              </motion.div>
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
          </div>
        );

      default:
        return (
          <StatKpiContent
            icon={Icon}
            value={value}
            iconClassName={colorClasses[color]}
            size="medium"
          />
        );
    }
  };

  return (
    <Widget
      id={id}
      title={title}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={handleSizeChange}
      onGridSizeChange={onGridSizeChange}
      className="group"
      onRemove={onRemove}
      readOnly={readOnly}
      suppressTitleOverlay={size === 'tiny'}
    >
      {loading ? (
        size === 'tiny' ? (
          <div className="flex h-full min-h-0 w-full flex-col gap-0.5">
            <div
              className={`flex flex-1 items-center justify-center rounded-[7px] ${colorClasses[color]}`}
            >
              <div className={TINY_TILE_SPINNER_CLASS} />
            </div>
            {statTinyLabel(title) ? (
              <span className={`${TINY_TILE_LABEL_CLASS} text-gray-500 dark:text-gray-400`}>
                {statTinyLabel(title)}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center">
            <div
              className={`animate-spin rounded-full border-2 border-[#147FD4]/30 border-t-[#147FD4] ${
                size === 'small' ? 'h-5 w-5' : 'h-8 w-8'
              }`}
            />
          </div>
        )
      ) : error ? (
        <div className="flex items-center justify-center h-full min-h-0 text-red-500 dark:text-red-400 px-2">
          <div className="text-center">
            <div className={`font-medium ${size === 'tiny' ? 'text-xs' : 'text-sm'}`}>
              Error loading data
            </div>
            <div className="text-xs mt-1 opacity-75 line-clamp-2">{error}</div>
          </div>
        </div>
      ) : (
        renderContent()
      )}
    </Widget>
  );
};
