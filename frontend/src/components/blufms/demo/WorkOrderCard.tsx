import React from 'react';
import { WrenchScrewdriverIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { WorkOrderCardData } from '@/scripts/blufms/demoActionTypes';
import { CardLoadingPlaceholder } from './CardLoadingPlaceholder';

interface WorkOrderCardProps {
  card: WorkOrderCardData;
}

const priorityColors = {
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
  urgent: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
};

const statusColors = {
  open: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
  'in-progress': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400',
};

export const WorkOrderCard: React.FC<WorkOrderCardProps> = ({ card }) => {
  // Show loading placeholder if card is loading
  if (card.isLoading) {
    const statusColor = card.priority === 'urgent' ? 'red' : card.priority === 'high' ? 'orange' : card.priority === 'medium' ? 'yellow' : 'blue';
    return (
      <CardLoadingPlaceholder
        title={`Work Order #${card.workOrderNumber || '...'}`}
        progress={card.loadingProgress || 0}
        message={card.loadingMessage}
        statusColor={statusColor}
        icon={WrenchScrewdriverIcon}
      />
    );
  }

  const priorityBorderColor = {
    low: 'border-l-blue-400 dark:border-l-blue-500',
    medium: 'border-l-yellow-400 dark:border-l-yellow-500',
    high: 'border-l-orange-400 dark:border-l-orange-500',
    urgent: 'border-l-red-400 dark:border-l-red-500',
  }[card.priority];

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border-l-2 ${priorityBorderColor} border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-md hover:shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
            <WrenchScrewdriverIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Work Order #{card.workOrderNumber}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {card.issue} - Unit {card.unit}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${priorityColors[card.priority]}`}>
          {card.priority.charAt(0).toUpperCase() + card.priority.slice(1)}
        </span>
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[card.status]}`}>
          {card.status.charAt(0).toUpperCase() + card.status.slice(1).replace('-', ' ')}
        </span>
      </div>

      {card.assignedTo && (
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Assigned to: <span className="font-medium text-gray-900 dark:text-white">{card.assignedTo}</span>
        </div>
      )}

      {card.dueDate && (
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-2">
          <ClockIcon className="h-4 w-4 mr-1" />
          Due: {card.dueDate}
        </div>
      )}

      {card.completionEvidence && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center text-sm text-green-600 dark:text-green-400 mb-2">
            <CheckCircleIcon className="h-4 w-4 mr-1" />
            Completed
          </div>
          {card.completionEvidence.timestamp && (
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {card.completionEvidence.timestamp}
            </div>
          )}
          {card.completionEvidence.notes && (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {card.completionEvidence.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

