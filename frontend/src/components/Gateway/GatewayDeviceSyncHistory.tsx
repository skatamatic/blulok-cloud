import { useCallback, useEffect, useState } from 'react';
import {
  ArrowPathIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  ServerIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { AnimatePresence, motion } from 'framer-motion';
import { apiService } from '@/services/api.service';
import type { DeviceSyncLogEntry, GatewayDeviceSyncLogRecord } from '@/types/gateway.types';

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

function SummaryChips({ summary }: { summary: GatewayDeviceSyncLogRecord['summary'] }) {
  const locks = summary.locks;
  const access = summary.access_control;
  if (!locks && !access) {
    return <span className="text-xs text-gray-500 dark:text-gray-400">No device partitions in payload</span>;
  }

  const rows = [
    locks ? { kind: 'BluLok', data: locks } : null,
    access ? { kind: 'Access', data: access } : null,
  ].filter(Boolean) as Array<{ kind: string; data: NonNullable<typeof locks> }>;

  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(({ kind, data }) => (
        <motion.div
          key={kind}
          layout
          className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5 text-xs"
        >
          <span className="font-medium text-gray-700 dark:text-gray-300">{kind}</span>
          {data.added > 0 && (
            <span className={`rounded-full px-2 py-0.5 ${ACTION_META.added.chip}`}>+{data.added}</span>
          )}
          {data.removed > 0 && (
            <span className={`rounded-full px-2 py-0.5 ${ACTION_META.removed.chip}`}>−{data.removed}</span>
          )}
          {(data.skipped_manual ?? 0) > 0 && (
            <span className={`rounded-full px-2 py-0.5 ${ACTION_META.skipped_manual.chip}`}>
              skip {data.skipped_manual}
            </span>
          )}
          {data.unchanged > 0 && (
            <span className={`rounded-full px-2 py-0.5 ${ACTION_META.unchanged.chip}`}>{data.unchanged} ok</span>
          )}
          {data.errors.length > 0 && (
            <span className={`rounded-full px-2 py-0.5 ${ACTION_META.error.chip}`}>{data.errors.length} err</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function SyncLogRow({ log }: { log: GatewayDeviceSyncLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const when = new Date(log.created_at);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <motion.div className="mt-0.5 text-gray-400" animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRightIcon className="h-5 w-5" />
        </motion.div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <ClockIcon className="h-4 w-4 text-primary-500" />
              {when.toLocaleString()}
            </span>
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {log.sync_kind} · {log.source.replace(/_/g, ' ')}
            </span>
          </div>
          <SummaryChips summary={log.summary} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-gray-200 dark:border-gray-700"
          >
            <div className="px-4 py-3 bg-gray-50/80 dark:bg-gray-900/30">
              {log.entries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No per-device entries recorded.</p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {log.entries.map((entry, idx) => {
                    const meta = ACTION_META[entry.action];
                    const KindIcon = entry.device_kind === 'blulok' ? LockClosedIcon : ServerIcon;
                    return (
                      <li
                        key={`${entry.identifier}-${entry.action}-${idx}`}
                        className="flex items-start gap-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2.5"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <KindIcon className="h-4 w-4 text-gray-400" />
                            <span className="font-mono text-sm text-gray-900 dark:text-white truncate">
                              {entry.identifier}
                            </span>
                            {entry.label && entry.label !== entry.identifier && (
                              <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{entry.label}</span>
                            )}
                            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${meta.chip}`}>
                              {meta.label}
                            </span>
                            </div>
                          {entry.reason && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{entry.reason}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface GatewayDeviceSyncHistoryProps {
  gatewayId: string;
}

export function GatewayDeviceSyncHistory({ gatewayId }: GatewayDeviceSyncHistoryProps) {
  const [logs, setLogs] = useState<GatewayDeviceSyncLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!gatewayId) return;
      try {
        if (opts?.background) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const res = await apiService.getGatewayDeviceSyncLogs(gatewayId, { limit: 25, offset: 0 });
        setLogs(res.logs ?? []);
        setTotal(res.total ?? 0);
      } catch (err) {
        console.error('Failed to load gateway device sync logs', err);
        setError('Could not load device inventory sync history.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gatewayId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-primary-500" />
            Device inventory sync history
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Each time the gateway pushes inventory, the cloud records adds, removals, unchanged devices, and manual
            devices that were skipped because an admin added them by hand.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ background: true })}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <ArrowPathIcon className="h-6 w-6 animate-spin mr-2" />
          Loading sync history…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
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
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Showing {logs.length} of {total} sync{total === 1 ? '' : 's'}
          </p>
          <div className="space-y-3">
            {logs.map((log) => (
              <SyncLogRow key={log.id} log={log} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
