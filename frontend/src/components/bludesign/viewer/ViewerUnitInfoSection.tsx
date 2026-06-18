/**
 * Full unit detail panel for the facility viewer — parity with Units Manager expanded row.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowTopRightOnSquareIcon,
  Battery0Icon,
  Battery100Icon,
  Battery50Icon,
  ClockIcon,
  EnvelopeIcon,
  LockClosedIcon,
  LockOpenIcon,
  PhoneIcon,
  SignalIcon,
  SignalSlashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import type { BluLokUnit } from '@/api/bludesign';
import { apiService } from '@/services/api.service';
import { RemoteUnlockButton } from '@/components/Lock/RemoteUnlockButton';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { useAuth } from '@/contexts/AuthContext';
import { resolveLockTimeoutMsForUnit } from '@/utils/facilityLockTimeout.utils';
import { canExecuteRemoteUnlock, canUseRemoteUnlockControls } from '@/utils/unitLock.utils';
import type { ViewerSmartAssetState } from './viewerLiveState';
import {
  formatAccessAction,
  formatAccessMethod,
  getAccessUserDisplay,
} from '@/utils/access-history-display.utils';
import type { AccessLog } from '@/types/access-history.types';
import { formatRelativeWithExact, RELATIVE_UNITS_ACTIVITY_OPTS } from '@/utils/datetime.utils';

type LockState = 'locked' | 'unlocked' | 'unknown' | 'unlocking' | 'locking';

interface AccessLogEntry {
  id?: string;
  occurred_at?: string;
  created_at?: string;
  action?: string;
  method?: string;
  result?: string;
  user_name?: string | null;
}

const TYPE = {
  label: 'text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400',
  body: 'text-sm text-gray-800 dark:text-gray-200',
  bodyStrong: 'text-sm font-medium text-gray-900 dark:text-white',
  meta: 'text-xs text-gray-500 dark:text-gray-400',
  link: 'text-xs font-medium text-[#147FD4] transition-colors hover:text-[#0f6cb6] hover:underline',
} as const;

const DETAIL_CARD =
  'rounded-lg border border-gray-100 bg-white/80 p-3 dark:border-gray-700/60 dark:bg-gray-800/50';

/** Keep in sync with ViewerPropertiesPanel width tokens. */
const VIEWER_PANEL_WIDTH_COMPACT = '21.6rem';
const VIEWER_PANEL_WIDTH_EXPANDED = '38.88rem';
const LAYOUT_CROSSFADE = { duration: 0.38, ease: [0.32, 0.72, 0, 1] as const };

const EXPAND_ROW_CARD = `${DETAIL_CARD} flex min-h-[5rem] flex-1 flex-col`;
const EXPAND_ROW_BODY = 'min-h-0 flex-1';

const unitStatusMeta: Record<string, { label: string; className: string }> = {
  occupied: {
    label: 'Occupied',
    className:
      'bg-[#147FD4]/10 text-[#147FD4] dark:bg-[#147FD4]/20 dark:text-[#5eb3f0]',
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

const buildAccessHistoryUrl = (unit: BluLokUnit): string => {
  const params = new URLSearchParams({ unit_id: unit.id });
  if (unit.facility_id) params.set('facility_id', unit.facility_id);
  return `/access-history?${params.toString()}`;
};

const SectionNavLink: React.FC<{
  label: string;
  onClick: () => void;
  compact?: boolean;
}> = ({ label, onClick, compact = false }) => (
  <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 ${TYPE.link}`}>
    {label}
    <ArrowTopRightOnSquareIcon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
  </button>
);

const ExpandSectionHeader: React.FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h4 className={TYPE.label}>{title}</h4>
    {action}
  </div>
);

const ExpandRowCard: React.FC<{
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, action, bodyClassName = EXPAND_ROW_BODY, children }) => (
  <div className={EXPAND_ROW_CARD}>
    <ExpandSectionHeader title={title} action={action} />
    <div className={bodyClassName}>{children}</div>
  </div>
);

const MetaToolbarDivider: React.FC = () => (
  <span className="h-3.5 w-px shrink-0 bg-gray-200/90 dark:bg-gray-700" aria-hidden />
);

const ExpandedMetaToolbar: React.FC<{
  unit: BluLokUnit;
  lockState: LockState;
  deviceStatus: string | null | undefined;
  lastActivity: string | null | undefined;
  onUnitDetails: () => void;
}> = ({ unit, lockState, deviceStatus, lastActivity, onUnitDetails }) => {
  const lastActivityTime = formatRelativeWithExact(lastActivity, RELATIVE_UNITS_ACTIVITY_OPTS);
  return (
  <div className="flex items-center gap-2 border-b border-gray-100/90 bg-gray-50/50 px-4 py-2 dark:border-gray-700/60 dark:bg-gray-800/40">
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <UnitStatusChip status={unit.status} />
      <LockBadge state={lockState} />
      <DeviceStatusBadge status={deviceStatus} />
    </div>
    <MetaToolbarDivider />
    <div
      className={`flex min-w-0 flex-1 items-center gap-1.5 ${TYPE.meta}`}
      title={lastActivityTime.title}
    >
      <ClockIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
      <span className="truncate">Last access · {lastActivityTime.display}</span>
    </div>
    <MetaToolbarDivider />
    <div className="shrink-0">
      <SectionNavLink label="Unit details" compact onClick={onUnitDetails} />
    </div>
  </div>
  );
};

const UnitStatusChip: React.FC<{ status?: string | null }> = ({ status }) => {
  const key = (status ?? '').toLowerCase();
  const meta = unitStatusMeta[key];
  if (!meta) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${meta.className}`}
    >
      {meta.label}
    </span>
  );
};

const DeviceStatusBadge: React.FC<{ status?: string | null }> = ({ status }) => {
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
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          key === 'online'
            ? 'bg-emerald-500'
            : key === 'offline'
              ? 'bg-gray-400'
              : key === 'low_battery'
                ? 'bg-amber-500'
                : key === 'error'
                  ? 'bg-rose-500'
                  : 'bg-gray-300 dark:bg-gray-600'
        }`}
      />
      {meta.label}
    </span>
  );
};

const BatteryGauge: React.FC<{ level?: number | null; deviceStatus?: string | null }> = ({
  level,
  deviceStatus,
}) => {
  if (level == null) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500" title="Battery unknown">
        <Battery0Icon className="h-4 w-4" />
        <span className={`${TYPE.meta} tabular-nums`}>—</span>
      </span>
    );
  }
  const Icon = level >= 70 ? Battery100Icon : level >= 30 ? Battery50Icon : Battery0Icon;
  const cls =
    level >= 70 ? 'text-emerald-500' : level >= 30 ? 'text-amber-500' : 'text-rose-500';
  const label = `${Math.round(level)}%${deviceStatus === 'low_battery' ? ' · low' : ''}`;
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`} title={`Battery ${label}`}>
      <Icon className="h-4 w-4" />
      <span className={`${TYPE.meta} tabular-nums`}>{Math.round(level)}%</span>
    </span>
  );
};

const SignalGauge: React.FC<{ signal?: number | null; deviceStatus?: string | null }> = ({
  signal,
  deviceStatus,
}) => {
  if (deviceStatus === 'offline') {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400" title="Offline">
        <SignalSlashIcon className="h-4 w-4" />
      </span>
    );
  }
  if (signal == null) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400" title="Signal unknown">
        <SignalIcon className="h-4 w-4" />
      </span>
    );
  }
  const bars = signal > -55 ? 4 : signal > -70 ? 3 : signal > -85 ? 2 : signal > -100 ? 1 : 0;
  const cls =
    bars >= 3 ? 'text-emerald-500' : bars === 2 ? 'text-amber-500' : 'text-rose-500';
  return (
    <span className={`inline-flex items-center gap-0.5 ${cls}`} title={`Signal ${signal} dBm`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={`block w-0.5 rounded-sm ${i < bars ? 'bg-current' : 'bg-current/20'}`}
          style={{ height: `${4 + i * 2}px` }}
        />
      ))}
    </span>
  );
};

const LockBadge: React.FC<{ state: LockState }> = ({ state }) => {
  const isLocked = state === 'locked';
  const isUnlocked = state === 'unlocked';
  const isUnlocking = state === 'unlocking';
  const isLocking = state === 'locking';
  const Icon = isUnlocked || isUnlocking ? LockOpenIcon : LockClosedIcon;
  const cls = isUnlocking || isLocking
    ? 'bg-[#147FD4]/15 text-[#147FD4] dark:bg-[#147FD4]/25 dark:text-[#5eb3f0]'
    : isLocked
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
      : state === 'unknown'
        ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
        : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400';
  const label = isUnlocking
    ? 'Unlocking'
    : isLocking
      ? 'Locking'
      : state === 'unknown'
        ? 'Unknown'
        : isLocked
          ? 'Locked'
          : 'Unlocked';
  return (
    <span
      title={label}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls} ${isUnlocking || isLocking ? 'animate-pulse' : ''}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
};

const AccessLogRow: React.FC<{ log: AccessLogEntry; index: number }> = ({ log, index }) => {
  const ts = log.occurred_at ?? log.created_at ?? '';
  const accessLog = log as AccessLog;
  const succeeded = accessLog.success ?? (log.result ?? '').toLowerCase() === 'success';
  const userLabel = getAccessUserDisplay(accessLog).primary;
  const relativeTs = formatRelativeWithExact(ts, RELATIVE_UNITS_ACTIVITY_OPTS);

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`flex items-center justify-between gap-3 rounded-md bg-gray-50/90 px-2 py-1.5 ${TYPE.meta} dark:bg-gray-900/45`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
            succeeded ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />
        <span className="text-gray-800 dark:text-gray-200">{formatAccessAction(accessLog.action ?? 'event')}</span>
        <span className="truncate">{userLabel !== '—' ? userLabel : formatAccessMethod(accessLog.method ?? '')}</span>
      </span>
      <span className="shrink-0 tabular-nums" title={relativeTs.title}>
        {relativeTs.display}
      </span>
    </motion.li>
  );
};

const resolveLockState = (lockStatus?: string | null): LockState => {
  const raw = (lockStatus ?? '').toString().toLowerCase();
  if (raw === 'locking') return 'locking';
  if (raw === 'unlocking') return 'unlocking';
  if (raw === 'locked') return 'locked';
  if (raw === 'unlocked') return 'unlocked';
  return 'unknown';
};

export interface ViewerUnitInfoSectionProps {
  unit: BluLokUnit;
  liveState?: ViewerSmartAssetState;
  expanded: boolean;
}

export const ViewerUnitInfoSection: React.FC<ViewerUnitInfoSectionProps> = ({
  unit,
  liveState,
  expanded,
}) => {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const { facilities } = useGlobalFacility();
  const showRemoteUnlock = canUseRemoteUnlockControls(authState.user?.role);
  const { requestUnlock, isSubmitting, syncLockStatus } = useRemoteUnlockAction();
  const [optimisticLockStatus, setOptimisticLockStatus] = useState<string | null>(null);
  const [logs, setLogs] = useState<AccessLogEntry[] | null>(null);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const lockStatusRef = useRef<string | undefined>(undefined);

  const tenantName = unit.tenant?.name?.trim() || 'Unassigned';
  const tenantId = unit.tenant?.id;
  const tenantEmail = unit.tenant?.email ?? null;
  const tenantPhone = unit.tenant?.phone ?? null;
  const deviceId = unit.device?.id;
  const hasDevice = Boolean(deviceId);
  const supportsRemoteUnlock = unit.device?.supports_remote_lock !== false;

  const battery = liveState?.batteryLevel ?? unit.device?.battery_level ?? null;
  const signal = unit.device?.signal_strength ?? null;
  const deviceStatus = unit.device?.device_status ?? null;
  const lastActivity = liveState?.lastActivity ?? unit.last_activity ?? null;
  const lastActivityTime = formatRelativeWithExact(lastActivity, RELATIVE_UNITS_ACTIVITY_OPTS);
  const firmware = unit.device?.firmware_version ?? null;

  const lockStatus = useMemo(() => {
    return optimisticLockStatus ?? liveState?.lockStatus ?? unit.device?.lock_status ?? undefined;
  }, [optimisticLockStatus, liveState?.lockStatus, unit.device?.lock_status]);

  lockStatusRef.current = lockStatus;
  const lockState = resolveLockState(lockStatus);

  useEffect(() => {
    syncLockStatus(unit.id, lockStatus);
  }, [unit.id, lockStatus, syncLockStatus]);

  useEffect(() => {
    setOptimisticLockStatus(null);
  }, [unit.id, liveState?.lockStatus]);

  useEffect(() => {
    if (!expanded) return;

    let cancelled = false;
    setLogsLoading(true);
    setLogsError(null);
    apiService
      .getUnitAccessHistory(unit.id, { limit: 5 })
      .then((res) => {
        if (cancelled) return;
        const arr = (res?.logs ?? res?.data ?? []) as AccessLogEntry[];
        setLogs(Array.isArray(arr) ? arr : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLogsError(err instanceof Error ? err.message : 'Failed to load access log');
        setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unit.id, expanded]);

  const handleUnlock = useCallback(async () => {
    if (!deviceId) return;
    if (
      !canExecuteRemoteUnlock({
        hasDevice: true,
        remoteSupported: supportsRemoteUnlock,
        lockStatus: lockStatusRef.current,
        deviceStatus,
        isSubmitting: isSubmitting(unit.id),
      })
    ) {
      return;
    }
    const previousStatus = lockStatusRef.current ?? 'locked';

    await requestUnlock({
      deviceId,
      watchKey: unit.id,
      timeoutMs: resolveLockTimeoutMsForUnit(unit, facilities),
      getLockStatus: () => lockStatusRef.current,
      applyOptimisticUnlocking: () => setOptimisticLockStatus('unlocking'),
      revertOptimisticLockStatus: (status) => setOptimisticLockStatus(status),
      refresh: async () => {
        if (lockStatusRef.current === 'unlocking' || lockStatusRef.current === 'locking') {
          setOptimisticLockStatus(previousStatus);
        }
      },
    });
  }, [deviceId, unit, facilities, requestUnlock, supportsRemoteUnlock, deviceStatus, isSubmitting]);

  return (
    <div
      className={
        expanded ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'
      }
    >
      {/* Compact — fixed width so text never reflows during panel resize */}
      <motion.div
        initial={false}
        animate={{ opacity: expanded ? 0 : 1 }}
        transition={LAYOUT_CROSSFADE}
        className={
          expanded
            ? 'pointer-events-none absolute inset-x-0 top-0 z-0 p-4'
            : 'relative z-10 p-4'
        }
        style={{ width: VIEWER_PANEL_WIDTH_COMPACT, maxWidth: '100%' }}
        aria-hidden={expanded}
      >
        <div className={`${DETAIL_CARD} space-y-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <UnitStatusChip status={unit.status} />
            <LockBadge state={lockState} />
            <DeviceStatusBadge status={deviceStatus} />
          </div>

          <div>
            <p className={`${TYPE.label} mb-1.5`}>Tenant</p>
            {tenantId ? (
              <Link
                to={`/users/${tenantId}/details`}
                className={`flex items-center gap-2 ${TYPE.bodyStrong} text-[#147FD4] hover:text-[#0f6cb6] hover:underline`}
              >
                <UserCircleIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{tenantName}</span>
              </Link>
            ) : (
              <div className={`flex items-center gap-2 ${TYPE.body}`}>
                <UserCircleIcon className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="italic text-gray-400">Unassigned</span>
              </div>
            )}
          </div>

          <div
            className={`flex items-center gap-1.5 ${TYPE.meta}`}
            title={lastActivityTime.title}
          >
            <ClockIcon className="h-3.5 w-3.5 shrink-0" />
            <span>Last access · {lastActivityTime.display}</span>
          </div>
        </div>
      </motion.div>

      {/* Expanded — fixed width; clipped by panel overflow while resizing */}
      <motion.div
        initial={false}
        animate={{ opacity: expanded ? 1 : 0 }}
        transition={LAYOUT_CROSSFADE}
        className={
          expanded
            ? 'relative z-10 flex min-h-0 flex-1 flex-col'
            : 'pointer-events-none absolute inset-0 z-0 overflow-hidden'
        }
        style={{ width: VIEWER_PANEL_WIDTH_EXPANDED, maxWidth: '100%' }}
        aria-hidden={!expanded}
      >
        <ExpandedMetaToolbar
          unit={unit}
          lockState={lockState}
          deviceStatus={deviceStatus}
          lastActivity={lastActivity}
          onUnitDetails={() => navigate(`/units/${unit.id}`)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-4 py-2.5 pb-4">
          <ExpandRowCard
            title="Recent access"
            action={
              <SectionNavLink
                label="View all"
                onClick={() => navigate(buildAccessHistoryUrl(unit))}
              />
            }
          >
            {logsLoading ? (
              <ul className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="h-7 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800"
                  />
                ))}
              </ul>
            ) : logsError ? (
              <p className={`${TYPE.meta} text-rose-500`}>{logsError}</p>
            ) : logs && logs.length > 0 ? (
              <ul className="space-y-1.5">
                {logs.slice(0, 5).map((log, i) => (
                  <AccessLogRow
                    key={log.id ?? `${log.occurred_at ?? log.created_at}-${i}`}
                    log={log}
                    index={i}
                  />
                ))}
              </ul>
            ) : (
              <p className={TYPE.meta}>No recent events.</p>
            )}
          </ExpandRowCard>

          <div className={`grid gap-2.5 ${showRemoteUnlock ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <ExpandRowCard
              title="Tenant"
              action={
                tenantId ? (
                  <SectionNavLink
                    label="View tenant"
                    onClick={() => navigate(`/users/${tenantId}/details`)}
                  />
                ) : undefined
              }
            >
              <div className="space-y-2">
                <div className={`flex items-center gap-2 ${TYPE.bodyStrong}`}>
                  <UserCircleIcon className="h-4 w-4 shrink-0 text-gray-400" />
                  <span className="truncate">{tenantName}</span>
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
                {!tenantEmail && !tenantPhone && (
                  <p className={TYPE.meta}>
                    {tenantId ? 'No contact details on file.' : 'No tenant assigned.'}
                  </p>
                )}
              </div>
            </ExpandRowCard>

            {showRemoteUnlock && (
              <ExpandRowCard
                title="Remote unlock"
                bodyClassName="flex flex-1 flex-col justify-center"
              >
                <RemoteUnlockButton
                  lockStatus={lockStatus}
                  isSubmitting={isSubmitting(unit.id)}
                  hasDevice={hasDevice}
                  remoteSupported={supportsRemoteUnlock}
                  deviceStatus={deviceStatus}
                  fullWidth
                  size="sm"
                  onUnlock={handleUnlock}
                />
              </ExpandRowCard>
            )}
          </div>

          <ExpandRowCard
            title="Device"
            action={
              deviceId ? (
                <SectionNavLink
                  label="Device details"
                  onClick={() => navigate(`/devices/blulok/${deviceId}`)}
                />
              ) : undefined
            }
          >
            {hasDevice ? (
              <>
                {unit.device?.device_serial && (
                  <p className={`truncate ${TYPE.meta}`} title={unit.device.device_serial}>
                    <span className="text-gray-400 dark:text-gray-500">Serial · </span>
                    <span className="tabular-nums text-gray-700 dark:text-gray-300">
                      {unit.device.device_serial}
                    </span>
                  </p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-gray-50/80 px-2 py-1.5 dark:bg-gray-900/40">
                    <p className={`mb-1 ${TYPE.meta}`}>Battery</p>
                    <BatteryGauge level={battery} deviceStatus={deviceStatus} />
                  </div>
                  <div className="rounded-md bg-gray-50/80 px-2 py-1.5 dark:bg-gray-900/40">
                    <p className={`mb-1 ${TYPE.meta}`}>Signal</p>
                    <SignalGauge signal={signal} deviceStatus={deviceStatus} />
                    {signal != null && (
                      <p className={`mt-1 tabular-nums ${TYPE.meta}`}>{signal} dBm</p>
                    )}
                  </div>
                </div>
                {firmware && (
                  <p className={`mt-2 ${TYPE.meta}`}>
                    Firmware ·{' '}
                    <span className="tabular-nums text-gray-700 dark:text-gray-300">
                      {firmware}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className={TYPE.meta}>No BluLok device linked.</p>
            )}
          </ExpandRowCard>
        </div>
        </div>
      </motion.div>
    </div>
  );
};
