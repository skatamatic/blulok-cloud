import { ArrowDownTrayIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

interface AccessHistoryExportMenuProps {
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (type: 'all' | 'filtered') => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
}

export function AccessHistoryExportMenu({
  loading,
  open,
  onOpenChange,
  onExport,
  dropdownRef,
}: AccessHistoryExportMenuProps) {
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => onOpenChange(!open)}
        disabled={loading}
        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {loading ? (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-gray-600 dark:border-gray-300" />
        ) : (
          <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
        )}
        {loading ? 'Exporting...' : 'Export'}
        <ChevronDownIcon className="ml-2 h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-10 mt-2 w-48 rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="py-1">
            <button
              onClick={() => onExport('filtered')}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Export Current Filter
            </button>
            <button
              onClick={() => onExport('all')}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Export All Data
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
