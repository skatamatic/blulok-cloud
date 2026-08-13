import { useState, type ReactNode } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import type {
  AccessSessionTraceEvent,
  AccessSessionTraceLookupDevice,
  AccessSessionTracePendingAttribution,
  AccessSessionTraceRow,
  AccessSessionTraceSnapshot,
} from '@/types/access-session-trace.types';
import { formatTraceLookup } from '@/utils/access-session-trace-dump.utils';
import { formatDateTime } from '@/utils/datetime.utils';

function JsonBlock({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#147FD4] hover:underline"
      >
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </motion.span>
        {expanded ? 'Hide JSON' : 'JSON'}
      </button>
      {expanded && (
        <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-900/70 border border-gray-200 dark:border-gray-700 px-3 py-2 text-[11px] font-mono text-gray-800 dark:text-gray-200">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

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

function lockTone(status?: string | null): 'green' | 'amber' | 'rose' | 'gray' {
  if (status === 'locked') return 'green';
  if (status === 'unlocked' || status === 'unlocking' || status === 'locking') return 'amber';
  if (status === 'error') return 'rose';
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

export function LockStateTable({
  devices,
  lookups,
}: {
  devices: AccessSessionTraceLookupDevice[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (devices.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No devices on this gateway.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Device / unit</th>
            <th className="py-1.5 pr-3 font-medium">Lock</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 font-medium">IDs</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device) => (
            <tr key={device.id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="py-1.5 pr-3">
                <div className="font-medium text-gray-900 dark:text-white">
                  {device.unit_number
                    ? `Unit ${device.unit_number}`
                    : device.name || device.serial || formatTraceLookup(lookups, 'device', device.id)}
                </div>
                <div className="text-[11px] text-gray-500">{device.device_type}</div>
              </td>
              <td className="py-1.5 pr-3">
                <Pill label={device.lock_status || 'unknown'} tone={lockTone(device.lock_status)} />
              </td>
              <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{device.device_status || '—'}</td>
              <td className="py-1.5 font-mono text-[10px] text-gray-500 break-all">{device.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PendingAttributionTable({
  rows,
  lookups,
}: {
  rows: AccessSessionTracePendingAttribution[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No pending attributions.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={`${row.source}-${row.device_id}-${row.command_id}`}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill label={row.source} tone={row.source === 'memory' ? 'amber' : 'blue'} />
            <Pill label={row.requested_status} tone="gray" />
            <span className="text-xs text-gray-800 dark:text-gray-200">
              {formatTraceLookup(lookups, 'device', row.device_id)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {row.initiator
              ? `${row.initiator.userName} (${row.initiator.role}) · ${row.initiator.userId}`
              : 'No initiator'}
            {row.session_id ? ` · session ${row.session_id}` : ''}
          </div>
          <div className="mt-1 font-mono text-[10px] text-gray-500 break-all">cmd {row.command_id}</div>
        </div>
      ))}
    </div>
  );
}

export function SessionMiniTable({
  rows,
  lookups,
}: {
  rows: AccessSessionTraceRow[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">None.</p>;
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="mt-1 font-mono text-[10px] text-gray-500 break-all">{row.id}</div>
          <JsonBlock value={row} />
        </div>
      ))}
    </div>
  );
}

export function TraceEventStream({
  events,
  lookups,
}: {
  events: AccessSessionTraceEvent[];
  lookups?: AccessSessionTraceSnapshot['lookups'];
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Waiting for correlator decisions and access events…
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div
          key={event.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 px-3 py-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Pill
              label={event.kind.replace(/_/g, ' ')}
              tone={event.kind === 'correlator_decision' ? 'blue' : event.kind === 'lock_unlock_event' ? 'green' : 'gray'}
            />
            {event.decision && <Pill label={event.decision} tone="amber" />}
            {event.hook && <span className="text-[11px] text-gray-500">{event.hook}</span>}
            <span className="ml-auto text-[11px] tabular-nums text-gray-500">
              {formatDateTime(event.at) || event.at}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">
            {formatTraceLookup(lookups, 'device', event.device_id)}
            {' · '}
            {formatTraceLookup(lookups, 'user', event.user_id)}
            {event.session_id ? ` · session ${event.session_id.slice(0, 8)}` : ''}
          </div>
          <JsonBlock value={event} />
        </div>
      ))}
    </div>
  );
}

export function ClusterBanner({
  clusters,
}: {
  clusters: AccessSessionTraceSnapshot['debug']['sessions_sharing_device'];
}) {
  if (!clusters?.length) return null;
  return (
    <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 px-3 py-2">
      <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
        Multiple sessions on the same device
      </p>
      <ul className="mt-1 space-y-1 text-[11px] font-mono text-amber-900 dark:text-amber-100">
        {clusters.map((cluster) => (
          <li key={cluster.device_id}>
            {cluster.device_id.slice(0, 8)}… · {cluster.states.join(', ')} · {cluster.session_ids.length} rows
          </li>
        ))}
      </ul>
    </div>
  );
}
