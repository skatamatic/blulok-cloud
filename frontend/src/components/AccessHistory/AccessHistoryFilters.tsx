import { ExpandableFilters } from '@/components/Common/ExpandableFilters';
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
  QueueListIcon,
  ExclamationTriangleIcon,
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
  /** Default sessions; raw returns classic AccessLog event rows. */
  view?: 'sessions' | 'raw';
  /** Session state filter (e.g. open for currently-open chip). */
  state?: string;
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
  currentlyOpenCount?: number;
  /** DEV_ADMIN only — classic per-event rows. */
  canViewRaw?: boolean;
  onFilterChange: (key: keyof AccessHistoryFilterState, value: any) => void;
  onToggleNeedsAttention: () => void;
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
  currentlyOpenCount,
  canViewRaw = false,
  onFilterChange,
  onToggleNeedsAttention,
  onToggleExpanded,
  onClearFilters,
  onSetCustomDateRange,
  onSetUnitFilterLabel,
  onSetUserFilterLabel,
}: AccessHistoryFiltersProps) {
  const needsAttention = filters.state === 'open';
  const openCount = typeof currentlyOpenCount === 'number' ? currentlyOpenCount : 0;
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
      filters.state ||
      filters.view === 'raw' ||
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleNeedsAttention}
          aria-pressed={needsAttention}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
            needsAttention
              ? 'bg-rose-600 text-white ring-2 ring-rose-300 shadow-sm dark:bg-rose-500 dark:ring-rose-400/60'
              : openCount > 0
                ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-300 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:ring-rose-700 dark:hover:bg-rose-900/55'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          <ExclamationTriangleIcon className="h-3.5 w-3.5" />
          Needs attention
          <span
            className={`ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              needsAttention
                ? 'bg-white/25 text-white'
                : openCount > 0
                  ? 'bg-rose-200/90 text-rose-900 dark:bg-rose-800 dark:text-rose-100'
                  : 'bg-white/80 text-gray-800 dark:bg-gray-800 dark:text-gray-100'
            }`}
          >
            {openCount}
          </span>
        </button>
        {canViewRaw && (
          <button
            type="button"
            onClick={() =>
              onFilterChange('view', filters.view === 'raw' ? 'sessions' : 'raw')
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${
              filters.view === 'raw'
                ? 'bg-[#147FD4]/15 text-[#147FD4] ring-1 ring-[#147FD4]/40 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <QueueListIcon className="h-3.5 w-3.5" />
            Raw events
          </button>
        )}
      </div>

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
          facilityId: selectedFacilityId,
        },
        {
          title: 'Unit',
          icon: <HomeIcon className="h-4 w-4" />,
          type: 'unit',
          options: [],
          selected: filters.unit_id || '',
          selectedLabel: unitFilterLabel,
          onDisplayLabelChange: onSetUnitFilterLabel,
          onSelect: (value: string) => onFilterChange('unit_id', value || undefined),
          placeholder: 'Search units...',
          facilityId: selectedFacilityId,
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
    </div>
  );
}
