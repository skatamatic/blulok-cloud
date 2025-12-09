import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { ChecklistCardData } from '@/scripts/blufms/demoActionTypes';
import { CardLoadingPlaceholder } from './CardLoadingPlaceholder';

interface ChecklistCardProps {
  card: ChecklistCardData;
}

export const ChecklistCard: React.FC<ChecklistCardProps> = ({
  card,
}) => {
  if (card.items.length === 0 && !card.isLoading) return null;

  const allCompleted = card.items.every(item => item.completed);
  const completedCount = card.items.filter(item => item.completed).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border-l-2 border-l-primary-400 dark:border-l-primary-500 border-r border-t border-b border-gray-200 dark:border-gray-800 p-3 shadow-md">
      <AnimatePresence mode="wait">
        {card.isLoading ? (
          <CardLoadingPlaceholder
            key="loading"
            title={card.title}
            progress={card.loadingProgress || 0}
            message={card.loadingMessage}
            statusColor="blue"
          />
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white">
                {card.title}
              </h3>
              {allCompleted && card.completionMessage && (
                <span className="text-xs font-medium text-green-600 dark:text-green-400">
                  {card.completionMessage}
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {card.items.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`
                    flex items-center gap-2.5 py-1.5 px-2 rounded transition-all duration-200
                    ${item.completed 
                      ? 'bg-green-50 dark:bg-green-900/20' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }
                  `}
                >
                  <div className={`
                    flex-shrink-0 w-4 h-4 rounded flex items-center justify-center transition-all duration-200
                    ${item.completed 
                      ? 'bg-green-500 dark:bg-green-400 shadow-sm' 
                      : 'bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600'
                    }
                  `}>
                    {item.completed && (
                      <CheckCircleIcon className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className={`
                      text-xs font-medium
                      ${item.completed 
                        ? 'text-green-700 dark:text-green-300' 
                        : 'text-gray-700 dark:text-gray-300'
                      }
                    `}>
                      {item.label}
                    </span>
                    {item.timestamp && item.completed && (
                      <>
                        <span className="text-xs text-gray-400 dark:text-gray-500">•</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {item.timestamp}
                        </span>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
            {!allCompleted && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {completedCount} of {card.items.length} completed
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

