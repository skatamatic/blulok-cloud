import React from 'react';
import { EnvelopeIcon, DevicePhoneMobileIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { MessagePreviewCardData } from '@/scripts/blufms/demoActionTypes';

interface MessagePreviewCardProps {
  card: MessagePreviewCardData;
}

const statusIcons = {
  sent: CheckCircleIcon,
  pending: ClockIcon,
  failed: XCircleIcon,
};

const statusColors = {
  sent: 'text-green-600 dark:text-green-400',
  pending: 'text-yellow-600 dark:text-yellow-400',
  failed: 'text-red-600 dark:text-red-400',
};

export const MessagePreviewCard: React.FC<MessagePreviewCardProps> = ({ card }) => {
  const StatusIcon = card.status ? statusIcons[card.status] : null;

  const borderColor = card.status === 'sent' 
    ? 'border-l-green-400 dark:border-l-green-500'
    : card.status === 'failed'
    ? 'border-l-red-400 dark:border-l-red-500'
    : 'border-l-yellow-400 dark:border-l-yellow-500';

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border-l-2 ${borderColor} border-r border-t border-b border-gray-200 dark:border-gray-700 p-4 shadow-md hover:shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-bottom-2`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary-50 dark:bg-primary-900/20">
            {card.messageType === 'email' ? (
              <EnvelopeIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            ) : (
              <DevicePhoneMobileIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {card.messageType === 'email' ? 'Email' : 'SMS'}
            </h3>
            {card.subject && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {card.subject}
              </p>
            )}
          </div>
        </div>
        {StatusIcon && card.status && (
          <StatusIcon className={`h-5 w-5 ${statusColors[card.status]}`} />
        )}
      </div>

      <div className="space-y-2 text-sm">
        {card.from && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">From: </span>
            <span className="text-gray-900 dark:text-white">{card.from}</span>
          </div>
        )}
        <div>
          <span className="text-gray-500 dark:text-gray-400">To: </span>
          <span className="text-gray-900 dark:text-white">{card.to}</span>
        </div>
        {card.timestamp && (
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {card.timestamp}
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {card.body}
        </p>
      </div>
    </div>
  );
};

