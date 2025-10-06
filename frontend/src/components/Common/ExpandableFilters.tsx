import React, { useState, useRef, useEffect } from 'react';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon, 
  ChevronDownIcon, 
  ChevronUpIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { UserFilter } from './UserFilter';

interface FilterOption {
  key: string;
  label: string;
  color?: string;
}

interface FilterSection {
  title: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
  type?: 'toggle' | 'select' | 'search' | 'buttons' | 'user' | 'custom';
  placeholder?: string;
  className?: string;
  customContent?: React.ReactNode;
}

interface ExpandableFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sections: FilterSection[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClearFilters?: () => void;
  className?: string;
  hasActiveFilters?: boolean; // Allow parent to override active filter detection
}

export const ExpandableFilters: React.FC<ExpandableFiltersProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  sections,
  isExpanded,
  onToggleExpanded,
  onClearFilters,
  className = "",
  hasActiveFilters: propHasActiveFilters
}) => {
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if any filters are active
  useEffect(() => {
    if (propHasActiveFilters !== undefined) {
      setHasActiveFilters(propHasActiveFilters);
      return;
    }
    
    const active = searchValue.trim() !== '' || 
      sections.some(section => {
        // Check for non-empty, non-default selections
        if (section.selected === '' || section.selected === 'all' || section.selected === undefined) {
          return false;
        }
        // For date filters, check if both date_from and date_to are set
        if (section.title.toLowerCase().includes('date') && section.selected === 'custom') {
          return false; // Custom date range selection doesn't count as active until dates are set
        }
        return true;
      });
    setHasActiveFilters(active);
  }, [searchValue, sections, propHasActiveFilters]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        if (isExpanded) {
          onToggleExpanded();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, onToggleExpanded]);

  const renderFilterSection = (section: FilterSection) => {
    if (section.type === 'search') {
      return (
        <div key={section.title} className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={section.placeholder || searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      );
    }

    if (section.type === 'select') {
      return (
        <select
          value={section.selected}
          onChange={(e) => section.onSelect(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        >
          {section.options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (section.type === 'buttons') {
      return (
        <div className="flex flex-wrap gap-3">
          {section.options.map((option) => {
            const isSelected = section.selected === option.key;
            const colorClass = option.color || 'primary';
            
            return (
              <button
                key={option.key}
                onClick={() => section.onSelect(option.key)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                  isSelected
                    ? getSelectedButtonClass(colorClass)
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      );
    }

    if (section.type === 'user') {
      return (
        <UserFilter
          value={section.selected}
          onChange={section.onSelect}
          placeholder={section.placeholder || 'Search users...'}
          className="w-full"
          // style={{ minWidth: '400px', maxWidth: '500px' }}
        />
      );
    }

    if (section.type === 'custom' && section.customContent) {
      return section.customContent;
    }

    // Default toggle buttons
    return (
      <div className="flex flex-wrap gap-3">
        {section.options.map((option) => {
          const isSelected = section.selected === option.key;
          const colorClass = option.color || 'primary';
          
          return (
            <button
              key={option.key}
              onClick={() => section.onSelect(option.key)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                isSelected
                  ? getSelectedButtonClass(colorClass)
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  };

  const getSelectedButtonClass = (colorClass: string) => {
    const colorMap: Record<string, string> = {
      'primary': 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300 border border-primary-200 dark:border-primary-700 shadow-sm',
      'green': 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300 border border-green-200 dark:border-green-700 shadow-sm',
      'blue': 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-700 shadow-sm',
      'yellow': 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700 shadow-sm',
      'red': 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300 border border-red-200 dark:border-red-700 shadow-sm',
      'purple': 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300 border border-purple-200 dark:border-purple-700 shadow-sm',
      'gray': 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm'
    };
    
    return colorMap[colorClass] || colorMap['primary'];
  };

  return (
    <div ref={containerRef} className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Always visible search and basic filters */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1 max-w-md">
            {renderFilterSection({
              title: 'Search',
              type: 'search',
              options: [],
              selected: '',
              onSelect: () => {},
              placeholder: searchPlaceholder
            })}
          </div>
          
          <div className="flex items-center space-x-3 ml-4">
            {/* Clear Filters button */}
            {onClearFilters && hasActiveFilters && (
              <button
                onClick={onClearFilters}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors duration-200"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Clear Filters
              </button>
            )}
            
            
            {/* Expand/Collapse button */}
            <button
              onClick={onToggleExpanded}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              Filters
              {isExpanded ? (
                <ChevronUpIcon className="h-4 w-4 ml-2" />
              ) : (
                <ChevronDownIcon className="h-4 w-4 ml-2" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expandable advanced filters */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-8 bg-gray-50 dark:bg-gray-900/50">
          <div className="flex flex-wrap gap-8">
            {sections.map((section) => (
              <div key={section.title} className={`${section.className || ''} min-w-0 flex-shrink-0`} style={{ minWidth: '320px', maxWidth: '450px' }}>
                <div className="flex items-center space-x-2 mb-4">
                  {section.icon && <div className="text-gray-400">{section.icon}</div>}
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {section.title}
                  </h4>
                </div>
                <div className="px-2">
                  {renderFilterSection(section)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
