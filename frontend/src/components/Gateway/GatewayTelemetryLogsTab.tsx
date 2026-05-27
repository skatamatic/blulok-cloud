import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChevronRightIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  FunnelIcon,
  PlusIcon,
  ServerIcon,
  SignalIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { AnimatePresence, motion } from 'framer-motion';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { GatewayTelemetryLogRecord } from '@/types/gateway.types';
import {
  applyClientSideTelemetryFilters,
  buildTelemetryLogQueryParams,
  isEmptyFilterState,
  logMatchesFilters,
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
  payloadFilters: [],
};

function TelemetryLogRow({ log }: { log: GatewayTelemetryLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const when = new Date(log.logged_at);
  const preview =
    typeof log.payload?.message === 'string'
      ? log.payload.message
      : log.payload?.header
        ? `Header ${String(log.payload.header)}`
        : payloadStrPreview(log.payload);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden transition-shadow hover:shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 px-4 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
      >
        <motion.div className="mt-0.5 text-gray-400" animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRightIcon className="h-5 w-5" />
        </motion.div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <ClockIcon className="h-4 w-4 text-primary-500" />
              {when.toLocaleString()}
            </span>
            {log.payload?.header != null && (
              <span className="text-xs font-mono rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-gray-700 dark:text-gray-300">
                hdr {String(log.payload.header)}
              </span>
            )}
            <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {log.source.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate font-mono">{preview}</p>
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
            <pre className="px-4 py-3 text-xs font-mono text-gray-800 dark:text-gray-200 bg-gray-50/80 dark:bg-gray-900/30 overflow-x-auto max-h-96">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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
  }, [gatewayId, queryParams.from, queryParams.to, queryParams.search, queryParams.payload_path, queryParams.payload_value, queryParams.payload_op]);

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
    setAppliedFilters({
      from: draftFilters.from,
      to: draftFilters.to,
      search: draftFilters.search.trim(),
      payloadFilters: [...draftFilters.payloadFilters],
    });
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

  const filtersDirty =
    draftFilters.from !== appliedFilters.from ||
    draftFilters.to !== appliedFilters.to ||
    draftFilters.search.trim() !== (appliedFilters.search ?? '') ||
    JSON.stringify(draftFilters.payloadFilters) !== JSON.stringify(appliedFilters.payloadFilters);

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <label className="block text-xs text-gray-500 dark:text-gray-400 md:col-span-2">
            Search payload
            <input
              type="search"
              value={draftFilters.search ?? ''}
              onChange={(e) => setDraftFilters((p) => ({ ...p, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
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
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 transition-colors"
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
        <>
          <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            Showing {displayedLogs.length} matching
            {hasClientSideOnlyFilters ? ` (${logs.length} loaded)` : ` of ${serverTotal}`} log line
            {displayedLogs.length === 1 ? '' : 's'} (newest first)
            {logs.length >= TELEMETRY_LOGS_UI_MAX_ROWS && ' · display capped at 1,000 rows'}
          </p>
          <ul className="space-y-3">
            {displayedLogs.map((log) => (
              <li key={log.id}>
                <TelemetryLogRow log={log} />
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchLogs()}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
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
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default GatewayTelemetryLogsTab;
