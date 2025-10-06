import React from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface ExpandableCardProps {
  children: React.ReactNode;
  expandedContent: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
  highlightId?: string;
}

export const ExpandableCard: React.FC<ExpandableCardProps> = ({
  children,
  expandedContent,
  isExpanded,
  onToggle,
  className = '',
  highlightId
}) => {
  return (
    <div 
      id={highlightId}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Main content - always visible */}
      <div 
        className="p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-200"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {children}
          </div>
          <div className="ml-4 flex-shrink-0">
            {isExpanded ? (
              <ChevronDownIcon className="h-5 w-5 text-gray-400 transition-transform duration-200" />
            ) : (
              <ChevronRightIcon className="h-5 w-5 text-gray-400 transition-transform duration-200" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="p-6">
            {expandedContent}
          </div>
        </div>
      )}
    </div>
  );
};



