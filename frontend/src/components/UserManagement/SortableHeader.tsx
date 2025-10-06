import React from 'react';
import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  currentSortBy: string;
  currentSortOrder: 'asc' | 'desc';
  onSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  className?: string;
}

export const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  sortKey,
  currentSortBy,
  currentSortOrder,
  onSort,
  className = '',
}) => {
  const isActive = currentSortBy === sortKey;
  
  const handleClick = () => {
    if (isActive) {
      // Toggle order if already sorting by this column
      onSort(sortKey, currentSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Default to desc for new column
      onSort(sortKey, 'desc');
    }
  };

  return (
    <th className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider ${className}`}>
      <button
        onClick={handleClick}
        className="flex items-center space-x-1 hover:text-gray-700 dark:hover:text-gray-100 transition-colors duration-200 focus:outline-none focus:text-gray-700 dark:focus:text-gray-100"
      >
        <span>{label}</span>
        <div className="flex flex-col">
          <ChevronUpIcon 
            className={`h-3 w-3 ${
              isActive && currentSortOrder === 'asc' 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-300 dark:text-gray-600'
            }`} 
          />
          <ChevronDownIcon 
            className={`h-3 w-3 -mt-1 ${
              isActive && currentSortOrder === 'desc' 
                ? 'text-primary-600 dark:text-primary-400' 
                : 'text-gray-300 dark:text-gray-600'
            }`} 
          />
        </div>
      </button>
    </th>
  );
};
