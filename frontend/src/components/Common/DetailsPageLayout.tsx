import React, { ReactNode } from 'react';
import { ArrowLeftIcon, ExclamationTriangleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';

export const detailsTabButtonClass = (active: boolean) =>
  `group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
    active
      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
  }`;

export const detailsTabIconClass = (active: boolean) =>
  `mr-2 h-5 w-5 ${
    active ? 'text-primary-500' : 'text-gray-400 group-hover:text-gray-500'
  }`;

export function DetailsPageShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
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
      className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors shrink-0"
    >
      <ArrowLeftIcon className="h-4 w-4 mr-2" />
      {label}
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
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4 min-w-0 flex-1">
        {onBack ? <DetailsPageBackButton onClick={onBack} label={backLabel} /> : null}
        {media}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
          ) : null}
          {meta ? <div className="mt-2">{meta}</div> : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
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
