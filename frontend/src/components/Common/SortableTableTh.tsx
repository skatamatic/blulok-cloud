import { ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/20/solid';

export interface SortableTableThProps {
  label: string;
  columnKey: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (columnKey: string) => void;
  align?: 'left' | 'right';
  className?: string;
}

/**
 * Accessible sortable table header using primary accent when active.
 */
export function SortableTableTh({
  label,
  columnKey,
  sortBy,
  sortOrder,
  onSort,
  align = 'left',
  className = '',
}: SortableTableThProps) {
  const active = sortBy === columnKey;
  const textAlign = align === 'right' ? 'text-right' : 'text-left';
  const sortState = active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';
  const directionWord = sortOrder === 'desc' ? 'descending' : 'ascending';
  const sortButtonLabel = active
    ? `Sorted by ${label}, ${directionWord}. Activate to reverse sort order.`
    : `Sort by ${label}`;

  return (
    <th
      scope="col"
      aria-sort={sortState}
      className={`px-6 py-3 ${textAlign} text-xs font-medium uppercase tracking-wider ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        aria-label={sortButtonLabel}
        className={`group inline-flex items-center gap-0.5 rounded-md -mx-1 px-1 py-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${
          active
            ? 'text-primary-600 dark:text-primary-400'
            : 'text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400'
        }`}
      >
        <span>{label}</span>
        <span className="flex flex-col leading-none" aria-hidden>
          <ChevronUpIcon
            className={`h-3 w-3 -mb-1 ${active && sortOrder === 'asc' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'}`}
          />
          <ChevronDownIcon
            className={`h-3 w-3 ${active && sortOrder === 'desc' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'}`}
          />
        </span>
      </button>
    </th>
  );
}
