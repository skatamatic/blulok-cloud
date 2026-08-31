/** Shared Tailwind tokens for searchable filterable list views. */

export const filterBarShellClass =
  'overflow-visible rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800';

export const filterBarToolbarClass =
  'flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between';

export const filterBarSearchWrapClass = 'relative w-full sm:max-w-md';

export const filterBarSearchIconClass =
  'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500';

export const filterBarSearchInputClass =
  'input w-full rounded-lg py-2 pl-10 pr-3 text-sm';

export const filterBarActionsClass = 'flex shrink-0 flex-wrap items-center gap-2 sm:justify-end';

export const filterBarClearButtonClass =
  'btn-ghost btn-sm text-gray-600 dark:text-gray-400';

export const filterBarToggleClass = (expanded: boolean, hasActive: boolean) =>
  [
    'btn-secondary btn-sm gap-1.5',
    expanded ? 'ring-2 ring-primary-500/30 dark:ring-primary-400/30' : '',
    hasActive && !expanded ? 'border-primary-200 dark:border-primary-800' : '',
  ]
    .filter(Boolean)
    .join(' ');

export const filterBarActiveCountClass =
  'ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary-800 dark:bg-primary-900/40 dark:text-primary-300';

export const filterPanelClass =
  'overflow-visible border-t border-gray-200 bg-gray-50/80 px-4 py-5 dark:border-gray-700 dark:bg-gray-900/40 sm:px-5';

export const filterPanelGridClass =
  'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-5';

export const filterSectionCardClass =
  'overflow-visible rounded-lg border border-gray-200/90 bg-white p-3.5 shadow-sm dark:border-gray-700/90 dark:bg-gray-800/60';

export const filterComboboxDropdownClass =
  'z-[9999] bg-white dark:bg-gray-800 shadow-2xl max-h-60 rounded-lg py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none border border-gray-200 dark:border-gray-700';

export const filterSectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

export const filterSectionHeaderClass = 'mb-2.5 flex items-center gap-2';

export const filterSectionIconClass = 'flex h-4 w-4 shrink-0 items-center justify-center text-gray-400 dark:text-gray-500';

export const filterChipRowClass = 'flex flex-wrap gap-1.5';

export const filterSelectClass = 'input w-full rounded-lg py-2 text-sm';

export const filterFieldClass = 'w-full min-w-0';

export const filterDateRangeGridClass = 'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md';

export const filterDateFieldLabelClass =
  'mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400';

export const filterCollapsedSummaryClass =
  'flex flex-wrap gap-2 border-t border-gray-200 px-4 pb-4 pt-3 dark:border-gray-700';

export const filterCollapsedSummaryPillClass =
  'inline-flex items-center rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 ring-1 ring-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-900/50';

export const appliedFilterBarClass = 'flex flex-wrap items-center gap-2';

export const appliedFilterChipClass =
  'inline-flex max-w-full items-center gap-0.5 rounded-full bg-primary-50 py-1 pl-2.5 pr-1 text-xs font-medium text-primary-700 ring-1 ring-primary-100 transition-colors duration-150 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-900/50';

export const appliedFilterChipRemoveClass =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary-600 transition-colors duration-150 hover:bg-primary-100 hover:text-primary-800 active:bg-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300 dark:hover:bg-primary-900/60 dark:hover:text-primary-100 dark:active:bg-primary-900';

export const appliedFilterClearAllClass =
  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100 dark:active:bg-gray-600';

const FILTER_CHIP_SELECTED: Record<string, string> = {
  primary:
    'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800',
  green:
    'bg-green-50 text-green-700 ring-1 ring-green-200 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-800',
  blue: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800',
  yellow:
    'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:ring-yellow-800',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800',
  purple:
    'bg-purple-50 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:ring-purple-800',
  gray: 'bg-gray-100 text-gray-700 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600',
};

const FILTER_CHIP_IDLE =
  'bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700';

export function filterChipClassName(isSelected: boolean, color = 'primary'): string {
  const base =
    'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900';
  return `${base} ${isSelected ? FILTER_CHIP_SELECTED[color] ?? FILTER_CHIP_SELECTED.primary : FILTER_CHIP_IDLE}`;
}

export function filterSectionSpanClass(section: {
  span?: 'normal' | 'full';
  fullWidth?: boolean;
}): string {
  if (section.span === 'full' || section.fullWidth) {
    return 'sm:col-span-2 lg:col-span-3';
  }
  return '';
}

export function countActiveFilterSections(
  searchValue: string,
  sections: Array<{ selected: string; title: string }>,
): number {
  let count = searchValue.trim() ? 1 : 0;
  for (const section of sections) {
    if (!section.selected || section.selected === '' || section.selected === 'all') continue;
    if (section.selected === 'operational') continue;
    if (section.title.toLowerCase().includes('date') && section.selected === 'custom') continue;
    count += 1;
  }
  return count;
}
