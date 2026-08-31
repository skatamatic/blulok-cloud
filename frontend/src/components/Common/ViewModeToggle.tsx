import { Squares2X2Icon, TableCellsIcon } from '@heroicons/react/24/outline';

export type ListViewMode = 'grid' | 'table';

interface ViewModeToggleProps {
  value: ListViewMode;
  onChange: (mode: ListViewMode) => void;
  className?: string;
  /** When false, only icons (compact toolbar). */
  showText?: boolean;
  /** When true, neither option looks selected (e.g. a third tab is active). */
  noneSelected?: boolean;
}

/**
 * Cards (grid) vs table switcher; matches dashboard pill styling and theme.
 */
export function ViewModeToggle({
  value,
  onChange,
  className = '',
  showText = true,
  noneSelected = false,
}: ViewModeToggleProps) {
  const cardsOn = !noneSelected && value === 'grid';
  const tableOn = !noneSelected && value === 'table';
  return (
    <div className={`inline-flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ${className}`} role="group" aria-label="View mode">
      <button
        type="button"
        onClick={() => onChange('grid')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          cardsOn
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        aria-pressed={cardsOn}
        title={showText ? undefined : 'Card view'}
        aria-label={showText ? undefined : 'Card view'}
      >
        <Squares2X2Icon className="h-4 w-4 shrink-0" aria-hidden />
        {showText ? <span>Cards</span> : null}
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          tableOn
            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
        aria-pressed={tableOn}
        title={showText ? undefined : 'Table view'}
        aria-label={showText ? undefined : 'Table view'}
      >
        <TableCellsIcon className="h-4 w-4 shrink-0" aria-hidden />
        {showText ? <span>Table</span> : null}
      </button>
    </div>
  );
}
