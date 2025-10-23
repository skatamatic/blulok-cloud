import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HomeIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit } from '@/types/facility.types';

interface UnitFilterProps {
  value: string;
  onChange: (unitId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId?: string; // Filter units by facility
  disabled?: boolean;
}

export const UnitFilter: React.FC<UnitFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search units...',
  className = '',
  facilityId,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [units, setUnits] = useState<Unit[]>([]);
  const [filteredUnits, setFilteredUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalUnits, setTotalUnits] = useState(0);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // const scrollRef = useRef<HTMLDivElement>(null);

  // Load units on component mount or when facilityId changes
  useEffect(() => {
    loadUnits(1, true);
  }, [facilityId]);

  // Load units when search term changes (with debouncing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm.trim()) {
        // Reset and load fresh results for new search
        setUnits([]);
        setFilteredUnits([]);
        setCurrentPage(1);
        setHasMore(true);
        loadUnits(1, true, searchTerm);
      } else {
        // Reset to show all units
        setUnits([]);
        setFilteredUnits([]);
        setCurrentPage(1);
        setHasMore(true);
        loadUnits(1, true);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchTerm, facilityId]);

  // Find selected unit when value changes
  useEffect(() => {
    if (value && units.length > 0) {
      const unit = units.find(u => u.id === value);
      setSelectedUnit(unit || null);
      if (unit) {
        setSearchTerm(unit.unit_number);
      }
    } else if (value === '') {
      // Only clear when value is explicitly set to empty string
      setSelectedUnit(null);
      setSearchTerm('');
    }
  }, [value, units]);

  const loadUnits = async (page: number = 1, isInitialLoad: boolean = false, search: string = '') => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const limit = 20;
      const offset = (page - 1) * limit;
      
      // Build filters
      const filters: any = {
        search: search || undefined,
        limit,
        offset
      };

      // Add facility filter if provided
      if (facilityId) {
        filters.facility_id = facilityId;
      }
      
      const response = await apiService.getUnits(filters);
      
      // Handle both success and direct response formats
      if (response.success || response.units) {
        const newUnits = response.units || [];
        const total = response.total || newUnits.length;
        
        if (isInitialLoad) {
          setUnits(newUnits);
          setFilteredUnits(newUnits);
        } else {
          setUnits(prev => [...prev, ...newUnits]);
          setFilteredUnits(prev => [...prev, ...newUnits]);
        }
        
        setTotalUnits(total);
        setCurrentPage(page);
        setHasMore((isInitialLoad ? newUnits.length : units.length + newUnits.length) < total);
      }
    } catch (error) {
      console.error('Error loading units:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setIsOpen(true);
    
    // Don't clear the selection when typing - only clear when explicitly clearing
  };

  const handleUnitSelect = (unit: Unit) => {
    setSelectedUnit(unit);
    setSearchTerm(unit.unit_number);
    onChange(unit.id);
    setIsOpen(false);
  };

  // const handleClear = () => {
  //   setSelectedUnit(null);
  //   setSearchTerm('');
  //   onChange('');
  //   setIsOpen(false);
  //   inputRef.current?.focus();
  // };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    // Don't close if clicking on dropdown
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    
    // Don't automatically clear the search term - let the user keep typing
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    
    // Load more when user scrolls to within 50px of the bottom
    if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
      loadUnits(currentPage + 1, false, searchTerm);
    }
  }, [currentPage, hasMore, loadingMore, searchTerm]);

  const loadMoreUnits = () => {
    if (hasMore && !loadingMore) {
      loadUnits(currentPage + 1, false, searchTerm);
    }
  };

  // const getUnitDisplayText = (unit: Unit) => {
  //   const parts = [unit.unit_number];
  //   if (unit.unit_type) {
  //     parts.push(`(${unit.unit_type})`);
  //   }
  //   if (unit.primary_tenant) {
  //     parts.push(`- ${unit.primary_tenant.first_name} ${unit.primary_tenant.last_name}`);
  //   }
  //   return parts.join(' ');
  // };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'text-green-600 dark:text-green-400';
      case 'occupied': return 'text-blue-600 dark:text-blue-400';
      case 'maintenance': return 'text-yellow-600 dark:text-yellow-400';
      case 'reserved': return 'text-purple-600 dark:text-purple-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <HomeIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-w-xs bg-white dark:bg-gray-800 shadow-lg max-h-48 rounded-md py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none border border-gray-200 dark:border-gray-700"
          onScroll={handleScroll}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Loading units...
            </div>
          ) : filteredUnits.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No units found' : 'No units available'}
            </div>
          ) : (
            <>
              {!searchTerm && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  All Units ({totalUnits})
                </div>
              )}
              {searchTerm && (
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                  Search Results ({totalUnits})
                </div>
              )}
              {filteredUnits.map((unit) => (
                <button
                  key={unit.id}
                  onClick={() => handleUnitSelect(unit)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    selectedUnit?.id === unit.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <div className="flex-shrink-0 h-8 w-8 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-primary-800 dark:text-primary-200">
                            {unit.unit_number.charAt(0)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {unit.unit_number}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {unit.unit_type && (
                              <span className="capitalize">{unit.unit_type}</span>
                            )}
                            {unit.primary_tenant && (
                              <span className="ml-1">
                                • {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400">
                      <div className="text-right">
                        <div className={`font-medium capitalize ${getStatusColor(unit.status)}`}>
                          {unit.status}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
              
              {/* Load More Section */}
              {hasMore && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {loadingMore ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                      Loading more units...
                    </div>
                  ) : (
                    <button
                      onClick={loadMoreUnits}
                      className="w-full text-left px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      Load more units ({totalUnits - filteredUnits.length} remaining)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
