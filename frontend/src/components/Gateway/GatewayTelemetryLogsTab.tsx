import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  PlusIcon,
  ServerIcon,
  SignalIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';
import {
  applyClientSideTelemetryFilters,
  buildTelemetryLogQueryParams,
  isEmptyFilterState,
  isTelemetryFilterDraftDirty,
  logMatchesFilters,
  mergePendingPayloadFilter,
  payloadStrPreview,
  TELEMETRY_LOGS_PAGE_SIZE,
  TELEMETRY_LOGS_UI_MAX_ROWS,
  walkPayloadKeys,
  type PayloadFilterChip,
  type TelemetryLogFilterState,
} from '@/utils/gateway-telemetry-log-filters.utils';

const EMPTY_FILTERS: TelemetryLogFilterState = {
  from: '',
  to: '',
  search: '',
  source: '',
  payloadFilters: [],
};

const SYSTEM_HEADER_LABELS: Record<string, string> = {
  CLD01: 'Connected',
  CLD02: 'Disconnected',
  CLD03: 'Status',
  CLD04: 'Inventory',
};

function formatLogTimestamp(when: Date): { date: string; time: string } {
  return {
    date: when.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: 'numeric' }),
    time: when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
  };
}

function TelemetryLogRow({ log }: { log: GatewayTelemetryLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const when = new Date(log.logged_at);
  const { date, time } = formatLogTimestamp(when);
  const preview =
    typeof log.payload?.message === 'string'
      ? log.payload.message
      : log.payload?.header
        ? `Header ${String(log.payload.header)}`
        : payloadStrPreview(log.payload);
  const isCloud = log.source === 'cloud_system' || log.payload?.cloud_system === true;
  const headerCode = log.payload?.header != null ? String(log.payload.header) : null;
  const headerHint = headerCode ? SYSTEM_HEADER_LABELS[headerCode] : undefined;

  return (
    <>
      <tr
        className="group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
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
        <td className="w-[4.25rem] whitespace-nowrap px-2 py-2 align-top">
          {headerCode ? (
            <span
              className="inline-block font-mono text-[11px] font-medium text-gray-700 dark:text-gray-300"
              title={headerHint}
            >
              {headerCode}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </td>
        <td className="w-[4.75rem] whitespace-nowrap px-2 py-2 align-top">
          <span
            className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              isCloud
                ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {isCloud ? 'Cloud' : 'Gateway'}
          </span>
        </td>
        <td className="px-3 py-2 align-top min-w-0">
          <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 leading-snug" title={preview}>
            {preview}
          </p>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td
            colSpan={5}
            className="border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30 p-0"
          >
            <pre className="max-h-64 overflow-auto px-4 py-3 text-xs font-mono text-gray-800 dark:text-gray-200">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

interface GatewayTelemetryLogsTabProps {
  gatewayId: string;
  facilityId: string;
  liveEnabled?: boolean;
}

export function GatewayTelemetryLogsTab({ gatewayId, facilityId, liveEnabled = true }: GatewayTelemetryLogsTabProps) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const [logs, setLogs] = useState<GatewayTelemetryLogRecord[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftFilters, setDraftFilters] = useState<TelemetryLogFilterState>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<TelemetryLogFilterState>(EMPTY_FILTERS);
  const [draftPath, setDraftPath] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftOp, setDraftOp] = useState<'eq' | 'contains'>('eq');

  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;

  const queryParams = useMemo(() => buildTelemetryLogQueryParams(appliedFilters), [appliedFilters]);

  const displayedLogs = useMemo(
    () => applyClientSideTelemetryFilters(logs, appliedFilters),
    [logs, appliedFilters],
  );

  const suggestedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const log of logs.slice(0, 50)) {
      walkPayloadKeys(log.payload, '', keys);
    }
    return Array.from(keys).sort().slice(0, 40);
  }, [logs]);

  const hasClientSideOnlyFilters = appliedFilters.payloadFilters.length > 1;

  const fetchLogs = useCallback(
    async (opts: { reset?: boolean; background?: boolean } = {}) => {
      if (!gatewayId) return;
      const nextOffset = opts.reset ? 0 : offset;
      try {
        if (opts.background) setRefreshing(true);
        else if (opts.reset) setLoading(true);
        else setLoadingMore(true);
        setError(null);

        const res = await apiService.getGatewayTelemetryLogs(gatewayId, {
          ...queryParams,
          limit: TELEMETRY_LOGS_PAGE_SIZE,
          offset: nextOffset,
        });

        const incoming = res.logs ?? [];
        setLogs((prev) => (opts.reset ? incoming : [...prev, ...incoming]));
        setServerTotal(res.total ?? 0);
        setHasMore(Boolean(res.hasMore));
        setOffset(opts.reset ? incoming.length : nextOffset + incoming.length);
      } catch (err) {
        console.error('Failed to load gateway telemetry logs', err);
        setError('Could not load gateway telemetry logs.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [gatewayId, offset, queryParams],
  );

  useEffect(() => {
    void fetchLogs({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayId, queryParams.from, queryParams.to, queryParams.search, queryParams.source, queryParams.payload_path, queryParams.payload_value, queryParams.payload_op]);

  useEffect(() => {
    if (!liveEnabled || !gatewayId) return;

    const subscriptionId = subscribe(
      'gateway_telemetry_logs',
      (data: { logs?: GatewayTelemetryLogRecord[]; status?: string }) => {
        const incoming = data?.logs ?? [];
        if (incoming.length === 0) return;

        const filters = appliedFiltersRef.current;
        setLogs((prev) => {
          const existing = new Set(prev.map((l) => l.id));
          const fresh = incoming.filter(
            (log) => !existing.has(log.id) && logMatchesFilters(log, filters),
          );
          if (fresh.length === 0) return prev;
          setServerTotal((t) => t + fresh.length);
          return [...fresh, ...prev].slice(0, TELEMETRY_LOGS_UI_MAX_ROWS);
        });
      },
      undefined,
      { filters: { facility_id: facilityId, gateway_id: gatewayId } },
    );

    return () => {
      if (subscriptionId) unsubscribe(subscriptionId);
    };
  }, [subscribe, unsubscribe, liveEnabled, gatewayId, facilityId]);

  const applyFilters = () => {
    const { filters: mergedDraft, clearedPending } = mergePendingPayloadFilter(
      draftFilters,
      draftPath,
      draftValue,
      draftOp,
    );
    if (clearedPending) {
      setDraftPath('');
      setDraftValue('');
    }
    const nextApplied: TelemetryLogFilterState = {
      from: mergedDraft.from,
      to: mergedDraft.to,
      search: mergedDraft.search.trim(),
      source: mergedDraft.source ?? '',
      payloadFilters: [...mergedDraft.payloadFilters],
    };
    setDraftFilters(nextApplied);
    setAppliedFilters(nextApplied);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setDraftPath('');
    setDraftValue('');
    setDraftOp('eq');
  };

  const addPayloadFilter = () => {
    const path = draftPath.trim();
    const value = draftValue.trim();
    if (!path || !value) return;
    setDraftFilters((prev) => ({
      ...prev,
      payloadFilters: [
        ...prev.payloadFilters,
        { id: `${path}-${Date.now()}`, path, value, op: draftOp },
      ],
    }));
    setDraftPath('');
    setDraftValue('');
  };

  const removePayloadFilter = (id: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      payloadFilters: prev.payloadFilters.filter((f) => f.id !== id),
    }));
  };

  const filtersDirty = isTelemetryFilterDraftDirty(
    draftFilters,
    appliedFilters,
    draftPath,
    draftValue,
  );

  const canAddPayloadFilter = Boolean(draftPath.trim() && draftValue.trim());

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <DocumentTextIcon className="h-5 w-5 text-primary-500" />
              Gateway Logs
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
                {isConnected ? 'Live' : 'Offline'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Operational telemetry streamed from the gateway. Up to 10,000 recent lines are retained per gateway.
            Live updates appear while this tab is open.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchLogs({ reset: true, background: true })}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
            <FunnelIcon className="h-4 w-4 text-primary-500" />
            Filters
          </div>
          {!isEmptyFilterState(appliedFilters) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            From
            <input
              type="datetime-local"
              value={draftFilters.from ?? ''}
              onChange={(e) => setDraftFilters((p) => ({ ...p, from: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            To
            <input
              type="datetime-local"
              value={draftFilters.to ?? ''}
              onChange={(e) => setDraftFilters((p) => ({ ...p, to: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400">
            Source
            <select
              value={draftFilters.source ?? ''}
              onChange={(e) =>
                setDraftFilters((p) => ({
                  ...p,
                  source: e.target.value as TelemetryLogFilterState['source'],
                }))
              }
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All sources</option>
              <option value="gateway_ws">Gateway</option>
              <option value="cloud_system">Cloud</option>
            </select>
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400 lg:col-span-2">
            Search payload
            <input
              type="search"
              value={draftFilters.search ?? ''}
              onChange={(e) => setDraftFilters((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && filtersDirty && applyFilters()}
              placeholder="Free-text search across JSON payload"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {draftFilters.payloadFilters.map((chip: PayloadFilterChip) => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300 px-3 py-1 text-xs font-medium"
            >
              {chip.path} {chip.op === 'contains' ? '~' : '='} {chip.value}
              <button type="button" onClick={() => removePayloadFilter(chip.id)} aria-label={`Remove filter ${chip.path}`}>
                <XMarkIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="block text-xs text-gray-500 dark:text-gray-400 md:col-span-1">
            JSON path
            <input
              list="telemetry-payload-paths"
              value={draftPath}
              onChange={(e) => setDraftPath(e.target.value)}
              placeholder="e.g. data.lock_id"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <datalist id="telemetry-payload-paths">
              {suggestedKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400 md:col-span-1">
            Value
            <input
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (canAddPayloadFilter) addPayloadFilter();
                  else if (filtersDirty) applyFilters();
                }
              }}
              placeholder="Filter value"
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </label>
          <label className="block text-xs text-gray-500 dark:text-gray-400 md:col-span-1">
            Match
            <select
              value={draftOp}
              onChange={(e) => setDraftOp(e.target.value as 'eq' | 'contains')}
              className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="eq">Equals</option>
              <option value="contains">Contains</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addPayloadFilter}
              disabled={!canAddPayloadFilter}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusIcon className="h-4 w-4" />
              Add filter
            </button>
            <button
              type="button"
              onClick={applyFilters}
              disabled={!filtersDirty}
              className="inline-flex items-center px-3 py-2 text-sm rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>
        {hasClientSideOnlyFilters && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Multiple JSON path filters: the first is applied on the server; additional filters refine results in the browser.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <ArrowPathIcon className="h-6 w-6 animate-spin mr-2" />
          Loading gateway logs…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 flex items-start gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      ) : displayedLogs.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <ServerIcon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {logs.length > 0 ? 'No logs match the current filters' : 'No telemetry logs yet'}
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {logs.length > 0
              ? 'Try adjusting or clearing filters.'
              : 'Logs appear when the gateway sends lines via POST internal/gateway/add_log.'}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            Showing {displayedLogs.length} matching
            {hasClientSideOnlyFilters ? ` (${logs.length} loaded)` : ` of ${serverTotal}`} log line
            {displayedLogs.length === 1 ? '' : 's'} (newest first)
            {logs.length >= TELEMETRY_LOGS_UI_MAX_ROWS && ' · display capped at 1,000 rows'}
          </p>
          <div className="status-area-scrollbar max-h-[min(32rem,calc(100vh-18rem))] overflow-y-auto overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 isolate">
            <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700 text-left border-collapse">
              <colgroup>
                <col className="w-8" />
                <col className="w-[7.5rem]" />
                <col className="w-[4.25rem]" />
                <col className="w-[4.75rem]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th
                    scope="col"
                    className="sticky top-0 z-20 bg-gray-50 px-2 py-2 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
                    aria-hidden
                  />
                  <th
                    scope="col"
                    className="sticky top-0 z-20 bg-gray-50 px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Time
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 bg-gray-50 px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Code
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 bg-gray-50 px-2 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Source
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700"
                  >
                    Message
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white dark:divide-gray-700/80 dark:bg-gray-800">
                {displayedLogs.map((log) => (
                  <TelemetryLogRow key={log.id} log={log} />
                ))}
                {hasMore && (
                  <tr className="bg-gray-50/80 dark:bg-gray-900/40">
                    <td colSpan={5} className="px-4 py-4 text-center border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => void fetchLogs()}
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

export default GatewayTelemetryLogsTab;
