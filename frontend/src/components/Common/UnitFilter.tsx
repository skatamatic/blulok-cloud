import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HomeIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { Unit } from '@/types/facility.types';
import { FilterComboboxEmptyOption } from '@/components/Common/FilterComboboxEmptyOption';
import { filterComboboxDropdownClass } from '@/components/Common/list-filters.styles';
import { useFilterDropdownPortal } from '@/hooks/useFilterDropdownPortal';

interface UnitFilterProps {
  value: string;
  onChange: (unitId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId?: string;
  disabled?: boolean;
  onDisplayLabelChange?: (label: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

function formatUnitLabel(unit: Unit): string {
  return unit.unit_number?.trim() || 'Unit';
}

function resolveUnitFromResponse(data: unknown): Unit | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { unit?: Unit; id?: string; unit_number?: string };
  if (record.unit && typeof record.unit === 'object') return record.unit;
  if (record.id && record.unit_number) return record as Unit;
  return null;
}

export const UnitFilter: React.FC<UnitFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search units...',
  className = '',
  facilityId,
  disabled = false,
  onDisplayLabelChange,
  allowEmpty = false,
  emptyLabel = 'All units',
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
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvingValueRef = useRef<string | null>(null);
  const userIsSearchingRef = useRef(false);
  const { dropdownRef, dropdownStyle } = useFilterDropdownPortal(isOpen, containerRef, [searchTerm]);

  const applySelectedUnit = useCallback(
    (unit: Unit | null) => {
      userIsSearchingRef.current = false;
      setSelectedUnit(unit);
      if (unit) {
        const label = formatUnitLabel(unit);
        setSearchTerm(label);
        onDisplayLabelChange?.(label);
      } else {
        setSearchTerm('');
        onDisplayLabelChange?.('');
      }
    },
    [onDisplayLabelChange],
  );

  const loadUnits = async (page: number = 1, isInitialLoad: boolean = false, search: string = '') => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const limit = 20;
      const offset = (page - 1) * limit;

      const filters: Record<string, unknown> = {
        search: search || undefined,
        limit,
        offset,
      };

      if (facilityId) {
        filters.facility_id = facilityId;
      }

      const response = await apiService.getUnits(filters);

      if (response.success || response.units) {
        const newUnits = response.units || [];
        const total = response.total || newUnits.length;

        if (isInitialLoad) {
          setUnits(newUnits);
          setFilteredUnits(newUnits);
        } else {
          setUnits((prev) => [...prev, ...newUnits]);
          setFilteredUnits((prev) => [...prev, ...newUnits]);
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

  useEffect(() => {
    loadUnits(1, true);
  }, [facilityId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!userIsSearchingRef.current) {
        return;
      }
      if (searchTerm.trim()) {
        setUnits([]);
        setFilteredUnits([]);
        setCurrentPage(1);
        setHasMore(true);
        loadUnits(1, true, searchTerm);
      } else {
        setUnits([]);
        setFilteredUnits([]);
        setCurrentPage(1);
        setHasMore(true);
        loadUnits(1, true);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, facilityId]);

  useEffect(() => {
    if (!value) {
      resolvingValueRef.current = null;
      applySelectedUnit(null);
      return;
    }

    const unit = units.find((u) => u.id === value);
    if (unit) {
      resolvingValueRef.current = null;
      applySelectedUnit(unit);
    }
  }, [value, units, applySelectedUnit]);

  useEffect(() => {
    if (!value) return;
    if (units.some((unit) => unit.id === value)) return;
    if (resolvingValueRef.current === value) return;

    resolvingValueRef.current = value;
    let cancelled = false;

    (async () => {
      try {
        const response = await apiService.getUnit(value);
        const fetched = resolveUnitFromResponse(response);
        if (cancelled || !fetched) return;
        applySelectedUnit(fetched);
        setUnits((prev) => (prev.some((u) => u.id === fetched.id) ? prev : [fetched, ...prev]));
        setFilteredUnits((prev) => (prev.some((u) => u.id === fetched.id) ? prev : [fetched, ...prev]));
      } catch (error) {
        console.error('Error resolving unit filter selection:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, facilityId, applySelectedUnit]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userIsSearchingRef.current = true;
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleUnitSelect = (unit: Unit) => {
    applySelectedUnit(unit);
    onChange(unit.id);
    setIsOpen(false);
  };

  const handleClear = () => {
    applySelectedUnit(null);
    onChange('');
    setIsOpen(false);
  };

  const handleInputFocus = () => {
    if (!disabled) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) {
      return;
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
        loadUnits(currentPage + 1, false, searchTerm);
      }
    },
    [currentPage, hasMore, loadingMore, searchTerm],
  );

  const loadMoreUnits = () => {
    if (hasMore && !loadingMore) {
      loadUnits(currentPage + 1, false, searchTerm);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'text-green-600 dark:text-green-400';
      case 'occupied':
        return 'text-blue-600 dark:text-blue-400';
      case 'maintenance':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'reserved':
        return 'text-purple-600 dark:text-purple-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const dropdown = isOpen && !disabled && (
    <div
      ref={dropdownRef}
      className={filterComboboxDropdownClass}
      style={dropdownStyle}
      onScroll={handleScroll}
      onMouseDown={(e) => e.preventDefault()}
    >
      {loading ? (
        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading units...</div>
      ) : (
        <>
          {allowEmpty && (
            <FilterComboboxEmptyOption label={emptyLabel} onSelect={handleClear} />
          )}
          {filteredUnits.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {searchTerm ? 'No units found' : 'No units available'}
            </div>
          ) : (
        <>
          {!searchTerm && (
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              All Units ({totalUnits})
            </div>
          )}
          {searchTerm && (
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Search Results ({totalUnits})
            </div>
          )}
          {filteredUnits.map((unit) => (
            <button
              key={unit.id}
              type="button"
              onClick={() => handleUnitSelect(unit)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                selectedUnit?.id === unit.id
                  ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                  : 'text-gray-900 dark:text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/20">
                      <span className="text-xs font-medium text-primary-800 dark:text-primary-200">
                        {unit.unit_number.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {unit.unit_number}
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {unit.unit_type && <span className="capitalize">{unit.unit_type}</span>}
                        {unit.primary_tenant && (
                          <span className="ml-1">
                            • {unit.primary_tenant.first_name} {unit.primary_tenant.last_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="ml-2 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  <div className={`text-right font-medium capitalize ${getStatusColor(unit.status)}`}>
                    {unit.status}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {hasMore && (
            <div className="border-t border-gray-200 dark:border-gray-700">
              {loadingMore ? (
                <div className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                  Loading more units...
                </div>
              ) : (
                <button
                  type="button"
                  onClick={loadMoreUnits}
                  className="w-full px-3 py-2 text-left text-sm text-primary-600 transition-colors hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
                >
                  Load more units ({totalUnits - filteredUnits.length} remaining)
                </button>
              )}
            </div>
          )}
        </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
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
          className={`block w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        />
      </div>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
};
