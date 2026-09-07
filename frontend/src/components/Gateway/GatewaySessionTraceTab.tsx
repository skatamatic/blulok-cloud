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
import { UnitFilter } from '@/components/Common/UnitFilter';
import { UserFilter } from '@/components/Common/UserFilter';
import { AppliedFilterBar, type AppliedFilter } from '@/components/Common/AppliedFilterBar';
import { normalizeDeviceStatusWsPayload } from '@/utils/deviceStatusWs.utils';
import {
  buildAccessSessionTraceDump,
  eventMatchesClientFilters,
  lookupUsersToFilterUsers,
  traceRowMatchesUser,
} from '@/utils/access-session-trace-dump.utils';
import {
  EMPTY_TRACE_TIME_FILTER,
  eventMatchesTraceTimeFilter,
  formatTraceTimeFilterChip,
  instantMatchesTraceTimeFilter,
  rawEventMatchesTraceTimeFilter,
  sessionMatchesTraceTimeFilter,
} from '@/utils/access-session-trace-time-filter.utils';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceFilterState,
  AccessSessionTraceLookupDevice,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';
import {
  PendingAttributionList,
  TraceFilterField,
  TraceStatusStrip,
  TraceWorkspace,
} from './GatewaySessionTracePanels';
import { TraceTimeRangeFilter } from './TraceTimeRangeFilter';
import {
  buildTraceEventLog,
  buildWovenTraceItems,
  countLiveDeviceOverlaps,
  eventsToNdjson,
  mergeTraceSessions,
  type TraceWorkspaceMode,
} from '@/utils/access-session-trace-view.utils';

const LIVE_EVENT_CAP = 200;
const EMPTY_FILTERS: AccessSessionTraceFilterState = {
  user_id: '',
  unit_id: '',
  ...EMPTY_TRACE_TIME_FILTER,
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
  const [unitLabel, setUnitLabel] = useState('');
  const [userLabel, setUserLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<TraceWorkspaceMode>('sessions');
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const query = useMemo(
    () => ({
      unit_id: filters.unit_id || undefined,
    }),
    [filters.unit_id],
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
        if (!eventMatchesClientFilters(event, { unit_id: filtersRef.current.unit_id, user_id: '' })) return;
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

  const lookups = snapshot?.lookups;
  const eventUsers = useMemo(() => {
    if (!filters.unit_id) return undefined;
    if (snapshot?.filters.unit_id !== filters.unit_id) return [];
    return lookupUsersToFilterUsers(snapshot.lookups.users);
  }, [filters.unit_id, snapshot]);

  const visibleLiveSessions = useMemo(
    () =>
      (snapshot?.live_sessions || []).filter(
        (row) => traceRowMatchesUser(row, filters.user_id) && sessionMatchesTraceTimeFilter(row, filters),
      ),
    [snapshot, filters],
  );
  const visibleRecentSessions = useMemo(
    () =>
      (snapshot?.recent_sessions || []).filter(
        (row) => traceRowMatchesUser(row, filters.user_id) && sessionMatchesTraceTimeFilter(row, filters),
      ),
    [snapshot, filters],
  );
  const visibleRawEvents = useMemo(
    () =>
      (snapshot?.raw_events || []).filter(
        (row) => traceRowMatchesUser(row, filters.user_id) && rawEventMatchesTraceTimeFilter(row, filters),
      ),
    [snapshot, filters],
  );
  const visiblePending = useMemo(
    () => (snapshot?.pending_attributions || []).filter((row) => traceRowMatchesUser(row, filters.user_id)),
    [snapshot, filters.user_id],
  );
  const visibleLiveEvents = useMemo(
    () =>
      liveEvents.filter(
        (event) => eventMatchesClientFilters(event, filters) && eventMatchesTraceTimeFilter(event, filters),
      ),
    [liveEvents, filters],
  );
  const visibleCorrelatorDecisions = useMemo(
    () =>
      (snapshot?.correlator_decisions || []).filter(
        (event) => eventMatchesClientFilters(event, filters) && eventMatchesTraceTimeFilter(event, filters),
      ),
    [snapshot, filters],
  );
  const sessionCards = useMemo(
    () => mergeTraceSessions(visibleLiveSessions, visibleRecentSessions),
    [visibleLiveSessions, visibleRecentSessions],
  );
  const wovenItems = useMemo(
    () =>
      buildWovenTraceItems({
        liveEvents: visibleLiveEvents,
        correlatorDecisions: visibleCorrelatorDecisions,
        rawEvents: visibleRawEvents,
        lockStates,
        capturedAt: snapshot?.captured_at || new Date().toISOString(),
        lookups,
      }).filter(
        (item) => item.kind !== 'lock_state' || instantMatchesTraceTimeFilter(item.at, filters),
      ),
    [visibleLiveEvents, visibleCorrelatorDecisions, visibleRawEvents, lockStates, snapshot, lookups, filters],
  );
  const eventNdjson = useMemo(() => {
    const events = buildTraceEventLog({
      liveEvents: visibleLiveEvents,
      correlatorDecisions: visibleCorrelatorDecisions,
      rawEvents: visibleRawEvents,
    });
    return eventsToNdjson(events);
  }, [visibleLiveEvents, visibleCorrelatorDecisions, visibleRawEvents]);
  const liveOverlaps = useMemo(() => countLiveDeviceOverlaps(visibleLiveSessions), [visibleLiveSessions]);
  const historySessionCount = sessionCards.filter((row) => !row.isLive).length;

  const clearAllFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setUnitLabel('');
    setUserLabel('');
  }, []);

  const appliedFilters = useMemo(() => {
    const items: AppliedFilter[] = [];
    if (filters.unit_id) {
      const unitNumber = lookups?.units[filters.unit_id]?.unit_number;
      items.push({
        id: 'unit',
        label: `Unit: ${unitLabel || unitNumber || filters.unit_id}`,
        onRemove: () => {
          setFilters((prev) => ({ ...prev, unit_id: '', user_id: '' }));
          setUnitLabel('');
          setUserLabel('');
        },
      });
    }
    if (filters.user_id) {
      const lookupUser = lookups?.users[filters.user_id];
      items.push({
        id: 'user',
        label: `User: ${userLabel || lookupUser?.name || lookupUser?.email || filters.user_id}`,
        onRemove: () => {
          setFilters((prev) => ({ ...prev, user_id: '' }));
          setUserLabel('');
        },
      });
    }
    const timeLabel = formatTraceTimeFilterChip(filters);
    if (timeLabel) {
      items.push({
        id: 'time',
        label: timeLabel,
        onRemove: () => setFilters((prev) => ({ ...prev, ...EMPTY_TRACE_TIME_FILTER })),
      });
    }
    return items;
  }, [filters, lookups, unitLabel, userLabel]);

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
              Live and historical sessions, correlator events, and lock state — copy a dump to debug duplicate history rows.
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

      <div className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <TraceTimeRangeFilter
          after={filters.time_after}
          before={filters.time_before}
          onAfterChange={(time_after) => setFilters((prev) => ({ ...prev, time_after }))}
          onBeforeChange={(time_before) => setFilters((prev) => ({ ...prev, time_before }))}
        >
          <TraceFilterField label="Unit">
            <UnitFilter
              value={filters.unit_id}
              onChange={(unit_id) => {
                setFilters((prev) => ({ ...prev, unit_id, user_id: '' }));
                setUserLabel('');
              }}
              onDisplayLabelChange={setUnitLabel}
              facilityId={facilityId}
              placeholder="Search units..."
              allowEmpty
              emptyLabel="All units"
              className="w-full min-w-0"
            />
          </TraceFilterField>
          <TraceFilterField label="User">
            <UserFilter
              value={filters.user_id}
              onChange={(user_id) => setFilters((f) => ({ ...f, user_id }))}
              onDisplayLabelChange={setUserLabel}
              facilityId={facilityId}
              allowedUsers={eventUsers}
              placeholder={
                filters.unit_id ? 'Users with events on this unit...' : 'Search users...'
              }
              allowEmpty
              emptyLabel="All users"
              emptyMessage="No users with events for this unit"
              className="w-full min-w-0"
            />
          </TraceFilterField>
        </TraceTimeRangeFilter>
        <AppliedFilterBar filters={appliedFilters} onClearAll={clearAllFilters} />
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
          <TraceStatusStrip
            lockStates={lockStates}
            pendingCount={visiblePending.length}
            liveSessionCount={visibleLiveSessions.length}
            historySessionCount={historySessionCount}
            liveOverlaps={liveOverlaps}
          />
          <PendingAttributionList rows={visiblePending} lookups={lookups} />
          <TraceWorkspace
            mode={workspaceMode}
            onModeChange={setWorkspaceMode}
            sessionCount={sessionCards.length}
            eventCount={wovenItems.length}
            sessions={sessionCards}
            events={wovenItems}
            ndjson={eventNdjson}
            lookups={lookups}
          />
        </>
      )}
    </div>
  );
}
