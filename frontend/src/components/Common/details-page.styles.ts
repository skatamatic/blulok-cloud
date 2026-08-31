/** Shared Tailwind tokens for unit/device/access-group detail views. */

export const detailsBtnPrimarySm = 'btn-primary btn-sm';
export const detailsBtnSecondarySm = 'btn-secondary btn-sm';
export const detailsBtnDangerSm = 'btn-danger btn-sm';
export const detailsBtnLinkSm =
  'inline-flex items-center text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300';

export const detailsBtnDangerOutlineSm =
  'inline-flex shrink-0 items-center rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30';

export function detailsUnlockButtonClass(opts: {
  pending: boolean;
  canUnlock: boolean;
  size?: 'sm' | 'md';
}): string {
  const sizeClass = opts.size === 'sm' ? 'btn-sm' : 'px-4 py-2 text-sm';
  const base = `inline-flex items-center justify-center rounded-lg border border-transparent font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-gray-900 ${sizeClass}`;

  if (opts.pending) {
    return `${base} bg-blue-600 text-white animate-pulse focus:ring-blue-500`;
  }
  if (opts.canUnlock) {
    return `${base} bg-green-600 text-white hover:bg-green-700 focus:ring-green-500`;
  }
  return `${base} bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300`;
}

export const detailsOverviewCardInsetClass = 'space-y-6 p-6';

export const overviewAlertErrorClass =
  'rounded-lg border border-red-200 bg-red-50/70 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20';

export const overviewAlertErrorTextClass = 'text-sm text-red-700 dark:text-red-300';

export const overviewAlertWarningClass =
  'rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/25';

export const overviewCalloutPrimaryClass =
  'rounded-lg border border-primary-200 bg-primary-50/60 p-4 dark:border-primary-900/50 dark:bg-primary-950/20';

export const overviewDangerZoneClass =
  'rounded-xl border border-red-200 bg-red-50/40 p-5 dark:border-red-900/40 dark:bg-red-950/15';

export const overviewEmptyStateClass =
  'rounded-lg border border-dashed border-gray-300 bg-gray-50/50 px-5 py-8 text-center dark:border-gray-600 dark:bg-gray-800/30';

export const overviewListItemClass =
  'flex items-center gap-3 rounded-lg border border-gray-200/80 bg-gray-50/50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/40';

export const overviewTenantRowClass =
  'flex items-center gap-3 rounded-lg border border-gray-200/80 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/50';

export const detailsFormLabelClass = 'mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300';

export const detailsInputClass = 'input mt-1 rounded-lg';

export const defaultGroupBadgeClass =
  'inline-flex shrink-0 rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';

export const primaryRoleBadgeClass = defaultGroupBadgeClass;

export const detailsTabCountBadgeClass =
  'ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-300';

export const detailsActionRowClass =
  'mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-700/80';
