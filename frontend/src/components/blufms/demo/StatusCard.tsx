import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  CurrencyDollarIcon,
  TruckIcon,
  BuildingOfficeIcon,
  SignalIcon,
  VideoCameraIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { StatusCardData, CardStatusColor } from '@/scripts/blufms/demoActionTypes';

interface StatusCardProps {
  card: StatusCardData;
}

const statusColorClasses: Record<CardStatusColor, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
  gray: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

const iconMap: Record<StatusCardData['type'], React.ComponentType<{ className?: string }>> = {
  security: ShieldCheckIcon,
  maintenance: WrenchScrewdriverIcon,
  payments: CurrencyDollarIcon,
  moveins: TruckIcon,
  occupancy: BuildingOfficeIcon,
  'blulok-network': SignalIcon,
  'sensor-cctv': VideoCameraIcon,
};

const defaultStatusColors: Record<StatusCardData['type'], CardStatusColor> = {
  security: 'orange',
  maintenance: 'yellow',
  payments: 'blue',
  moveins: 'blue',
  occupancy: 'blue',
  'blulok-network': 'green',
  'sensor-cctv': 'green',
};

// Varied loading messages based on card type and progress
const getLoadingMessage = (card: StatusCardData, progress: number): string => {
  const messages: Record<StatusCardData['type'], string[]> = {
    security: ['Scanning events...', 'Analyzing patterns...', 'Compiling report...', 'Reviewing incidents...'],
    maintenance: ['Checking work orders...', 'Calculating metrics...', 'Reviewing schedules...', 'Analyzing maintenance data...'],
    payments: ['Processing transactions...', 'Validating data...', 'Compiling totals...', 'Reviewing payment history...'],
    moveins: ['Checking reservations...', 'Processing move-ins...', 'Analyzing trends...', 'Compiling data...'],
    occupancy: ['Calculating metrics...', 'Analyzing trends...', 'Generating insights...', 'Compiling occupancy data...'],
    'blulok-network': ['Scanning nodes...', 'Checking connectivity...', 'Validating status...', 'Analyzing network health...'],
    'sensor-cctv': ['Analyzing sensor data...', 'Processing feeds...', 'Reviewing activity...', 'Compiling sensor metrics...'],
  };

  const cardMessages = messages[card.type] || ['Loading...'];
  const index = Math.min(Math.floor(progress / 33), cardMessages.length - 1);
  return cardMessages[index] || card.loadingMessage || 'Loading...';
};

export const StatusCard: React.FC<StatusCardProps> = ({
  card,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = card.icon || iconMap[card.type];
  const statusColor = card.statusColor || defaultStatusColors[card.type];
  const badgeColor = card.badge?.color || statusColor;

  const handleCardClick = () => {
    // Only allow expansion if card has significant details
    if (card.hasSignificantDetails && card.detailsContent) {
      setIsExpanded(!isExpanded);
    }
  };

  const isCollapsible = card.hasSignificantDetails && card.detailsContent;

  // Get subtle accent border color based on status
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

  const progressBarColor = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500',
  }[statusColor];

  const progress = card.loadingProgress || 0;
  const displayMessage = card.isLoading ? getLoadingMessage(card, progress) : (card.loadingMessage || '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`bg-white dark:bg-gray-800 rounded-lg border-l-2 ${accentBorderColor} border-r border-t border-b border-gray-200 dark:border-gray-700 p-3 shadow-md hover:shadow-lg transition-shadow duration-200 ${
        isCollapsible ? 'cursor-pointer' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Loading State - Simultaneous crossfade with content */}
      <AnimatePresence mode="wait">
        {card.isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="relative"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  className={`p-1.5 rounded ${iconBgColor} flex-shrink-0`}
                >
                  <Icon className={`h-4 w-4 ${iconTextColor}`} />
                </motion.div>
                <h3 className="text-xs font-medium text-gray-900 dark:text-white truncate">
                  {card.title}
                </h3>
              </div>
            </div>

            {/* Progress Bar with Gradient */}
            <div className="mb-2">
              <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className={`h-full relative ${progressBarColor}`}
                >
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                    className="absolute inset-0 bg-white/30"
                  />
                </motion.div>
              </div>
            </div>

            {/* Loading Message */}
            {displayMessage && (
              <motion.p
                key={displayMessage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-gray-500 dark:text-gray-400 truncate"
              >
                {displayMessage}
              </motion.p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
            className="relative"
          >
            {/* Header - Compact single line */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                <div className={`p-1.5 rounded ${iconBgColor} flex-shrink-0`}>
                  <Icon className={`h-4 w-4 ${iconTextColor}`} />
                </div>
                <h3 className="text-xs font-medium text-gray-900 dark:text-white truncate">
                  {card.title}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {card.badge && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColorClasses[badgeColor]}`}>
                    {card.badge.text}
                  </span>
                )}
                {isCollapsible && (
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                  >
                    <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                  </motion.div>
                )}
              </div>
            </div>

            {/* Primary Value */}
            <div className="mb-2">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                {card.primaryValue}
              </div>
              {card.secondaryValue && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {card.secondaryValue}
                </div>
              )}
            </div>

            {/* Expanded Details with smooth animation */}
            <AnimatePresence>
              {isExpanded && card.detailsContent && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    {card.detailsContent}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
