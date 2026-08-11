import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon,
  Battery0Icon,
  Battery100Icon,
  Battery50Icon,
  ChevronDownIcon,
  ClockIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  PhoneIcon,
  SignalIcon,
  SignalSlashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from '@/types/widget.types';
import { apiService } from '@/services/api.service';
import { RemoteUnlockButton } from '@/components/Lock/RemoteUnlockButton';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { requiresOccupiedUnitOverride } from '@/constants/tenantUnlockOverride.constants';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import {
  getWidgetLayoutProfile,
  WIDGET_BODY_CLASS,
  WIDGET_LIST_SCROLL_CLASS,
} from '@/utils/widget-layout.utils';
import { compareNaturalStrings } from '@/utils/naturalStringCompare';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { resolveLockTimeoutMsForUnit } from '@/utils/facilityLockTimeout.utils';
import { useLockDeviceRealtime } from '@/hooks/useLockDeviceRealtime';
import { AccessHistoryCompactSessionRow } from '@/components/AccessHistory/AccessHistoryCompactSessionRow';
import { PlaceholderUserBadge } from '@/components/UserManagement/PlaceholderUserBadge';
import { InviteActions } from '@/components/UserManagement/InviteActions';
import { formatRelativeWithExact, RELATIVE_UNITS_ACTIVITY_OPTS } from '@/utils/datetime.utils';
import { formatUserContactSubtitle } from '@/utils/userDisplay.utils';
import { AccessSession } from '@/types/access-session.types';
import {
  mergeUnitRowsFromDeviceSnapshots,
  type LockDeviceSnapshot,
} from '@/utils/deviceStatusWs.utils';

type LockState = 'locked' | 'unlocked' | 'unknown' | 'unlocking' | 'locking';

interface UnitRow {
  id: string;
  unit_number: string;
  facility_id: string;
  facility_name?: string;
  facility_lock_command_timeout_sec?: number | null;
  status?: string;
  lock_status?: LockState | string | null;
  battery_level?: number | null;
  signal_strength?: number | null;
  last_activity?: string | null;
  device_status?: 'online' | 'offline' | 'low_battery' | 'error' | string | null;
  unit_type?: string | null;
  blulok_device?: {
    id?: string;
    device_serial?: string;
    supports_remote_lock?: boolean;
    lock_status?: LockState | string;
    device_status?: string | null;
    battery_level?: number | null;
    signal_strength?: number | null;
    firmware_version?: string | null;
  } | null;
  primary_tenant?: {
    id?: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    is_placeholder?: boolean;
    last_login?: string | Date | null;
  } | null;
  tenant_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

type RecentAccessSession = AccessSession;

export interface UnitsManagerWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  currentSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onSizeChange?: (size: WidgetSize) => void;
  onRemove?: () => void;
  readOnly?: boolean;
  facilityFilter?: string;
  onFullscreenToggle?: () => void;
  isFullscreen?: boolean;
  /** Live dashboard grid dimensions for dock-shaped free-form layout. */
  gridSize?: { w: number; h: number };
}

const fadeIn = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
};

const tenantDisplayName = (unit: UnitRow): string => {
  if (unit.primary_tenant) {
    const f = unit.primary_tenant.first_name ?? '';
    const l = unit.primary_tenant.last_name ?? '';
    const full = `${f} ${l}`.trim();
    if (full) return full;
  }
  if (unit.tenant_name) return unit.tenant_name;
  return '';
};

const lockStateOf = (unit: UnitRow): LockState => {
  const raw = (unit.blulok_device?.lock_status ?? unit.lock_status ?? '').toString().toLowerCase();
  if (raw === 'locking') return 'locking';
  if (raw === 'unlocking') return 'unlocking';
  if (raw === 'locked') return 'locked';
  if (raw === 'unlocked') return 'unlocked';
  return 'unknown';
};

const deviceLockStatus = (unit: UnitRow): string | undefined => {
  const raw = unit.blulok_device?.lock_status ?? unit.lock_status;
  return raw != null ? String(raw) : undefined;
};

const deviceMetrics = (unit: UnitRow) => ({
  battery: unit.blulok_device?.battery_level ?? unit.battery_level ?? null,
  signal: unit.blulok_device?.signal_strength ?? unit.signal_strength ?? null,
  status: unit.blulok_device?.device_status ?? unit.device_status ?? null,
  serial: unit.blulok_device?.device_serial ?? null,
  firmware: unit.blulok_device?.firmware_version ?? null,
  hasDevice: Boolean(unit.blulok_device?.id),
});

type UnitQuickFilter = 'unlocked' | 'low_battery' | 'occupied' | 'unoccupied';
type UnitSortKey = 'unit_number' | 'status' | 'last_activity';
type UnitSortOrder = 'asc' | 'desc';

const UNIT_STATUS_SORT_ORDER: Record<string, number> = {
  available: 0,
  reserved: 1,
  maintenance: 2,
  occupied: 3,
};

const isLowOrUnknownBattery = (unit: UnitRow): boolean => {
  const level = unit.blulok_device?.battery_level ?? unit.battery_level;
  const status = (unit.blulok_device?.device_status ?? unit.device_status ?? '')
    .toLowerCase()
    .trim();
  if (status === 'low_battery') return true;
  if (level == null) return true;
  return level < 30;
};

const unitOccupancyKey = (unit: UnitRow): string =>
  (unit.status ?? '').toLowerCase().trim();

const isOccupiedUnit = (unit: UnitRow): boolean => unitOccupancyKey(unit) === 'occupied';

const isUnoccupiedUnit = (unit: UnitRow): boolean => unitOccupancyKey(unit) === 'available';

const compareUnits = (
  a: UnitRow,
  b: UnitRow,
  sortBy: UnitSortKey,
  sortOrder: UnitSortOrder
): number => {
  const mult = sortOrder === 'asc' ? 1 : -1;

  if (sortBy === 'unit_number') {
    return mult * compareNaturalStrings(a.unit_number ?? '', b.unit_number ?? '');
  }

  if (sortBy === 'status') {
    const aOrder = UNIT_STATUS_SORT_ORDER[(a.status ?? '').toLowerCase()] ?? 99;
    const bOrder = UNIT_STATUS_SORT_ORDER[(b.status ?? '').toLowerCase()] ?? 99;
    if (aOrder !== bOrder) return mult * (aOrder - bOrder);
    return compareNaturalStrings(a.unit_number ?? '', b.unit_number ?? '');
  }

  const aTime = a.last_activity ? new Date(a.last_activity).getTime() : null;
  const bTime = b.last_activity ? new Date(b.last_activity).getTime() : null;
  if (aTime == null && bTime == null) {
    return compareNaturalStrings(a.unit_number ?? '', b.unit_number ?? '');
  }
  if (aTime == null) return 1;
  if (bTime == null) return -1;
  if (aTime !== bTime) return mult * (aTime - bTime);
  return compareNaturalStrings(a.unit_number ?? '', b.unit_number ?? '');
};

const quickFilterEmptyMessage = (filter: UnitQuickFilter): string => {
  switch (filter) {
    case 'unlocked':
      return 'No unlocked units right now.';
    case 'low_battery':
      return 'No units with low, critical, or unknown battery.';
    case 'occupied':
      return 'No occupied units match.';
    case 'unoccupied':
      return 'No unoccupied units match.';
  }
};

/** Combined batt/signal/lock icons + last access. */
const DEVICE_STATUS_COL = 'minmax(6.5rem, auto)';
const LAST_ACCESS_COL = 'minmax(3.25rem, 0.75fr)';
const METRIC_GRID_COLS = `${DEVICE_STATUS_COL} ${LAST_ACCESS_COL}`;

const DETAIL_PANEL_CLASS =
  'rounded-lg border border-gray-100 bg-white/80 p-3 dark:border-gray-700/60 dark:bg-gray-800/50';

/** Expand row: columns stretch to the tallest card; access scrolls inside its card. */
const EXPAND_COLUMN_CLASS = 'flex min-h-0 flex-col';
const ACCESS_EXPAND_COLUMN_CLASS = `${EXPAND_COLUMN_CLASS} lg:overflow-hidden`;
const EXPAND_DETAIL_CARD_CLASS = `${DETAIL_PANEL_CLASS} min-h-0 flex-1`;
const ACCESS_HISTORY_DETAIL_CARD_CLASS = `${EXPAND_DETAIL_CARD_CLASS} overflow-y-auto lg:h-0`;

/** Single-family type scale: label (xs caps) · body (sm) · meta (xs muted). */
const TYPE = {
  label:
    'text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
  body: 'text-sm text-gray-800 dark:text-gray-200',
  bodyStrong: 'text-sm font-medium text-gray-900 dark:text-white',
  meta: 'text-xs text-gray-500 dark:text-gray-400',
  link: 'text-xs font-medium text-[#147FD4] transition-colors hover:text-[#0f6cb6] hover:underline',
} as const;

const BADGE_TEXT = 'text-xs font-medium';

const ExpandSectionHeader: React.FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h4 className={TYPE.label}>{title}</h4>
    {action}
  </div>
);

const unitStatusMeta: Record<string, { label: string; className: string }> = {
  occupied: {
    label: 'Occupied',
    className:
      'bg-[#147FD4]/10 text-[#147FD4] dark:bg-[#147FD4]/20 dark:text-[#5eb3f0]',
  },
  overlocked: {
    label: 'Overlocked',
    className: 'bg-orange-50 text-orange-700 dark:bg-orange-900/25 dark:text-orange-300',
  },
  available: {
    label: 'Available',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  },
  maintenance: {
    label: 'Maintenance',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300',
  },
  reserved: {
    label: 'Reserved',
    className: 'bg-violet-50 text-violet-700 dark:bg-violet-900/25 dark:text-violet-300',
  },
};

const UnitStatusChip: React.FC<{ status?: string | null; compact?: boolean }> = ({
  status,
  compact = false,
}) => {
  const key = (status ?? '').toLowerCase();
  const meta = unitStatusMeta[key];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full capitalize ${BADGE_TEXT} ${meta.className} ${
        compact ? 'px-1.5 py-px' : 'px-2 py-0.5'
      }`}
    >
      {meta.label}
    </span>
  );
};

const DeviceStatusBadge: React.FC<{ status?: string | null; compact?: boolean }> = ({
  status,
  compact = false,
}) => {
  const key = (status ?? 'unknown').toLowerCase();
  const styles: Record<string, { label: string; className: string }> = {
    online: {
      label: 'Online',
      className:
        'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-900/25 dark:text-emerald-300 dark:ring-emerald-800/60',
    },
    offline: {
      label: 'Offline',
      className:
        'bg-gray-100 text-gray-600 ring-1 ring-gray-200/80 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700',
    },
    low_battery: {
      label: 'Low batt.',
      className:
        'bg-amber-50 text-amber-800 ring-1 ring-amber-200/80 dark:bg-amber-900/25 dark:text-amber-200 dark:ring-amber-800/50',
    },
    error: {
      label: 'Error',
      className:
        'bg-rose-50 text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-900/25 dark:text-rose-300 dark:ring-rose-800/50',
    },
  };
  const meta = styles[key] ?? {
    label: key === 'unknown' || !key ? 'No device' : key,
    className:
      'bg-gray-50 text-gray-500 ring-1 ring-gray-200/60 dark:bg-gray-800/80 dark:text-gray-400 dark:ring-gray-700',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${BADGE_TEXT} ${meta.className} ${
        compact ? 'px-1.5 py-px' : 'px-2 py-0.5'
      }`}
      title={`Device ${meta.label}`}
    >
      <span
        className={`rounded-full ${
          key === 'online'
            ? 'bg-emerald-500'
            : key === 'offline'
              ? 'bg-gray-400'
              : key === 'low_battery'
                ? 'bg-amber-500'
                : key === 'error'
                  ? 'bg-rose-500'
                  : 'bg-gray-300 dark:bg-gray-600'
        } ${compact ? 'h-1 w-1' : 'h-1.5 w-1.5'}`}
      />
      {meta.label}
    </span>
  );
};

type RowLayoutFlags = {
  isDock: boolean;
  showTableColumns: boolean;
  showTenantColumn: boolean;
  showDeviceColumn: boolean;
  showFacilityColumn: boolean;
};

const rowGridTemplateColumns = ({
  isDock,
  showTenantColumn,
  showDeviceColumn,
  showFacilityColumn,
}: RowLayoutFlags): string => {
  const chevron = isDock ? '1.1rem' : '1.25rem';
  const facilityPrefix = showFacilityColumn
    ? `${isDock ? 'minmax(3.25rem, 0.85fr)' : 'minmax(4rem, 1fr)'} `
    : '';

  if (showDeviceColumn && showTenantColumn) {
    return (
      facilityPrefix +
      (isDock
        ? `minmax(4.75rem, 0.9fr) minmax(4rem, 2.25fr) minmax(2.75rem, 0.55fr) ${METRIC_GRID_COLS} ${chevron}`
        : `minmax(6.5rem, 0.95fr) minmax(5rem, 2.75fr) minmax(3rem, 0.5fr) ${METRIC_GRID_COLS} ${chevron}`)
    );
  }
  if (showTenantColumn) {
    return (
      facilityPrefix +
      (isDock
        ? `minmax(0, 0.85fr) minmax(3.5rem, 2fr) ${METRIC_GRID_COLS} ${chevron}`
        : `minmax(0, 0.9fr) minmax(4.5rem, 2.5fr) ${METRIC_GRID_COLS} ${chevron}`)
    );
  }
  return (
    facilityPrefix +
    (isDock
      ? `minmax(0, 1fr) ${METRIC_GRID_COLS} ${chevron}`
      : `minmax(0, 1fr) ${METRIC_GRID_COLS} ${chevron}`)
  );
};

/** Inline section link (matches Recent access “View all” pattern). */
const SectionNavLink: React.FC<{
  label: string;
  onClick: () => void;
  compact?: boolean;
}> = ({ label, onClick, compact = false }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={`no-drag inline-flex items-center gap-1 ${TYPE.link}`}
  >
    {label}
    <ArrowTopRightOnSquareIcon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
  </button>
);

const buildAccessHistoryUrl = (unit: UnitRow): string => {
  const params = new URLSearchParams({ unit_id: unit.id });
  if (unit.facility_id) params.set('facility_id', unit.facility_id);
  return `/access-history?${params.toString()}`;
};

const DeviceDetailsLink: React.FC<{
  deviceId: string;
  label?: string;
  compact?: boolean;
}> = ({ deviceId, label = 'Device details', compact = false }) => {
  const navigate = useNavigate();
  return (
    <SectionNavLink
      label={label}
      compact={compact}
      onClick={() => navigate(`/devices/blulok/${deviceId}`)}
    />
  );
};

const SortableHeaderCell: React.FC<{
  label: string;
  columnKey: UnitSortKey;
  sortBy: UnitSortKey;
  sortOrder: UnitSortOrder;
  onSort: (columnKey: UnitSortKey) => void;
  align?: 'left' | 'center' | 'right';
}> = ({ label, columnKey, sortBy, sortOrder, onSort, align = 'left' }) => {
  const active = sortBy === columnKey;
  const textAlign =
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  const directionWord = sortOrder === 'desc' ? 'descending' : 'ascending';
  const sortButtonLabel = active
    ? `Sorted by ${label}, ${directionWord}. Activate to reverse sort order.`
    : `Sort by ${label}`;

  return (
    <button
      type="button"
      aria-label={sortButtonLabel}
      onClick={() => onSort(columnKey)}
      className={`no-drag inline-flex w-full items-center gap-0.5 rounded px-0.5 py-0.5 transition-colors ${textAlign} ${
        align === 'center'
          ? 'justify-center'
          : align === 'right'
            ? 'justify-end'
            : 'justify-start'
      } ${
        active
          ? 'text-[#147FD4] dark:text-[#5eb3f0]'
          : 'text-gray-500 hover:text-[#147FD4] dark:text-gray-400 dark:hover:text-[#5eb3f0]'
      } ${TYPE.label}`}
    >
      <span className="truncate">{label}</span>
      <span className="flex shrink-0 flex-col leading-none" aria-hidden>
        <span
          className={`text-[0.5rem] leading-none ${
            active && sortOrder === 'asc' ? 'text-[#147FD4]' : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          ▲
        </span>
        <span
          className={`text-[0.5rem] leading-none ${
            active && sortOrder === 'desc' ? 'text-[#147FD4]' : 'text-gray-300 dark:text-gray-600'
          }`}
        >
          ▼
        </span>
      </span>
    </button>
  );
};

const QuickFilterToggle: React.FC<{
  active: boolean;
  label: string;
  dotClassName: string;
  onClick: () => void;
}> = ({ active, label, dotClassName, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`no-drag inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 tabular-nums transition-all ${TYPE.meta} ${
      active
        ? 'border-[#147FD4]/40 bg-[#147FD4]/10 text-[#147FD4] shadow-sm dark:border-[#147FD4]/50 dark:bg-[#147FD4]/15 dark:text-[#5eb3f0]'
        : 'border-transparent bg-gray-100/80 text-gray-600 hover:border-gray-200 hover:bg-gray-100 dark:bg-gray-800/60 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800'
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
    {label}
  </button>
);

const ListColumnHeader: React.FC<{
  layout: RowLayoutFlags;
  sortBy: UnitSortKey;
  sortOrder: UnitSortOrder;
  onSort: (columnKey: UnitSortKey) => void;
}> = ({ layout, sortBy, sortOrder, onSort }) => {
  const headerCell = `${TYPE.label} truncate`;
  return (
    <li
      style={{ gridTemplateColumns: rowGridTemplateColumns(layout) }}
      className={`sticky top-0 z-10 mb-1 grid items-center gap-x-2 gap-y-0 rounded-md border border-transparent bg-gray-50/95 px-2 py-1 backdrop-blur-sm dark:bg-gray-900/90 ${
        layout.isDock ? '' : 'px-3'
      }`}
      aria-hidden
    >
      {layout.showFacilityColumn && <span className={headerCell}>Facility</span>}
      <SortableHeaderCell
        label="Unit"
        columnKey="unit_number"
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
      />
      {layout.showTenantColumn && <span className={headerCell}>Tenant</span>}
      {layout.showDeviceColumn && (
        <span className={`${headerCell} text-center`}>Device</span>
      )}
      <span className={`${headerCell} text-center`}>Status</span>
      <SortableHeaderCell
        label="Last unlocked"
        columnKey="last_activity"
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={onSort}
        align="center"
      />
      <span />
    </li>
  );
};

const BatteryGauge: React.FC<{
  level?: number | null;
  deviceStatus?: string | null;
  compact?: boolean;
}> = ({ level, deviceStatus, compact = false }) => {
  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  if (level == null) {
    return (
      <span
        className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500"
        title="Battery unknown"
      >
        <Battery0Icon className={iconClass} />
        {!compact && <span className={`${TYPE.meta} tabular-nums`}>—</span>}
      </span>
    );
  }

  const Icon = level >= 70 ? Battery100Icon : level >= 30 ? Battery50Icon : Battery0Icon;
  const cls =
    level >= 70
      ? 'text-emerald-500'
      : level >= 30
        ? 'text-amber-500'
        : 'text-rose-500';
  const label = `${Math.round(level)}%${deviceStatus === 'low_battery' ? ' · low' : ''}`;
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`} title={`Battery ${label}`}>
      <Icon className={iconClass} />
      {!compact && (
        <span className={`${TYPE.meta} tabular-nums`}>{Math.round(level)}%</span>
      )}
    </span>
  );
};

const SignalGauge: React.FC<{
  signal?: number | null;
  deviceStatus?: string | null;
  compact?: boolean;
}> = ({ signal, deviceStatus, compact = false }) => {
  const iconClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const offline = deviceStatus === 'offline';
  if (offline) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400" title="Offline">
        <SignalSlashIcon className={iconClass} />
      </span>
    );
  }
  if (signal == null) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400" title="Signal unknown">
        <SignalIcon className={iconClass} />
      </span>
    );
  }
  // Common BLE/IoT RSSI range roughly -30 (excellent) to -100 (poor); coerce to 0..4 bars
  const bars = signal > -55 ? 4 : signal > -70 ? 3 : signal > -85 ? 2 : signal > -100 ? 1 : 0;
  const cls =
    bars >= 3 ? 'text-emerald-500' : bars === 2 ? 'text-amber-500' : 'text-rose-500';
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} title={`Signal ${signal} dBm`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`block w-0.5 rounded-sm transition-all ${
            i < bars ? 'bg-current' : 'bg-current/20'
          }`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </span>
  );
};

const LockBadge: React.FC<{ state: LockState; compact?: boolean }> = ({
  state,
  compact = false,
}) => {
  const isLocked = state === 'locked';
  const isUnlocked = state === 'unlocked';
  const isUnlocking = state === 'unlocking';
  const isLocking = state === 'locking';
  const isUnknown = state === 'unknown';
  const Icon = isUnlocked || isUnlocking ? LockOpenIcon : LockClosedIcon;
  const cls = isUnlocking || isLocking
    ? 'bg-[#147FD4]/15 text-[#147FD4] dark:bg-[#147FD4]/25 dark:text-[#5eb3f0]'
    : isUnknown
      ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
      : isLocked
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400';
  const label = isUnlocking
    ? 'Unlocking'
    : isLocking
      ? 'Locking'
      : isUnknown
        ? 'Unknown'
        : isLocked
          ? 'Locked'
          : 'Unlocked';
  return (
    <motion.span
      layout
      title={label}
      className={`inline-flex items-center gap-1 rounded-full ${BADGE_TEXT} ${cls} ${
        compact ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
      } ${isUnlocking || isLocking ? 'animate-pulse' : ''}`}
    >
      <motion.span
        key={state}
        initial={{ scale: 0.6, rotate: -30, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      </motion.span>
      {!compact && label}
    </motion.span>
  );
};

const DeviceStatusIcons: React.FC<{
  metrics: ReturnType<typeof deviceMetrics>;
  lockState: LockState;
  compact?: boolean;
}> = ({ metrics, lockState, compact = false }) => (
  <motion.div
    layout
    className="grid w-full grid-cols-3 items-center justify-items-center"
  >
    <BatteryGauge
      level={metrics.battery}
      deviceStatus={metrics.status}
      compact={compact}
    />
    <SignalGauge signal={metrics.signal} deviceStatus={metrics.status} compact={compact} />
    <LockBadge state={lockState} compact={compact} />
  </motion.div>
);

const ExpandedDetails: React.FC<{
  unit: UnitRow;
  isSubmitting: boolean;
  onUnlock: () => void;
  canManageTenantInvites?: boolean;
  onTenantInviteComplete?: () => void;
}> = ({ unit, isSubmitting, onUnlock, canManageTenantInvites = false, onTenantInviteComplete }) => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<RecentAccessSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    setSessionsError(null);
    apiService
      .getAccessSessions({ unit_id: unit.id, limit: 5 })
      .then((res) => {
        if (cancelled) return;
        const arr = (res?.sessions ?? res?.logs ?? []) as RecentAccessSession[];
        setSessions(Array.isArray(arr) ? arr : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load access sessions';
        setSessionsError(msg);
        setSessions([]);
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unit.id]);

  const tenantName = tenantDisplayName(unit) || 'Unassigned';
  const isPlaceholderTenant = Boolean(unit.primary_tenant?.is_placeholder);
  const tenantEmail = isPlaceholderTenant
    ? null
    : (unit.primary_tenant?.email ?? unit.tenant_email ?? null);
  const tenantPhone = isPlaceholderTenant
    ? null
    : (unit.primary_tenant?.phone_number ?? unit.tenant_phone ?? null);
  const tenantId = unit.primary_tenant?.id;
  const supportsRemoteUnlock = unit.blulok_device?.supports_remote_lock !== false;
  const deviceId = unit.blulok_device?.id;
  const lockStatus = deviceLockStatus(unit);
  const metrics = deviceMetrics(unit);

  return (
    <motion.div
      key={`details-${unit.id}`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ height: { duration: 0.28, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
      className="overflow-hidden border-t border-gray-100 dark:border-gray-700/80"
    >
      <div className="bg-gradient-to-b from-[#147FD4]/[0.04] to-transparent px-3 pb-3 pt-3 dark:from-[#147FD4]/10 lg:px-4 lg:pb-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-stretch lg:gap-4">
        <div className={ACCESS_EXPAND_COLUMN_CLASS}>
          <ExpandSectionHeader
            title="Recent access"
            action={
              <SectionNavLink
                label="View all"
                onClick={() => navigate(buildAccessHistoryUrl(unit))}
              />
            }
          />

          <div className={ACCESS_HISTORY_DETAIL_CARD_CLASS}>
            {sessionsLoading ? (
              <ul className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-7 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
                  />
                ))}
              </ul>
            ) : sessionsError ? (
              <p className={`${TYPE.meta} text-rose-500`}>{sessionsError}</p>
            ) : sessions && sessions.length > 0 ? (
              <ul className="space-y-1.5">
                {sessions.slice(0, 5).map((session, i) => (
                  <AccessHistoryCompactSessionRow
                    key={session.id}
                    session={session}
                    index={i}
                  />
                ))}
              </ul>
            ) : (
              <p className={TYPE.meta}>No recent access sessions.</p>
            )}
          </div>
        </div>

        <div className={EXPAND_COLUMN_CLASS}>
          <ExpandSectionHeader
            title="Tenant"
            action={
              tenantId ? (
                <SectionNavLink
                  label="View tenant"
                  onClick={() => navigate(`/users/${tenantId}/details`)}
                />
              ) : undefined
            }
          />
          <div className={`${EXPAND_DETAIL_CARD_CLASS} flex flex-col space-y-2`}>
            <div className={`flex items-center gap-2 ${TYPE.bodyStrong}`}>
              <UserCircleIcon className="h-4 w-4 shrink-0 text-gray-400" />
              <span className="truncate">{tenantName}</span>
              {isPlaceholderTenant ? <PlaceholderUserBadge /> : null}
            </div>
            {tenantEmail && (
              <a
                href={`mailto:${tenantEmail}`}
                className={`flex items-center gap-2 ${TYPE.meta} transition-colors hover:text-[#147FD4]`}
              >
                <EnvelopeIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{tenantEmail}</span>
              </a>
            )}
            {tenantPhone && (
              <a
                href={`tel:${tenantPhone}`}
                className={`flex items-center gap-2 ${TYPE.meta} transition-colors hover:text-[#147FD4]`}
              >
                <PhoneIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{tenantPhone}</span>
              </a>
            )}
            {isPlaceholderTenant ? (
              <p className={TYPE.meta}>
                {formatUserContactSubtitle({ is_placeholder: true })}
              </p>
            ) : !tenantEmail && !tenantPhone ? (
              <p className={TYPE.meta}>No contact details on file.</p>
            ) : null}

            {canManageTenantInvites && tenantId ? (
              <div className="mt-auto border-t border-gray-100 pt-2.5 dark:border-gray-700/50">
                <InviteActions
                  size="compact"
                  fullWidth
                  user={{
                    id: tenantId,
                    firstName: unit.primary_tenant?.first_name,
                    lastName: unit.primary_tenant?.last_name,
                    email: tenantEmail,
                    phoneNumber: tenantPhone,
                    lastLogin: unit.primary_tenant?.last_login ?? null,
                    isPlaceholder: isPlaceholderTenant,
                  }}
                  onComplete={onTenantInviteComplete}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${EXPAND_COLUMN_CLASS} gap-3 lg:h-full`}>
          <div className={`${EXPAND_COLUMN_CLASS} min-h-0 flex-1`}>
            <ExpandSectionHeader
              title="Device"
              action={
                deviceId ? (
                  <DeviceDetailsLink deviceId={deviceId} label="Device details" />
                ) : undefined
              }
            />
            <div className={`${EXPAND_DETAIL_CARD_CLASS} flex flex-col space-y-2.5`}>
                {metrics.hasDevice ? (
                  <>
                    {metrics.serial && (
                      <p className={`truncate ${TYPE.meta}`} title={metrics.serial}>
                        <span className="text-gray-400 dark:text-gray-500">Serial · </span>
                        <span className="tabular-nums text-gray-700 dark:text-gray-300">
                          {metrics.serial}
                        </span>
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-md bg-gray-50/80 px-2 py-1.5 dark:bg-gray-900/40">
                        <p className={`mb-1 ${TYPE.meta}`}>Battery</p>
                        <BatteryGauge
                          level={metrics.battery}
                          deviceStatus={metrics.status}
                        />
                      </div>
                      <div className="rounded-md bg-gray-50/80 px-2 py-1.5 dark:bg-gray-900/40">
                        <p className={`mb-1 ${TYPE.meta}`}>Signal</p>
                        <SignalGauge signal={metrics.signal} deviceStatus={metrics.status} />
                        {metrics.signal != null && (
                          <p className={`mt-1 tabular-nums ${TYPE.meta}`}>{metrics.signal} dBm</p>
                        )}
                      </div>
                    </div>
                    {metrics.firmware && (
                      <p className={TYPE.meta}>
                        Firmware ·{' '}
                        <span className="tabular-nums text-gray-700 dark:text-gray-300">
                          {metrics.firmware}
                        </span>
                      </p>
                    )}
                  </>
                ) : (
                  <p className={TYPE.meta}>No BluLok device linked.</p>
                )}

                <div className="mt-auto border-t border-gray-100 pt-2.5 dark:border-gray-700/50">
                  <RemoteUnlockButton
                    lockStatus={lockStatus}
                    isSubmitting={isSubmitting}
                    hasDevice={Boolean(deviceId)}
                    remoteSupported={supportsRemoteUnlock}
                    deviceStatus={metrics.status}
                    fullWidth
                    size="sm"
                    stopPropagation
                    onUnlock={onUnlock}
                  />
                </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end">
            <SectionNavLink
              label="Unit details"
              compact
              onClick={() => navigate(`/units/${unit.id}`)}
            />
          </div>
        </div>
        </div>
      </div>
    </motion.div>
  );
};

export const UnitsManagerWidget: React.FC<UnitsManagerWidgetProps> = ({
  id,
  title,
  initialSize = 'dock-bottom',
  currentSize,
  availableSizes,
  onSizeChange,
  onRemove,
  readOnly,
  facilityFilter,
  onFullscreenToggle,
  isFullscreen = false,
  gridSize,
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState<UnitQuickFilter | null>(null);
  const [sortBy, setSortBy] = useState<UnitSortKey>('unit_number');
  const [sortOrder, setSortOrder] = useState<UnitSortOrder>('asc');
  const [scopeFacilityFilter, setScopeFacilityFilter] = useState('');
  const reqIdRef = useRef(0);
  const unitsRef = useRef(units);
  unitsRef.current = units;

  const { requestUnlock, isSubmitting, syncLockStatus, tenantOverrideDialog } = useRemoteUnlockAction({
    timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
  });
  const { isAllFacilitiesSelected, facilities: globalFacilities } = useGlobalFacility();
  const { authState, canManageUsers } = useAuth();
  const isAllFacilitiesMode = isAllFacilitiesSelected && !facilityFilter;
  const canManageTenantInvites = canManageUsers();

  useEffect(() => {
    if (currentSize) setSize(currentSize);
  }, [currentSize]);

  const handleSizeChange = (next: WidgetSize) => {
    setSize(next);
    onSizeChange?.(next);
  };

  const fetchUnits = React.useCallback(async (options?: { background?: boolean }) => {
    const reqId = ++reqIdRef.current;
    if (!options?.background) {
      setLoading(true);
      setError(null);
    }
    try {
      const params: Record<string, unknown> = { limit: 200, offset: 0 };
      if (facilityFilter) params.facility_id = facilityFilter;
      const res = await apiService.getUnits(params);
      if (reqId !== reqIdRef.current) return;
      if (res?.success === false) {
        if (!options?.background) {
          setError(res.message ?? 'Failed to load units');
          setUnits([]);
        }
        return;
      }
      const list = (res?.units ?? []) as UnitRow[];
      setUnits(list);
    } catch (err: unknown) {
      if (reqId !== reqIdRef.current) return;
      if (!options?.background) {
        const msg = err instanceof Error ? err.message : 'Failed to load units';
        setError(msg);
      }
    } finally {
      if (reqId === reqIdRef.current && !options?.background) setLoading(false);
    }
  }, [facilityFilter]);

  const fetchUnitsRef = useRef(fetchUnits);
  fetchUnitsRef.current = fetchUnits;

  useEffect(() => {
    void fetchUnits();
  }, [fetchUnits]);

  const applyUnitDeviceSnapshots = useCallback((rows: LockDeviceSnapshot[]): boolean => {
    if (!rows.length) return false;
    const next = mergeUnitRowsFromDeviceSnapshots(unitsRef.current, rows);
    if (next === unitsRef.current) return false;
    setUnits(next);
    return true;
  }, []);

  useLockDeviceRealtime({
    facilityId: facilityFilter,
    onDeviceRows: applyUnitDeviceSnapshots,
    // Occupancy/tenant changes arrive on units_update (FMS sync, assign/unassign).
    // device_status merges lock telemetry without a full list refetch.
    subscribeUnitsForRefresh: true,
    skipDebouncedRefreshWhenDeviceRowsApplied: true,
    debouncedRefresh: () => {
      void fetchUnitsRef.current({ background: true });
    },
    debounceMs: 500,
  });

  useEffect(() => {
    if (!isAllFacilitiesMode) {
      setScopeFacilityFilter('');
    }
  }, [isAllFacilitiesMode]);

  const facilityOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const unit of units) {
      if (unit.facility_id) {
        map.set(unit.facility_id, unit.facility_name ?? unit.facility_id);
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ id, name }));
  }, [units]);

  const handleColumnSort = (columnKey: UnitSortKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(columnKey);
    setSortOrder('asc');
  };

  const toggleQuickFilter = (filter: UnitQuickFilter) => {
    setQuickFilter((prev) => (prev === filter ? null : filter));
  };

  const displayed = useMemo(() => {
    let list = units;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => {
        const name = tenantDisplayName(u).toLowerCase();
        const email = (u.primary_tenant?.email ?? u.tenant_email ?? '').toLowerCase();
        const serial = (u.blulok_device?.device_serial ?? '').toLowerCase();
        return (
          u.unit_number?.toLowerCase().includes(q) ||
          u.facility_name?.toLowerCase().includes(q) ||
          name.includes(q) ||
          email.includes(q) ||
          serial.includes(q)
        );
      });
    }

    if (quickFilter === 'unlocked') {
      list = list.filter((u) => lockStateOf(u) === 'unlocked');
    } else if (quickFilter === 'low_battery') {
      list = list.filter(isLowOrUnknownBattery);
    } else if (quickFilter === 'occupied') {
      list = list.filter(isOccupiedUnit);
    } else if (quickFilter === 'unoccupied') {
      list = list.filter(isUnoccupiedUnit);
    }

    if (isAllFacilitiesMode && scopeFacilityFilter) {
      list = list.filter((u) => u.facility_id === scopeFacilityFilter);
    }

    return [...list].sort((a, b) => compareUnits(a, b, sortBy, sortOrder));
  }, [units, search, quickFilter, sortBy, sortOrder, isAllFacilitiesMode, scopeFacilityFilter]);

  const hasActiveSearch = search.trim().length > 0;
  const hasActiveFacilityFilter = isAllFacilitiesMode && scopeFacilityFilter !== '';
  const hasActiveFilter = quickFilter !== null || hasActiveFacilityFilter;

  const stats = useMemo(() => {
    let unlocked = 0;
    let lowBattery = 0;
    let offline = 0;
    let occupied = 0;
    let unoccupied = 0;
    for (const u of units) {
      if (lockStateOf(u) === 'unlocked') unlocked++;
      if (isLowOrUnknownBattery(u)) lowBattery++;
      if (isOccupiedUnit(u)) occupied++;
      if (isUnoccupiedUnit(u)) unoccupied++;
      const status = (u.blulok_device?.device_status ?? u.device_status ?? '').toLowerCase();
      if (status === 'offline') offline++;
    }
    return { unlocked, lowBattery, offline, occupied, unoccupied };
  }, [units]);

  const handleUnlock = async (unit: UnitRow) => {
    const deviceId = unit.blulok_device?.id;
    if (!deviceId) return;

    const previousStatus = deviceLockStatus(unit) ?? 'locked';
    let clearTransitionalAfterRefresh = false;

    const patchUnitLockStatus = (lockStatus: string) => {
      setUnits((prev) =>
        prev.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                lock_status: lockStatus,
                blulok_device: u.blulok_device
                  ? { ...u.blulok_device, lock_status: lockStatus }
                  : u.blulok_device,
              }
            : u,
        ),
      );
    };

    const refreshAfterUnlockAttempt = async () => {
      await fetchUnits();
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      setUnits((prev) =>
        prev.map((u) => {
          if (u.id !== unit.id) return u;
          const status = deviceLockStatus(u);
          if (status === 'unlocking' || status === 'locking') {
            return {
              ...u,
              lock_status: previousStatus,
              blulok_device: u.blulok_device
                ? { ...u.blulok_device, lock_status: previousStatus }
                : u.blulok_device,
            };
          }
          return u;
        }),
      );
    };

    await requestUnlock({
      deviceId,
      watchKey: unit.id,
      timeoutMs: resolveLockTimeoutMsForUnit(unit, globalFacilities),
      getLockStatus: () => {
        const cur = unitsRef.current.find((u) => u.id === unit.id);
        return deviceLockStatus(cur ?? unit);
      },
      applyOptimisticUnlocking: () => {
        patchUnitLockStatus('unlocking');
      },
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchUnitLockStatus(status);
      },
      refresh: refreshAfterUnlockAttempt,
      requiresTenantOverride: requiresOccupiedUnitOverride(unit, authState.user?.id),
      unitLabel: unit.unit_number,
    });
  };

  useEffect(() => {
    for (const unit of units) {
      syncLockStatus(unit.id, deviceLockStatus(unit));
    }
  }, [units, syncLockStatus]);

  const layout = getWidgetLayoutProfile(size, {
    isFullscreen,
    gridW: gridSize?.w,
    gridH: gridSize?.h,
  });
  const showTableColumns =
    isFullscreen || layout.isWide || size === 'large' || size === 'huge' || size === 'huge-wide';
  const showMetaColumns = showTableColumns && !layout.isVerticalDock;
  const showTenantColumn =
    showMetaColumns || layout.isHorizontalDock || isFullscreen;
  const showDeviceColumn = showMetaColumns || isFullscreen;
  const showFacilityColumn = isAllFacilitiesMode;
  const showListHeader = (showTenantColumn || showFacilityColumn) && displayed.length > 0;
  const rowLayout: RowLayoutFlags = {
    isDock: layout.isDock,
    showTableColumns,
    showTenantColumn,
    showDeviceColumn,
    showFacilityColumn,
  };
  const showInlineStats = layout.isHorizontalDock || isFullscreen || layout.density === 'spacious';

  return (
    <Widget
      id={id}
      title={`${title} ${units.length ? `(${units.length})` : ''}`}
      size={size}
      availableSizes={availableSizes ?? ['large', 'large-wide', 'huge', 'huge-wide', 'dock-top', 'dock-bottom', 'dock-bottom-two-thirds']}
      onSizeChange={handleSizeChange}
      onRemove={onRemove}
      readOnly={readOnly}
      onFullscreenToggle={onFullscreenToggle}
      isFullscreen={isFullscreen}
      gridSize={gridSize}
    >
      <div className={WIDGET_BODY_CLASS}>
        <div
          className={`flex items-center gap-2 flex-shrink-0 ${layout.isDock ? 'mb-2' : 'mb-3'}`}
        >
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={layout.isVerticalDock ? 'Search…' : 'Search units, tenants…'}
              className={`w-full pl-8 pr-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:border-[#147FD4] focus:ring-1 focus:ring-[#147FD4] text-gray-900 dark:text-gray-100 placeholder-gray-400 ${
                layout.isDock ? 'py-1 text-xs' : 'py-1.5 text-sm'
              }`}
            />
          </div>
          {showInlineStats && (
            <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1.5 sm:flex">
              <QuickFilterToggle
                active={quickFilter === 'occupied'}
                dotClassName="bg-[#147FD4]"
                label={`${stats.occupied} occupied`}
                onClick={() => toggleQuickFilter('occupied')}
              />
              <QuickFilterToggle
                active={quickFilter === 'unoccupied'}
                dotClassName="bg-gray-400"
                label={`${stats.unoccupied} unoccupied`}
                onClick={() => toggleQuickFilter('unoccupied')}
              />
              <QuickFilterToggle
                active={quickFilter === 'unlocked'}
                dotClassName="bg-rose-500"
                label={`${stats.unlocked} unlocked`}
                onClick={() => toggleQuickFilter('unlocked')}
              />
              <QuickFilterToggle
                active={quickFilter === 'low_battery'}
                dotClassName="bg-amber-500"
                label={`${stats.lowBattery} low batt`}
                onClick={() => toggleQuickFilter('low_battery')}
              />
              {stats.offline > 0 && (
                <span className={`inline-flex items-center gap-1 tabular-nums ${TYPE.meta}`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                  {stats.offline} offline
                </span>
              )}
            </div>
          )}
        </div>

        {isAllFacilitiesMode && (
          <div className={`flex-shrink-0 ${layout.isDock ? 'mb-2' : 'mb-3'}`}>
            <label className="sr-only" htmlFor={`${id}-facility-filter`}>
              Filter by facility
            </label>
            <select
              id={`${id}-facility-filter`}
              value={scopeFacilityFilter}
              onChange={(e) => setScopeFacilityFilter(e.target.value)}
              className={`no-drag w-full max-w-xs rounded-md border border-gray-200 bg-gray-50 text-gray-900 focus:border-[#147FD4] focus:outline-none focus:ring-1 focus:ring-[#147FD4] dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 ${
                layout.isDock ? 'py-1 pl-2 pr-7 text-xs' : 'py-1.5 pl-3 pr-8 text-sm'
              }`}
            >
              <option value="">All facilities</option>
              {facilityOptions.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className={`mb-2 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-800 dark:bg-rose-900/20 ${TYPE.meta} text-rose-700 dark:text-rose-300`}>
            <ExclamationTriangleIcon className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className={`${WIDGET_LIST_SCROLL_CLASS} pr-1 -mr-1`}>
          {loading && units.length === 0 ? (
            <ul className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="h-10 rounded-md bg-gray-100 dark:bg-gray-800 animate-pulse"
                />
              ))}
            </ul>
          ) : displayed.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex h-full flex-col items-center justify-center gap-3 px-4 py-8 text-center ${TYPE.meta}`}
            >
              <LockClosedIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <div className="space-y-1">
                <p className={`${TYPE.bodyStrong} text-gray-700 dark:text-gray-300`}>
                  {hasActiveSearch && hasActiveFilter
                    ? 'No units match your search and filter.'
                    : hasActiveFacilityFilter
                      ? 'No units match the selected facility.'
                    : hasActiveFilter && quickFilter
                      ? quickFilterEmptyMessage(quickFilter)
                      : hasActiveSearch
                        ? 'No units match your search.'
                        : 'No units to display.'}
                </p>
                {(hasActiveFilter || hasActiveSearch) && units.length > 0 && (
                  <p className={TYPE.meta}>
                    {hasActiveFilter
                      ? 'Try clearing the filter or adjusting your search.'
                      : 'Try a different search term.'}
                  </p>
                )}
              </div>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickFilter(null);
                    setScopeFacilityFilter('');
                  }}
                  className={`no-drag rounded-full border border-[#147FD4]/30 px-3 py-1 ${TYPE.link}`}
                >
                  Show all units
                </button>
              )}
            </motion.div>
          ) : (
            <motion.ul
              layout
              className={layout.isHorizontalDock ? 'space-y-1' : 'space-y-1.5'}
            >
              {showListHeader && (
                <ListColumnHeader
                  layout={rowLayout}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleColumnSort}
                />
              )}
              <AnimatePresence initial={false}>
                {displayed.map((unit, rowIndex) => {
                  const expanded = expandedId === unit.id;
                  const lockState = lockStateOf(unit);
                  const metrics = deviceMetrics(unit);
                  const tenantLabel = tenantDisplayName(unit);
                  const tenantCell = tenantLabel ? (
                    <span className="truncate">{tenantLabel}</span>
                  ) : (
                    <span className="italic text-gray-400">Unassigned</span>
                  );
                  const rowAria = `Unit ${unit.unit_number}${tenantLabel ? `, ${tenantLabel}` : ''}`;
                  const unitSubline = [unit.unit_type].filter(Boolean);
                  const lastActivityTime = formatRelativeWithExact(unit.last_activity, RELATIVE_UNITS_ACTIVITY_OPTS);

                  return (
                    <motion.li
                      layout
                      key={unit.id}
                      {...fadeIn}
                      className={`overflow-hidden rounded-lg border transition-[border-color,box-shadow,background-color] ${
                        expanded
                          ? 'border-[#147FD4]/50 shadow-[0_0_0_1px_rgba(20,127,212,0.2)] ring-1 ring-[#147FD4]/10'
                          : 'border-gray-200/90 dark:border-gray-700/90 hover:border-gray-300 dark:hover:border-gray-600'
                      } ${
                        rowIndex % 2 === 0
                          ? 'bg-white dark:bg-gray-900/35'
                          : 'bg-gray-50/60 dark:bg-gray-900/55'
                      } hover:bg-gray-50/90 dark:hover:bg-gray-800/50`}
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : unit.id)}
                        aria-label={rowAria}
                        aria-expanded={expanded}
                        style={{ gridTemplateColumns: rowGridTemplateColumns(rowLayout) }}
                        className={`grid w-full items-center gap-x-2 gap-y-0.5 text-left transition-colors ${
                          layout.isDock ? 'px-2 py-1.5' : 'px-3 py-2'
                        }`}
                      >
                        {showFacilityColumn && (
                          <div className={`min-w-0 truncate ${TYPE.meta}`} title={unit.facility_name}>
                            {unit.facility_name ?? '—'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className={`truncate ${TYPE.bodyStrong}`}>
                              Unit {unit.unit_number}
                            </span>
                            <UnitStatusChip status={unit.status} compact />
                          </div>
                          {(showTableColumns || !showDeviceColumn) && (
                            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              {unitSubline.length > 0 && (
                                <span className={`truncate ${TYPE.meta}`}>
                                  {unitSubline.join(' · ')}
                                </span>
                              )}
                              {!showDeviceColumn && metrics.serial && (
                                <span
                                  className={`truncate tabular-nums ${TYPE.meta}`}
                                  title={metrics.serial}
                                >
                                  {metrics.serial}
                                </span>
                              )}
                              {!showDeviceColumn && (
                                <DeviceStatusBadge status={metrics.status} compact />
                              )}
                            </div>
                          )}
                        </div>

                        {showTenantColumn && (
                          <div className={`min-w-0 truncate ${TYPE.body}`}>
                            {tenantCell}
                          </div>
                        )}

                        {showDeviceColumn && (
                          <div className="flex min-w-0 flex-col items-center">
                            <DeviceStatusBadge status={metrics.status} compact />
                          </div>
                        )}

                        <DeviceStatusIcons
                          metrics={metrics}
                          lockState={lockState}
                          compact={layout.isDock}
                        />

                        <motion.div
                          layout
                          className={`flex justify-center ${TYPE.meta}`}
                          title={lastActivityTime.title}
                        >
                          <span className="inline-flex max-w-full items-center gap-0.5 whitespace-nowrap">
                            <ClockIcon
                              className={`shrink-0 ${layout.isDock ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
                            />
                            {lastActivityTime.display}
                          </span>
                        </motion.div>

                        <motion.span
                          animate={{ rotate: expanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex justify-end text-gray-400"
                        >
                          <ChevronDownIcon
                            className={layout.isDock ? 'h-3.5 w-3.5' : 'h-4 w-4'}
                          />
                        </motion.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {expanded && (
                          <ExpandedDetails
                            unit={unit}
                            isSubmitting={isSubmitting(unit.id)}
                            onUnlock={() => void handleUnlock(unit)}
                            canManageTenantInvites={canManageTenantInvites}
                            onTenantInviteComplete={() =>
                              void fetchUnitsRef.current({ background: true })
                            }
                          />
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </div>
      {tenantOverrideDialog}
    </Widget>
  );
};

export default UnitsManagerWidget;
