export interface SegmentedTab {
  key: string;
  label: string;
  count?: number;
}

interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}

export function SegmentedTabs({
  tabs,
  activeTab,
  onChange,
  className = '',
  size = 'md',
  ariaLabel = 'Sections',
}: SegmentedTabsProps) {
  const buttonSizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';

  return (
    <div
      className={`inline-flex w-full flex-wrap gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800/80 sm:w-auto ${className}`}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 sm:flex-none ${buttonSizeClass} ${
              isActive
                ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-700 dark:text-white dark:ring-gray-600/80'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  isActive
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                    : 'bg-gray-200/80 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
