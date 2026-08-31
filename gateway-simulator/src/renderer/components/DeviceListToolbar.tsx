import {
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { DeviceListFilters } from '../utils/device-inventory-list.utils';
import {
  DEVICE_SORT_COLUMNS,
  KIND_FILTER_OPTIONS,
  type DeviceSortColumn,
} from '../utils/device-inventory-list.utils';

type Props = {
  filters: DeviceListFilters;
  totalCount: number;
  visibleCount: number;
  onChange: (patch: Partial<DeviceListFilters>) => void;
  onClear: () => void;
};

export function DeviceListToolbar({ filters, totalCount, visibleCount, onChange, onClear }: Props) {
  const hasActiveFilters =
    filters.search.trim().length > 0 || filters.kind !== 'all' || filters.online !== 'all';

  const toggleSortDirection = () => {
    onChange({ sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' });
  };

  const cycleSortColumn = (column: DeviceSortColumn) => {
    if (filters.sortColumn === column) {
      toggleSortDirection();
      return;
    }
    onChange({ sortColumn: column, sortDirection: 'asc' });
  };

  return (
    <div className="device-list-toolbar">
      <div className="device-list-toolbar-filters">
        <div className="device-list-toolbar-search">
          <label className="device-toolbar-label" htmlFor="device-search">
            Search
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="device-search"
              type="search"
              className="input !pl-9"
              placeholder="ID, kind, firmware, state…"
              value={filters.search}
              onChange={(e) => onChange({ search: e.target.value })}
            />
          </div>
        </div>

        <div className="device-list-toolbar-selects">
          <div className="device-list-toolbar-field">
            <label className="device-toolbar-label" htmlFor="device-kind-filter">
              Kind
            </label>
            <select
              id="device-kind-filter"
              className="input"
              value={filters.kind}
              onChange={(e) => onChange({ kind: e.target.value as DeviceListFilters['kind'] })}
            >
              {KIND_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="device-list-toolbar-field">
            <label className="device-toolbar-label" htmlFor="device-online-filter">
              Online
            </label>
            <select
              id="device-online-filter"
              className="input"
              value={filters.online}
              onChange={(e) => onChange({ online: e.target.value as DeviceListFilters['online'] })}
            >
              <option value="all">All</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>
      </div>

      <div className="device-list-toolbar-meta">
        <div className="device-list-toolbar-sort">
          <span className="device-toolbar-label device-toolbar-label-inline">Sort by</span>
          <div className="device-sort-chip-row">
            {DEVICE_SORT_COLUMNS.map((col) => (
              <button
                key={col.id}
                type="button"
                className={`device-sort-chip ${filters.sortColumn === col.id ? 'device-sort-chip-active' : ''}`}
                onClick={() => cycleSortColumn(col.id)}
                aria-label={`Sort by ${col.label}${filters.sortColumn === col.id ? `, ${filters.sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
              >
                {col.label}
                {filters.sortColumn === col.id && (
                  <span className="device-sort-chip-direction" aria-hidden>
                    {filters.sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="device-list-toolbar-count">
          <span className="device-list-count">
            {visibleCount} of {totalCount} device{totalCount === 1 ? '' : 's'}
          </span>
          {hasActiveFilters && (
            <button type="button" className="device-list-clear-filters" onClick={onClear}>
              <XMarkIcon className="h-3.5 w-3.5" aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
