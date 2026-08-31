import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AccessSessionTraceLookupDevice,
  AccessSessionTracePendingAttribution,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';
import { formatTraceLookup } from '@/utils/access-session-trace-dump.utils';
import { formatDateTime } from '@/utils/datetime.utils';
import { SegmentedTabs } from '@/components/Common/SegmentedTabs';
import type {
  TraceSessionCardRow,
  TraceWovenItem,
  TraceWovenKind,
  TraceWorkspaceMode,
} from '@/utils/access-session-trace-view.utils';
import { lockStatusStrip } from '@/utils/access-session-trace-view.utils';

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: 'blue' | 'green' | 'amber' | 'rose' | 'gray';
}) {
  const tones = {
    blue: 'bg-[#147FD4]/10 text-[#147FD4] dark:bg-[#147FD4]/20',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {label}
    </span>
  );
}

function stateTone(state?: string): 'blue' | 'green' | 'amber' | 'rose' | 'gray' {
  if (state === 'open' || state === 'closed') return 'green';
  if (state === 'pending') return 'blue';
  if (state === 'timed_out') return 'amber';
  if (state === 'denied' || state === 'failed') return 'rose';
  return 'gray';
}

function wovenTone(kind: TraceWovenKind): 'blue' | 'green' | 'amber' | 'rose' | 'gray' {
  if (kind === 'lock_unlock_event') return 'green';
  if (kind === 'correlator_decision') return 'blue';
  if (kind === 'lock_state') return 'amber';
  return 'gray';
}

export function TraceFilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export function TraceStatusStrip({
  lockStates,
  pendingCount,
  liveSessionCount,
  historySessionCount,
  liveOverlaps,
}: {
  lockStates: AccessSessionTraceLookupDevice[];
  pendingCount: number;
  liveSessionCount: number;
  historySessionCount: number;
  liveOverlaps: number;
}) {
  const lockStrip = lockStatusStrip(lockStates);
  const stats = [
    { label: lockStrip.label, value: lockStrip.value },
    { label: 'Pending', value: String(pendingCount) },
    { label: 'Live sessions', value: String(liveSessionCount) },
    { label: 'History', value: String(historySessionCount) },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {stat.label}
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-white">{stat.value}</div>
          </div>
        ))}
      </div>
      {liveOverlaps > 0 && (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {liveOverlaps} device{liveOverlaps === 1 ? '' : 's'} currently have more than one live session.
        </p>
      )}
    </div>
  );
}

export function PendingAttributionList({
  rows,
  lookups,
}: {
  rows: AccessSessionTracePendingAttribution[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <div
          key={`${row.source}-${row.device_id}-${row.command_id}`}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700"
        >
          <Pill label={row.source} tone={row.source === 'memory' ? 'amber' : 'blue'} />
          <Pill label={row.requested_status} tone="gray" />
          <span className="text-gray-800 dark:text-gray-200">
            {formatTraceLookup(lookups, 'device', row.device_id)}
          </span>
          <span className="text-[11px] text-gray-500">
            {row.initiator ? row.initiator.userName : 'No initiator'}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SessionMiniTable({
  rows,
  lookups,
}: {
  rows: TraceSessionCardRow[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No sessions match the current filters.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60"
        >
          <div className="flex flex-wrap items-center gap-2">
            {row.isLive && <Pill label="live" tone="blue" />}
            <Pill label={String(row.state || 'unknown')} tone={stateTone(String(row.state))} />
            <span className="text-xs font-medium text-gray-900 dark:text-white">
              {row.unit_number ? `Unit ${row.unit_number}` : formatTraceLookup(lookups, 'device', row.device_id)}
            </span>
            <span className="text-xs text-gray-500">{String(row.method || '')}</span>
            <span className="text-xs text-gray-500">{String(row.origin || '')}</span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {row.actor_name || formatTraceLookup(lookups, 'user', row.actor_id)}
            {row.actor_user_email ? ` · ${row.actor_user_email}` : ''}
            {row.started_at ? ` · ${formatDateTime(row.started_at) || row.started_at}` : ''}
            {typeof row.attempt_count === 'number' ? ` · attempts ${row.attempt_count}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WovenEventCards({
  items,
}: {
  items: TraceWovenItem[];
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No events or lock state for these filters.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800/60"
        >
          <div className="flex flex-wrap items-center gap-2">
            {item.source === 'live' && <Pill label="live" tone="blue" />}
            <Pill label={item.kind.replace(/_/g, ' ')} tone={wovenTone(item.kind)} />
            <span className="text-xs font-medium text-gray-900 dark:text-white">{item.title}</span>
            <span className="ml-auto text-[11px] tabular-nums text-gray-500">
              {formatDateTime(item.at) || item.at || '—'}
            </span>
          </div>
          {item.detail && (
            <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">{item.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}

const NDJSON_NEAR_BOTTOM_PX = 32;

export function EventNdjsonPane({ ndjson }: { ndjson: string }) {
  const scrollerRef = useRef<HTMLPreElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [ndjson, autoScroll]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Pretty-printed · oldest first</p>
        <button
          type="button"
          aria-pressed={autoScroll}
          onClick={() => setAutoScroll((on) => !on)}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150 ${
            autoScroll
              ? 'bg-[#147FD4]/10 text-[#147FD4] ring-1 ring-[#147FD4]/30'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          Autoscroll
        </button>
      </div>
      <pre
        ref={scrollerRef}
        onScroll={() => {
          const node = scrollerRef.current;
          if (!node || !autoScroll) return;
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
          if (distanceFromBottom > NDJSON_NEAR_BOTTOM_PX) setAutoScroll(false);
        }}
        className="max-h-[36rem] overflow-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-mono leading-relaxed text-gray-800 dark:border-gray-700 dark:bg-gray-900/70 dark:text-gray-200"
      >
        {ndjson || 'No events match the current filters.'}
      </pre>
    </div>
  );
}

export function TraceWorkspace({
  mode,
  onModeChange,
  sessionCount,
  eventCount,
  sessions,
  events,
  ndjson,
  lookups,
}: {
  mode: TraceWorkspaceMode;
  onModeChange: (mode: TraceWorkspaceMode) => void;
  sessionCount: number;
  eventCount: number;
  sessions: TraceSessionCardRow[];
  events: TraceWovenItem[];
  ndjson: string;
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Workspace</h4>
          <p className="mt-0.5 text-[11px] text-gray-500">
            Live and historical. Session cards, event/state cards, or a pretty-printed event log that appends live.
          </p>
        </div>
        <SegmentedTabs
          size="sm"
          ariaLabel="Session trace workspace"
          activeTab={mode}
          onChange={(key) => onModeChange(key as TraceWorkspaceMode)}
          tabs={[
            { key: 'sessions', label: 'Sessions', count: sessionCount },
            { key: 'events', label: 'Events', count: eventCount },
            { key: 'json', label: 'NDJSON' },
          ]}
        />
      </div>
      {mode === 'sessions' && (
        <div className="max-h-[36rem] overflow-y-auto">
          <SessionMiniTable rows={sessions} lookups={lookups} />
        </div>
      )}
      {mode === 'events' && (
        <div className="max-h-[36rem] overflow-y-auto">
          <WovenEventCards items={events} />
        </div>
      )}
      {mode === 'json' && <EventNdjsonPane ndjson={ndjson} />}
    </section>
  );
}
