import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ClipboardDocumentIcon,
  SignalIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/Common/Button';
import { normalizeDeviceStatusWsPayload } from '@/utils/deviceStatusWs.utils';
import {
  buildAccessSessionTraceDump,
  eventMatchesClientFilters,
} from '@/utils/access-session-trace-dump.utils';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceFilterState,
  AccessSessionTraceLookupDevice,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';
import {
  ClusterBanner,
  LockStateTable,
  PendingAttributionTable,
  SessionMiniTable,
  TraceEventStream,
  TraceSelect,
} from './GatewaySessionTracePanels';

const LIVE_EVENT_CAP = 200;
const EMPTY_FILTERS: AccessSessionTraceFilterState = {
  user_id: '',
  device_id: '',
  unit_id: '',
};

interface GatewaySessionTraceTabProps {
  gatewayId: string;
  facilityId: string;
  liveEnabled?: boolean;
}

export function GatewaySessionTraceTab({
  gatewayId,
  facilityId,
  liveEnabled = true,
}: GatewaySessionTraceTabProps) {
  const { subscribe, unsubscribe, isConnected } = useWebSocket();
  const { addToast } = useToast();
  const [snapshot, setSnapshot] = useState<AccessSessionTraceSnapshot | null>(null);
  const [lockStates, setLockStates] = useState<AccessSessionTraceLookupDevice[]>([]);
  const [liveEvents, setLiveEvents] = useState<AccessSessionTraceEvent[]>([]);
  const [filters, setFilters] = useState<AccessSessionTraceFilterState>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const query = useMemo(
    () => ({
      user_id: filters.user_id || undefined,
      device_id: filters.device_id || undefined,
      unit_id: filters.unit_id || undefined,
    }),
    [filters],
  );

  const fetchSnapshot = useCallback(
    async (background = false) => {
      if (!gatewayId) return;
      try {
        if (background) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const res = await apiService.getGatewaySessionTrace(gatewayId, query);
        const next = res.snapshot;
        setSnapshot(next);
        setLockStates(next.lock_states || []);
        setLiveEvents(next.correlator_decisions?.slice().reverse() || []);
      } catch (err) {
        console.error('Failed to load session trace', err);
        setError('Could not load session trace.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gatewayId, query],
  );

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  useEffect(() => {
    if (!liveEnabled || !gatewayId) return;

    const traceSub = subscribe(
      'access_session_trace',
      (data: { event?: AccessSessionTraceEvent; status?: string }) => {
        const event = data?.event;
        if (!event) return;
        if (!eventMatchesClientFilters(event, filtersRef.current)) return;
        setLiveEvents((prev) => [event, ...prev.filter((row) => row.id !== event.id)].slice(0, LIVE_EVENT_CAP));
      },
      undefined,
      {
        filters: {
          facility_id: facilityId,
          gateway_id: gatewayId,
          ...query,
        },
      },
    );

    const statusSub = subscribe(
      'device_status',
      (payload: unknown) => {
        const rows = normalizeDeviceStatusWsPayload(payload);
        if (rows.length === 0) return;
        setLockStates((prev) => {
          const byId = new Map(prev.map((d) => [d.id, d]));
          for (const row of rows) {
            const id = row.device_id;
            if (!id) continue;
            const existing = byId.get(id);
            if (!existing) continue;
            byId.set(id, {
              ...existing,
              lock_status: row.lock_status ?? existing.lock_status,
              device_status: row.device_status ?? existing.device_status,
            });
          }
          return Array.from(byId.values());
        });
      },
      undefined,
      { facility_id: facilityId },
    );

    return () => {
      if (traceSub) unsubscribe(traceSub);
      if (statusSub) unsubscribe(statusSub);
    };
  }, [subscribe, unsubscribe, liveEnabled, gatewayId, facilityId, query]);

  const copyDump = async () => {
    const text = buildAccessSessionTraceDump({ snapshot, liveEvents, lockStates });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast({ type: 'success', title: 'Copied', message: 'Session trace dump copied' });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      addToast({ type: 'error', title: 'Copy failed', message: 'Could not copy dump' });
    }
  };

  const lookups = snapshot?.lookups;
  const deviceOptions = Object.values(lookups?.devices || {});
  const unitOptions = Object.values(lookups?.units || {});
  const userOptions = Object.values(lookups?.users || {});

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-[#147FD4]/10 p-2 text-[#147FD4]">
            <ViewfinderCircleIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Session trace</h3>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
              Live correlator decisions, raw access events, pending attributions, and lock state — copy a dump to debug duplicate history rows.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              liveEnabled && isConnected
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            <SignalIcon className="h-3.5 w-3.5" />
            {liveEnabled && isConnected ? 'Live' : 'Paused'}
          </span>
          <Button variant="secondary" size="sm" onClick={() => void fetchSnapshot(true)} disabled={refreshing}>
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={() => void copyDump()}>
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy dump'}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:flex-row">
        <TraceSelect label="Unit" value={filters.unit_id} onChange={(unit_id) => setFilters((f) => ({ ...f, unit_id }))}>
          <option value="">All units</option>
          {unitOptions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.unit_number ? `Unit ${unit.unit_number}` : unit.id}
            </option>
          ))}
        </TraceSelect>
        <TraceSelect
          label="Device"
          value={filters.device_id}
          onChange={(device_id) => setFilters((f) => ({ ...f, device_id }))}
        >
          <option value="">All devices</option>
          {deviceOptions.map((device) => (
            <option key={device.id} value={device.id}>
              {device.unit_number
                ? `Unit ${device.unit_number}`
                : device.name || device.serial || device.id.slice(0, 8)}
            </option>
          ))}
        </TraceSelect>
        <TraceSelect label="User" value={filters.user_id} onChange={(user_id) => setFilters((f) => ({ ...f, user_id }))}>
          <option value="">All users</option>
          {userOptions.map((user) => (
            <option key={user.id} value={user.id}>
              {user.email || user.name || user.id.slice(0, 8)}
            </option>
          ))}
        </TraceSelect>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-200">
          {error}
        </div>
      )}

      {loading && !snapshot ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#147FD4]" />
          <span className="ml-3 text-sm text-gray-600 dark:text-gray-400">Loading session trace…</span>
        </div>
      ) : (
        <>
          {snapshot && <ClusterBanner clusters={snapshot.debug?.sessions_sharing_device} />}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Live lock state</h4>
              <p className="mt-0.5 mb-3 text-[11px] text-gray-500">devices/state as currently stored, updated live.</p>
              <LockStateTable devices={lockStates} lookups={lookups} />
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Pending attributions</h4>
              <p className="mt-0.5 mb-3 text-[11px] text-gray-500">
                In-memory lock commands on this instance + durable cloud_remote pending sessions.
              </p>
              <PendingAttributionTable rows={snapshot?.pending_attributions || []} lookups={lookups} />
            </section>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Live sessions</h4>
              <p className="mt-0.5 mb-3 text-[11px] text-gray-500">pending + open right now.</p>
              <SessionMiniTable rows={snapshot?.live_sessions || []} lookups={lookups} />
            </section>

            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 max-h-[36rem] overflow-y-auto">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Live event stream</h4>
              <p className="mt-0.5 mb-3 text-[11px] text-gray-500">
                Correlator decisions and raw access/lock/unlock rows. Expand JSON for the full payload.
              </p>
              <TraceEventStream events={liveEvents} lookups={lookups} />
            </section>
          </div>

          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Recent sessions</h4>
            <p className="mt-0.5 mb-3 text-[11px] text-gray-500">Newest first, including closed / timed out / denied.</p>
            <SessionMiniTable rows={snapshot?.recent_sessions || []} lookups={lookups} />
          </section>

          <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Raw activity_logs</h4>
            <p className="mt-0.5 mb-3 text-[11px] text-gray-500">
              access_attempt / lock / unlock with enrichment. Expand JSON for metadata.
            </p>
            <SessionMiniTable rows={snapshot?.raw_events || []} lookups={lookups} />
          </section>
        </>
      )}
    </div>
  );
}
