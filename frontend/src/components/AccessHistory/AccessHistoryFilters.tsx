import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
import { UnitFilter } from '@/components/Common/UnitFilter';
import {
  filterDateFieldLabelClass,
  filterDateRangeGridClass,
  filterSelectClass,
} from '@/components/Common/list-filters.styles';
import {
  buildAccessHistoryActionFilterOptions,
  buildAccessHistoryMethodFilterOptions,
} from '@/constants/accessHistory.constants';
import { toLocalDateInputValue } from '@/utils/datetime.utils';
import {
  CheckCircleIcon,
  CalendarIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  UserIcon,
  HomeIcon,
} from '@heroicons/react/24/outline';

export interface AccessHistoryFilterState {
  facility_id?: string;
  unit_id?: string;
  user_id?: string;
  action?: string;
  method?: string;
  success?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const defaultAccessHistoryDateFilters = (): Pick<AccessHistoryFilterState, 'date_from' | 'date_to' | 'limit'> => {
  const today = toLocalDateInputValue();
  const weekAgo = toLocalDateInputValue(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  return {
    date_from: weekAgo,
    date_to: today,
    limit: 50,
  };
};

interface AccessHistoryFiltersProps {
  filters: AccessHistoryFilterState;
  filtersExpanded: boolean;
  isCustomDateRange: boolean;
  unitFilterLabel?: string;
  userFilterLabel?: string;
  selectedFacilityId?: string;
  onFilterChange: (key: keyof AccessHistoryFilterState, value: any) => void;
  onToggleExpanded: () => void;
  onClearFilters: () => void;
  onSetCustomDateRange: (value: boolean) => void;
  onSetUnitFilterLabel: (label?: string) => void;
  onSetUserFilterLabel: (label?: string) => void;
}

export function AccessHistoryFilters({
  filters,
  filtersExpanded,
  isCustomDateRange,
  unitFilterLabel,
  userFilterLabel,
  selectedFacilityId,
  onFilterChange,
  onToggleExpanded,
  onClearFilters,
  onSetCustomDateRange,
  onSetUnitFilterLabel,
  onSetUserFilterLabel,
}: AccessHistoryFiltersProps) {
  const getCurrentDateRangeSelection = () => {
    if (isCustomDateRange) return 'custom';
    
    if (!filters.date_from || !filters.date_to) return '';
    
    const now = new Date();
    const today = toLocalDateInputValue(now);
    const weekAgo = toLocalDateInputValue(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const monthAgo = toLocalDateInputValue(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    
    if (filters.date_from === today && filters.date_to === today) return 'today';
    if (filters.date_from === weekAgo && filters.date_to === today) return 'week';
    if (filters.date_from === monthAgo && filters.date_to === today) return 'month';
    
    return 'custom';
  };

  const hasActiveFilters = () => {
    return !!(
      filters.search?.trim() ||
      filters.action ||
      filters.success !== undefined ||
      filters.user_id ||
      filters.unit_id ||
      filters.method ||
      (filters.date_from && filters.date_to && getCurrentDateRangeSelection() === 'custom')
    );
  };

  const handleDateRangeSelect = (value: string) => {
    if (value === 'custom') {
      onSetCustomDateRange(true);
    } else if (value === '') {
      onSetCustomDateRange(false);
      onFilterChange('date_from', undefined);
      onFilterChange('date_to', undefined);
    } else {
      onSetCustomDateRange(false);
      const now = new Date();
      let dateFrom = '';
      const dateTo = toLocalDateInputValue(now);

      switch (value) {
        case 'today': {
          dateFrom = toLocalDateInputValue(now);
          break;
        }
        case 'week': {
          dateFrom = toLocalDateInputValue(
            new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          );
          break;
        }
        case 'month': {
          dateFrom = toLocalDateInputValue(
            new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          );
          break;
        }
      }

      onFilterChange('date_from', dateFrom);
      onFilterChange('date_to', dateTo);
    }
  };

  return (
    <ExpandableFilters
      searchValue={filters.search || ''}
      onSearchChange={(value) => onFilterChange('search', value || undefined)}
      searchPlaceholder="Search by user, facility, action, or IP..."
      isExpanded={filtersExpanded}
      onToggleExpanded={onToggleExpanded}
      hasActiveFilters={hasActiveFilters()}
      onClearFilters={onClearFilters}
      sections={[
        {
          title: 'Status',
          icon: <CheckCircleIcon className="h-4 w-4" />,
          type: 'buttons',
          span: 'full',
          options: [
            { key: 'all', label: 'All', color: 'primary' },
            { key: 'success', label: 'Success', color: 'green' },
            { key: 'failed', label: 'Failed', color: 'red' },
          ],
          selected:
            filters.success === undefined
              ? 'all'
              : filters.success === true
                ? 'success'
                : 'failed',
          onSelect: (value) => {
            if (value === 'all') {
              onFilterChange('success', undefined);
            } else if (value === 'success') {
              onFilterChange('success', true);
            } else {
              onFilterChange('success', false);
            }
          },
        },
        {
          title: 'Date Range',
          icon: <CalendarIcon className="h-4 w-4" />,
          type: 'buttons',
          span: 'full',
          options: [
            { key: '', label: 'All Time', color: 'primary' },
            { key: 'today', label: 'Today', color: 'gray' },
            { key: 'week', label: 'This Week', color: 'gray' },
            { key: 'month', label: 'This Month', color: 'gray' },
            { key: 'custom', label: 'Custom', color: 'gray' },
          ],
          selected: getCurrentDateRangeSelection(),
          onSelect: handleDateRangeSelect,
        },
        {
          title: 'Action',
          icon: <KeyIcon className="h-4 w-4" />,
          type: 'select',
          options: buildAccessHistoryActionFilterOptions(),
          selected: filters.action || '',
          onSelect: (value: string) => onFilterChange('action', value || undefined),
        },
        {
          title: 'Method',
          icon: <DevicePhoneMobileIcon className="h-4 w-4" />,
          type: 'select',
          options: buildAccessHistoryMethodFilterOptions(),
          selected: filters.method || '',
          onSelect: (value: string) => onFilterChange('method', value || undefined),
        },
        {
          title: 'User',
          icon: <UserIcon className="h-4 w-4" />,
          type: 'user',
          options: [],
          selected: filters.user_id || '',
          selectedLabel: userFilterLabel,
          onDisplayLabelChange: onSetUserFilterLabel,
          onSelect: (value: string) => onFilterChange('user_id', value || undefined),
          placeholder: 'Search users...',
        },
        {
          title: 'Unit',
          icon: <HomeIcon className="h-4 w-4" />,
          type: 'custom',
          options: [],
          selected: filters.unit_id || '',
          selectedLabel: unitFilterLabel,
          onSelect: () => {},
          customContent: (
            <UnitFilter
              value={filters.unit_id || ''}
              onChange={(unitId) => onFilterChange('unit_id', unitId || undefined)}
              onDisplayLabelChange={onSetUnitFilterLabel}
              placeholder="Search units..."
              facilityId={selectedFacilityId}
              className="w-full min-w-0"
            />
          ),
        },
        ...(getCurrentDateRangeSelection() === 'custom'
          ? [
              {
                title: 'Custom Date Range',
                icon: <CalendarIcon className="h-4 w-4" />,
                type: 'custom' as const,
                span: 'full' as const,
                options: [],
                selected: '',
                onSelect: () => {},
                customContent: (
                  <div className={filterDateRangeGridClass}>
                    <div>
                      <label className={filterDateFieldLabelClass}>From Date</label>
                      <input
                        type="date"
                        value={filters.date_from || ''}
                        onChange={(e) =>
                          onFilterChange('date_from', e.target.value || undefined)
                        }
                        className={filterSelectClass}
                      />
                    </div>
                    <div>
                      <label className={filterDateFieldLabelClass}>To Date</label>
                      <input
                        type="date"
                        value={filters.date_to || ''}
                        onChange={(e) =>
                          onFilterChange('date_to', e.target.value || undefined)
                        }
                        className={filterSelectClass}
                      />
                    </div>
                  </div>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
