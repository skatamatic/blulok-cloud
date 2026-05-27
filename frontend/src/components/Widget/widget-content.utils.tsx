import React from 'react';
import { usePressWithoutDrag } from '@/hooks/usePressWithoutDrag';

/** ~33% scale-up for 1×1 stat tiles (icon 20px→27px, type one step larger). */
export const TINY_TILE_ICON_CLASS = 'h-[1.675rem] w-[1.675rem] shrink-0';
export const TINY_TILE_SPINNER_CLASS =
  'h-[1.675rem] w-[1.675rem] animate-spin rounded-full border-2 border-current/30 border-t-current';
export const TINY_TILE_LABEL_CLASS =
  'shrink-0 truncate px-0.5 text-center text-[12px] font-medium leading-tight text-gray-600 dark:text-gray-400';
/** Value line in tinted panel — leading-tight keeps descenders (g, y, p) inside the clip box. */
export const TINY_TILE_VALUE_CLASS =
  'max-w-full truncate text-center font-bold tabular-nums leading-tight';

function tinyValueSizeClass(display: string): string {
  if (display.length > 4) return 'text-base';
  if (display.length > 2) return 'text-lg';
  return 'text-xl';
}

/** Short label (1–2 words) for tiny stat tiles from widget title. */
export function statTinyLabel(title: string): string {
  const normalized = title.trim();
  const shortcuts: Record<string, string> = {
    'facilities count': 'Facilities',
    'active devices': 'Devices',
    'registered users': 'Users',
    'active alerts': 'Alerts',
    'unread alert notifications': 'Alerts',
    'fms sync': 'FMS Sync',
  };
  const key = normalized.toLowerCase();
  if (shortcuts[key]) return shortcuts[key];

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  if (words.length === 2 && words[1].toLowerCase() === 'count') {
    return words[0];
  }
  return words.slice(0, 2).join(' ');
}

/** Fills a 1×1 compact cell: tinted panel + value, label on the card margin below. */
export function StatTinyContent({
  icon: Icon,
  value,
  label,
  iconClassName,
  onClick,
  disabled,
  spinning,
  actionTitle,
  loading = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  iconClassName: string;
  onClick?: () => void;
  disabled?: boolean;
  spinning?: boolean;
  actionTitle?: string;
  loading?: boolean;
}) {
  const display = String(value);
  const valueSize = tinyValueSizeClass(display);
  const tinyLabel = statTinyLabel(label);
  const { pressProps } = usePressWithoutDrag(onClick ?? (() => {}), {
    disabled: disabled || !onClick || loading,
  });
  const panelClassName = `no-drag flex min-h-0 flex-1 flex-col items-center justify-center gap-0.5 overflow-x-hidden rounded-[7px] px-1 pt-1.5 pb-2 ${iconClassName}${
    onClick && !loading
      ? ` pointer-events-auto w-full transition-opacity hover:opacity-90${disabled ? ' cursor-not-allowed opacity-50' : ' cursor-pointer'}`
      : ''
  }`;
  const panelBody = loading ? (
    <div className={TINY_TILE_SPINNER_CLASS} aria-label="Loading" />
  ) : (
    <>
      <Icon className={`${TINY_TILE_ICON_CLASS} ${spinning ? 'animate-spin' : ''}`} aria-hidden />
      <span className={`${valueSize} ${TINY_TILE_VALUE_CLASS}`}>
        {display}
      </span>
    </>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5">
      {onClick && !loading ? (
        <div
          {...pressProps}
          title={actionTitle}
          className={panelClassName}
        >
          {panelBody}
        </div>
      ) : (
        <div className={panelClassName}>{panelBody}</div>
      )}
      {tinyLabel ? (
        <span
          className={`${TINY_TILE_LABEL_CLASS} drag-handle cursor-grab select-none`}
          title={label}
        >
          {tinyLabel}
        </span>
      ) : null}
    </div>
  );
}

/** KPI body for stat widgets in small+ sizes (Widget shell with header). */
export function StatKpiContent({
  icon: Icon,
  value,
  iconClassName,
  size = 'small',
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  iconClassName: string;
  size?: 'small' | 'medium' | 'large' | 'huge';
}) {
  const valueClass =
    size === 'huge' || size === 'large'
      ? 'text-4xl sm:text-5xl'
      : size === 'medium'
        ? 'text-3xl'
        : 'text-2xl';
  const iconBox =
    size === 'huge' || size === 'large' ? 'p-3 rounded-xl' : 'p-2 rounded-lg';
  const iconClass =
    size === 'huge' || size === 'large' ? 'h-8 w-8' : size === 'medium' ? 'h-6 w-6' : 'h-5 w-5';

  return (
    <div className="flex h-full min-h-0 w-full flex-col justify-between gap-2">
      <div className={`flex-shrink-0 ${iconBox} ${iconClassName}`} aria-hidden>
        <Icon className={iconClass} />
      </div>
      <div
        className={`flex flex-1 min-h-0 items-end font-bold tabular-nums leading-none text-gray-900 dark:text-white ${valueClass}`}
      >
        <span className="truncate w-full">{value}</span>
      </div>
    </div>
  );
}
