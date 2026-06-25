import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  ShieldCheckIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';
import { getDeviceIconMeta, type DeviceIconInput } from '@/utils/device-icon.utils';
import { motion } from 'framer-motion';
import { apiService } from '@/services/api.service';
import { useToast } from '@/contexts/ToastContext';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { DeviceSyncLogEntry, GatewayDeviceSyncLogRecord } from '@/types/gateway.types';
import { formatDateTimeParts } from '@/utils/datetime.utils';

const PAGE_SIZE = 25;
const WS_DISCONNECTED_POLL_MS = 8_000;

const ACTION_META: Record<
  DeviceSyncLogEntry['action'],
  { label: string; chip: string; dot: string }
> = {
  added: {
    label: 'Added',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  removed: {
    label: 'Removed',
    chip: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  unchanged: {
    label: 'Unchanged',
    chip: 'bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300',
    dot: 'bg-gray-400',
  },
  updated: {
    label: 'Updated',
    chip: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  skipped_manual: {
    label: 'Skipped (manual)',
    chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
    dot: 'bg-amber-500',
  },
  error: {
    label: 'Error',
    chip: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    dot: 'bg-red-500',
  },
};

function deviceIconInput(entry: DeviceSyncLogEntry): DeviceIconInput {
  if (entry.device_kind === 'blulok') {
    return { device_category: 'blulok' };
  }
  if (entry.device_kind === 'access_control') {
    return { device_category: 'access_control' };
  }
  return {
    device_category: 'network_infra',
    device_kind: entry.device_kind,
  };
}

function SummaryChips({ summary }: { summary: GatewayDeviceSyncLogRecord['summary'] }) {
  const locks = summary.locks;
  const access = summary.access_control;
  const networkInfra = summary.network_infra;
  if (!locks && !access && !networkInfra) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">No device partitions</span>;
  }

  const rows = [
    locks ? { kind: 'BluLok', data: locks } : null,
    access ? { kind: 'Access', data: access } : null,
    networkInfra ? { kind: 'Network', data: networkInfra } : null,
  ].filter(Boolean) as Array<{ kind: string; data: NonNullable<typeof locks> }>;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
      {rows.map(({ kind, data }) => (
        <span key={kind} className="inline-flex flex-wrap items-center gap-1">
          <span className="font-medium text-gray-700 dark:text-gray-300">{kind}</span>
          {data.added > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{data.added}</span>}
          {data.removed > 0 && <span className="text-rose-600 dark:text-rose-400">−{data.removed}</span>}
          {(data.updated ?? 0) > 0 && <span className="text-sky-600 dark:text-sky-400">~{data.updated}</span>}
          {(data.skipped_manual ?? 0) > 0 && (
            <span className="text-amber-700 dark:text-amber-300">skip {data.skipped_manual}</span>
          )}
          {data.unchanged > 0 && <span>{data.unchanged} ok</span>}
          {data.errors.length > 0 && <span className="text-red-600 dark:text-red-400">{data.errors.length} err</span>}
        </span>
      ))}
    </div>
  );
}

function formatLogTimestamp(when: Date): { date: string; time: string } {
  return formatDateTimeParts(when) ?? { date: '—', time: '—' };
}

function syncKindBadge(syncKind: GatewayDeviceSyncLogRecord['sync_kind']) {
  const isInventory = syncKind === 'inventory';
  return (
    <span
      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isInventory
          ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
          : 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
      }`}
    >
      {isInventory ? 'Inventory' : 'State'}
    </span>
  );
}

function syncSourceBadge(source: string) {
  const isGatewayWs = source === 'gateway_ws';
  return (
    <span
      className="inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
      title={source.replace(/_/g, ' ')}
    >
      {isGatewayWs ? 'Gateway' : source.replace(/_/g, ' ')}
    </span>
  );
}

function SyncLogRow({ log }: { log: GatewayDeviceSyncLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const when = new Date(log.created_at);
  const { date, time } = formatLogTimestamp(when);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <td className="w-8 px-2 py-2 text-gray-400 align-top">
          <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRightIcon className="h-4 w-4" />
          </motion.div>
        </td>
        <td className="w-[7.5rem] whitespace-nowrap px-2 py-2 align-top">
          <div className="text-[11px] leading-tight text-gray-500 dark:text-gray-400 tabular-nums">{date}</div>
          <div className="text-xs leading-tight text-gray-800 dark:text-gray-200 tabular-nums">{time}</div>
        </td>
        <td className="w-[5.5rem] whitespace-nowrap px-2 py-2 align-top">{syncKindBadge(log.sync_kind)}</td>
        <td className="w-[5rem] whitespace-nowrap px-2 py-2 align-top">{syncSourceBadge(log.source)}</td>
        <td className="px-3 py-2 align-top min-w-0">
          <SummaryChips summary={log.summary} />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30 p-0">
            <div className="px-4 py-3">
              {log.entries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No per-device entries recorded.</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      <th className="py-1.5 pr-3 font-medium">Device</th>
                      <th className="py-1.5 pr-3 font-medium">Label</th>
                      <th className="py-1.5 pr-3 font-medium">Action</th>
                      <th className="py-1.5 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                    {log.entries.map((entry, idx) => {
                      const meta = ACTION_META[entry.action] ?? ACTION_META.error;
                      const iconMeta = getDeviceIconMeta(deviceIconInput(entry));
                      const KindIcon = iconMeta.Icon;
                      return (
                        <tr key={`${entry.identifier}-${entry.action}-${idx}`}>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-900 dark:text-white">
                              <KindIcon className={`h-3.5 w-3.5 ${iconMeta.iconClass}`} />
                              {entry.identifier}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-500 dark:text-gray-400 max-w-[12rem] truncate">
                            {entry.label && entry.label !== entry.identifier ? entry.label : '—'}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.chip}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2 text-xs text-gray-600 dark:text-gray-400">
                            {entry.reason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

interface GatewayDeviceSyncHistoryProps {
  gatewayId: string;
  facilityId: string;
  liveEnabled?: boolean;
}

export function GatewayDeviceSyncHistory({
  gatewayId,
  facilityId,
  liveEnabled = false,
}: GatewayDeviceSyncHistoryProps) {
  const { addToast } = useToast();
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const [logs, setLogs] = useState<GatewayDeviceSyncLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const loadSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const offsetRef = useRef(0);

  const mergeIncomingLogs = useCallback((incoming: GatewayDeviceSyncLogRecord[]) => {
    if (incoming.length === 0) return;
    setLogs((prev) => {
      const existing = new Set(prev.map((log) => log.id));
      const fresh = incoming.filter((log) => !existing.has(log.id));
      if (fresh.length === 0) return prev;
      setTotal((current) => current + fresh.length);
      return [...fresh, ...prev];
    });
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean; manual?: boolean; reset?: boolean; loadMore?: boolean }) => {
      if (!gatewayId) return;
      const seq = ++loadSeqRef.current;
      const isInitial = !opts?.silent && !opts?.manual && !opts?.loadMore && !hasLoadedOnceRef.current;
      const nextOffset = opts?.reset ? 0 : opts?.loadMore ? offsetRef.current : 0;

      try {
        if (opts?.manual) setManualRefreshing(true);
        else if (opts?.loadMore) setLoadingMore(true);
        else if (isInitial) setInitialLoading(true);

        if (opts?.manual) setRefreshWarning(null);
        if (isInitial) setFatalError(null);

        const res = await apiService.getGatewayDeviceSyncLogs(gatewayId, {
          limit: PAGE_SIZE,
          offset: nextOffset,
        });
        if (seq !== loadSeqRef.current) return;

        const incoming = res.logs ?? [];
        if (opts?.loadMore) {
          setLogs((prev) => [...prev, ...incoming]);
        } else {
          setLogs(incoming);
        }

        offsetRef.current = opts?.loadMore ? nextOffset + incoming.length : incoming.length;
        setTotal(res.total ?? 0);
        setHasMore(Boolean(res.hasMore));
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        console.error('Failed to load gateway device sync logs', err);

        if (opts?.manual && hasLoadedOnceRef.current) {
          setRefreshWarning('Could not refresh — showing last loaded data.');
          addToast({ type: 'error', title: 'Could not refresh sync history' });
        } else if (!opts?.silent && !opts?.loadMore) {
          setFatalError('Could not load device inventory sync history.');
        }
      } finally {
        if (seq !== loadSeqRef.current) return;
        setInitialLoading(false);
        setManualRefreshing(false);
        setLoadingMore(false);
      }
    },
    [gatewayId, addToast],
  );

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    setHasLoadedOnce(false);
    setInitialLoading(true);
    setFatalError(null);
    setRefreshWarning(null);
    offsetRef.current = 0;
    void load({ reset: true });
  }, [gatewayId, load]);

  useEffect(() => {
    if (!liveEnabled || !gatewayId) return;

    const subscriptionId = subscribe(
      'gateway_device_sync_logs',
      (data: { logs?: GatewayDeviceSyncLogRecord[] }) => {
        mergeIncomingLogs(data?.logs ?? []);
      },
      undefined,
      { filters: { facility_id: facilityId, gateway_id: gatewayId } },
    );

    return () => {
      if (subscriptionId) unsubscribe(subscriptionId);
    };
  }, [subscribe, unsubscribe, liveEnabled, gatewayId, facilityId, mergeIncomingLogs]);

  useEffect(() => {
    if (!liveEnabled || !gatewayId || isConnected) return;

    const timer = window.setInterval(() => {
      void load({ silent: true, reset: true });
    }, WS_DISCONNECTED_POLL_MS);

    return () => window.clearInterval(timer);
  }, [liveEnabled, gatewayId, isConnected, load]);

  const showInitialSpinner = initialLoading && !hasLoadedOnce;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
              Device inventory sync history
            </h3>
            {liveEnabled && (
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 ${
                  isConnected
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                <SignalIcon className={`h-3.5 w-3.5 ${isConnected ? 'text-emerald-500' : ''}`} />
                {isConnected ? 'Live' : 'Polling'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Audit trail when the gateway pushes inventory via{' '}
            <code className="text-xs font-mono">/devices/inventory</code>. This is separate from the{' '}
            <strong className="font-medium">Sync</strong> tab&apos;s manual device-status pull, which is not recorded here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ manual: true, reset: true })}
          disabled={manualRefreshing || showInitialSpinner}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${manualRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {refreshWarning && logs.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-200">{refreshWarning}</p>
        </div>
      )}

      {showInitialSpinner ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <ArrowPathIcon className="h-6 w-6 animate-spin mr-2" />
          Loading sync history…
        </div>
      ) : fatalError ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{fatalError}</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <ServerIcon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">No inventory syncs yet</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            History appears after the gateway sends its first{' '}
            <code className="text-xs font-mono">/devices/inventory</code> payload.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Showing {logs.length} of {total} sync{total === 1 ? '' : 's'}
          </p>
          <div className="status-area-scrollbar max-h-[min(32rem,calc(100vh-18rem))] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700 text-left">
              <colgroup>
                <col className="w-8" />
                <col className="w-[7.5rem]" />
                <col className="w-[5.5rem]" />
                <col className="w-[5rem]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr>
                  <th className="px-2 py-2" aria-hidden />
                  <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Time
                  </th>
                  <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Kind
                  </th>
                  <th className="px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Source
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Summary
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80 bg-white dark:bg-gray-800">
                {logs.map((log) => (
                  <SyncLogRow key={log.id} log={log} />
                ))}
                {hasMore && (
                  <tr className="bg-gray-50/80 dark:bg-gray-900/40">
                    <td colSpan={5} className="px-4 py-4 text-center border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => void load({ silent: true, loadMore: true })}
                        disabled={loadingMore}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {loadingMore ? (
                          <>
                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            Loading…
                          </>
                        ) : (
                          'Load more'
                        )}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
