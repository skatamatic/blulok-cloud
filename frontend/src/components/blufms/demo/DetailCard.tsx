import React, { useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import { DetailCardData } from '@/scripts/blufms/demoActionTypes';
import { CardLoadingPlaceholder } from './CardLoadingPlaceholder';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

interface DetailCardProps {
  card: DetailCardData;
}

export const DetailCard: React.FC<DetailCardProps> = ({ card }) => {
  const [isExpanded, setIsExpanded] = useState(card.showDetails || false);

  // Show loading placeholder if card is loading
  if (card.isLoading) {
    return (
      <CardLoadingPlaceholder
        title={card.title}
        progress={card.loadingProgress || 0}
        message={card.loadingMessage}
        statusColor="blue"
        icon={InformationCircleIcon}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border-l-2 border-l-primary-400 dark:border-l-primary-500 border-r border-t border-b border-gray-200 dark:border-gray-800 shadow-md hover:shadow-lg transition-all duration-200 animate-in fade-in slide-in-from-bottom-2">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {card.title}
          </h3>
          {card.detailsContent && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isExpanded ? (
                <ChevronUpIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              )}
            </button>
          )}
        </div>

        <div className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {card.content}
        </div>

        {card.detailsContent && (
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
          }`}>
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              {card.detailsContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

