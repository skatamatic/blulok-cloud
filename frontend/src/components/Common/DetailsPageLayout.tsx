import React, { ReactNode } from 'react';
import { ArrowLeftIcon, ExclamationTriangleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';

export const detailsTabButtonClass = (active: boolean) =>
  `group inline-flex items-center border-b-2 px-1 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
    active
      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
  }`;

export const detailsTabIconClass = (active: boolean) =>
  `mr-1.5 h-4 w-4 ${
    active ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
  }`;

export const detailsHeaderTitleClass = 'truncate text-lg font-semibold text-gray-900 dark:text-white';

export const detailsHeaderSubtitleClass =
  'truncate text-sm text-gray-500 dark:text-gray-400 max-w-[min(100%,20rem)]';

export const detailsHeaderSeparatorClass = 'hidden shrink-0 text-gray-300 dark:text-gray-600 sm:inline';

export function DetailsPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function DetailsPageBackButton({
  onClick,
  label = 'Back',
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-900"
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export function DetailsPagePrimaryAction({
  onClick,
  label,
  icon: Icon = PlusCircleIcon,
  disabled,
}: {
  onClick: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 transition-colors hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
    >
      <Icon className="h-4 w-4 mr-2" />
      {label}
    </button>
  );
}

export interface DetailsPageHeaderProps {
  onBack?: () => void;
  backLabel?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  media?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function DetailsPageHeader({
  onBack,
  backLabel,
  title,
  subtitle,
  media,
  meta,
  actions,
}: DetailsPageHeaderProps) {
  const hasIdentity = Boolean(subtitle || meta);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {onBack ? <DetailsPageBackButton onClick={onBack} label={backLabel} /> : null}
        {media}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <h1 className={detailsHeaderTitleClass}>{title}</h1>
          {subtitle ? (
            <>
              <span className={detailsHeaderSeparatorClass} aria-hidden>
                ·
              </span>
              <div className={detailsHeaderSubtitleClass}>{subtitle}</div>
            </>
          ) : null}
          {meta ? (
            <>
              {hasIdentity ? (
                <span className={detailsHeaderSeparatorClass} aria-hidden>
                  ·
                </span>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center gap-2">{meta}</div>
            </>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export interface ListPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Compact single-row header for list/management views. */
export function ListPageHeader({ title, subtitle, actions }: ListPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className={detailsHeaderTitleClass}>{title}</h1>
        {subtitle ? (
          <>
            <span className={detailsHeaderSeparatorClass} aria-hidden>
              ·
            </span>
            <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
          </>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      ) : null}
    </div>
  );
}

export type DetailsTabItem = {
  key: string;
  label: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: ReactNode;
};

export function DetailsTabNav({
  tabs,
  activeKey,
  onChange,
}: {
  tabs: DetailsTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
        {tabs.map(({ key, label, icon: Icon, badge }) => {
          const active = activeKey === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={detailsTabButtonClass(active)}
            >
              {Icon ? <Icon className={detailsTabIconClass(active)} /> : null}
              {label}
              {badge}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export function DetailsPageLoading() {
  return (
    <DetailsPageShell>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    </DetailsPageShell>
  );
}

export const overviewFieldLabelClass =
  'text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

export const overviewFieldValueClass = 'mt-1 text-sm text-gray-900 dark:text-white';

export const overviewStatCardClass =
  'rounded-lg border border-gray-200/80 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/50';

/** Unified panel shell — use internal dividers instead of stacking many equal cards. */
export const overviewPanelClass =
  'rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/40';

/** Standalone section card (same shell as overview panels). */
export const overviewSectionClass = `${overviewPanelClass} p-5`;

export const overviewPanelHeaderClass =
  'border-b border-gray-100 px-5 py-4 dark:border-gray-700/80';

export const overviewPanelBodyClass = 'px-5 py-5';

export const overviewSubsectionDividerClass =
  'mt-5 border-t border-gray-100 pt-5 dark:border-gray-700/80';

/** Subsection inside an overview panel, below the main padded body (symmetric inset). */
export const overviewPanelSubsectionClass = `${overviewSubsectionDividerClass} px-5 pb-5`;

export const overviewAsideClass =
  'rounded-lg border border-gray-200/80 bg-gray-50/70 p-4 dark:border-gray-700 dark:bg-gray-800/50';

export function DetailsOverviewCard({ children }: { children: ReactNode }) {
  return (
    <div className={`${overviewPanelClass} overflow-hidden`}>
      {children}
    </div>
  );
}

export function DetailsOverviewCardBody({ children }: { children: ReactNode }) {
  return <div className="space-y-6 p-6">{children}</div>;
}

export function OverviewField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className={overviewFieldLabelClass}>{label}</dt>
      <dd className={overviewFieldValueClass}>{children}</dd>
    </div>
  );
}

export function OverviewStat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={overviewStatCardClass}>
      <p className={overviewFieldLabelClass}>{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function OverviewSectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function DetailsPageNotFound({
  title,
  message,
  onBack,
  backLabel = 'Back',
  icon,
}: {
  title: string;
  message: string;
  onBack?: () => void;
  backLabel?: string;
  icon?: ReactNode;
}) {
  return (
    <DetailsPageShell>
      <div className="text-center py-12">
        {icon ?? <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />}
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{title}</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        {onBack ? (
          <div className="mt-6 flex justify-center">
            <DetailsPageBackButton onClick={onBack} label={backLabel} />
          </div>
        ) : null}
      </div>
    </DetailsPageShell>
  );
}
