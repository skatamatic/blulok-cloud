import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { UserFilter } from './UserFilter';
import {
  countActiveFilterSections,
  filterBarActionsClass,
  filterBarActiveCountClass,
  filterBarClearButtonClass,
  filterBarSearchIconClass,
  filterBarSearchInputClass,
  filterBarSearchWrapClass,
  filterBarShellClass,
  filterBarToggleClass,
  filterBarToolbarClass,
  filterChipClassName,
  filterChipRowClass,
  filterCollapsedSummaryClass,
  filterCollapsedSummaryPillClass,
  filterPanelClass,
  filterPanelGridClass,
  filterFieldClass,
  filterSectionCardClass,
  filterSectionHeaderClass,
  filterSectionIconClass,
  filterSectionSpanClass,
  filterSectionTitleClass,
  filterSelectClass,
} from './list-filters.styles';

export interface FilterOption {
  key: string;
  label: string;
  color?: string;
}

export interface FilterSection {
  title: string;
  icon?: React.ReactNode;
  options: FilterOption[];
  selected: string;
  onSelect: (key: string) => void;
  type?: 'toggle' | 'select' | 'search' | 'buttons' | 'user' | 'custom';
  placeholder?: string;
  className?: string;
  customContent?: React.ReactNode;
  /** Span full width in the filter panel grid (e.g. tenant picker). */
  fullWidth?: boolean;
  /** Grid span: `full` spans the entire panel row. */
  span?: 'normal' | 'full';
}

export interface ExpandableFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sections: FilterSection[];
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onClearFilters?: () => void;
  className?: string;
  hasActiveFilters?: boolean;
}

function isSectionActive(section: FilterSection): boolean {
  if (!section.selected || section.selected === '' || section.selected === 'all') return false;
  if (section.selected === 'operational') return false;
  if (section.title.toLowerCase().includes('date') && section.selected === 'custom') return false;
  return true;
}

export const ExpandableFilters: React.FC<ExpandableFiltersProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  sections,
  isExpanded,
  onToggleExpanded,
  onClearFilters,
  className = '',
  hasActiveFilters: propHasActiveFilters,
}) => {
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = useMemo(
    () => countActiveFilterSections(searchValue, sections),
    [searchValue, sections],
  );

  useEffect(() => {
    if (propHasActiveFilters !== undefined) {
      setHasActiveFilters(propHasActiveFilters);
      return;
    }
    setHasActiveFilters(activeFilterCount > 0);
  }, [propHasActiveFilters, activeFilterCount]);

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

  const renderChipGroup = (section: FilterSection) => (
    <div className={filterChipRowClass}>
      {section.options.map((option) => {
        const isSelected = section.selected === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => section.onSelect(option.key)}
            className={filterChipClassName(isSelected, option.color || 'primary')}
            aria-pressed={isSelected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );

  const renderFilterSection = (section: FilterSection) => {
    if (section.type === 'search') {
      return (
        <div className={filterBarSearchWrapClass}>
          <div className={filterBarSearchIconClass}>
            <MagnifyingGlassIcon className="h-5 w-5" aria-hidden />
          </div>
          <input
            type="search"
            placeholder={section.placeholder || searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className={filterBarSearchInputClass}
            aria-label={section.placeholder || searchPlaceholder}
          />
        </div>
      );
    }

    if (section.type === 'select') {
      return (
        <select
          value={section.selected}
          onChange={(e) => section.onSelect(e.target.value)}
          className={filterSelectClass}
          aria-label={section.title}
        >
          {section.options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (section.type === 'buttons' || section.type === 'toggle' || !section.type) {
      return renderChipGroup(section);
    }

    if (section.type === 'user') {
      return (
        <UserFilter
          value={section.selected}
          onChange={section.onSelect}
          placeholder={section.placeholder || 'Search users...'}
          className={filterFieldClass}
        />
      );
    }

    if (section.type === 'custom' && section.customContent) {
      return section.customContent;
    }

    return renderChipGroup(section);
  };

  const activeSummary = sections.filter(isSectionActive);

  return (
    <div ref={containerRef} className={`${filterBarShellClass} ${className}`.trim()}>
      <div className={filterBarToolbarClass}>
        {renderFilterSection({
          title: 'Search',
          type: 'search',
          options: [],
          selected: '',
          onSelect: () => {},
          placeholder: searchPlaceholder,
        })}

        <div className={filterBarActionsClass}>
          {onClearFilters && hasActiveFilters && (
            <button type="button" onClick={onClearFilters} className={filterBarClearButtonClass}>
              <XMarkIcon className="mr-1 h-4 w-4" aria-hidden />
              Clear
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpanded}
            className={filterBarToggleClass(isExpanded, hasActiveFilters)}
            aria-expanded={isExpanded}
          >
            <FunnelIcon className="h-4 w-4" aria-hidden />
            Filters
            {hasActiveFilters && activeFilterCount > 0 && (
              <span className={filterBarActiveCountClass}>{activeFilterCount}</span>
            )}
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronDownIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {!isExpanded && activeSummary.length > 0 && (
        <div className={filterCollapsedSummaryClass}>
          {activeSummary.map((section) => {
            const label =
              section.options.find((option) => option.key === section.selected)?.label ||
              section.selected;
            return (
              <span key={section.title} className={filterCollapsedSummaryPillClass}>
                <span className="text-primary-500/80 dark:text-primary-400/80">{section.title}:</span>
                <span className="ml-1">{label}</span>
              </span>
            );
          })}
        </div>
      )}

      {isExpanded && sections.length > 0 && (
        <div className={filterPanelClass}>
          <div className={filterPanelGridClass}>
            {sections.map((section) => (
              <div
                key={section.title}
                className={`min-w-0 ${filterSectionSpanClass(section)} ${section.className || ''}`.trim()}
              >
                <div className={filterSectionCardClass}>
                  <div className={filterSectionHeaderClass}>
                    {section.icon ? (
                      <span className={filterSectionIconClass}>{section.icon}</span>
                    ) : null}
                    <h4 className={filterSectionTitleClass}>{section.title}</h4>
                  </div>
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
