import { useMemo, useState } from 'react';
import type { AppRealtimeEventEntry } from '@protocol/user-simulator-state';
import {
  formatEventLogLocalTime,
  isAppRealtimeHeartbeatEvent,
  readHideHeartbeatLogsPreference,
  writeHideHeartbeatLogsPreference,
} from '../utils/event-log.utils';
import { PanelSection } from './PanelSection';

type Props = {
  events: AppRealtimeEventEntry[];
  onClear: () => void;
  fillHeight?: boolean;
};

function directionClass(direction: AppRealtimeEventEntry['direction']): string {
  if (direction === 'in') return 'text-blue-600 dark:text-blue-400';
  if (direction === 'out') return 'text-green-600 dark:text-green-400';
  return 'text-gray-600 dark:text-gray-400';
}

function eventBadgeClass(eventName?: string): string {
  if (!eventName) return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  if (eventName === 'app_snapshot') {
    return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  }
  if (eventName.startsWith('notification')) {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  }
  if (eventName.includes('device') || eventName.includes('gateway') || eventName.includes('units')) {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200';
  }
  if (eventName.includes('activity') || eventName.includes('access') || eventName.includes('key_sharing')) {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
}

export function AppRealtimeEventLog({ events, onClear, fillHeight = false }: Props) {
  const [hideHeartbeats, setHideHeartbeats] = useState(readHideHeartbeatLogsPreference);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { visible, hiddenCount } = useMemo(() => {
    const reversed = [...events].reverse();
    if (!hideHeartbeats) return { visible: reversed, hiddenCount: 0 };
    const visibleEvents = reversed.filter((e) => !isAppRealtimeHeartbeatEvent(e));
    return { visible: visibleEvents, hiddenCount: reversed.length - visibleEvents.length };
  }, [events, hideHeartbeats]);

  return (
    <PanelSection
      embedded
      className={
        fillHeight
          ? 'flex min-h-0 flex-1 flex-col'
          : 'flex min-h-[18rem] flex-col'
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">App realtime events</h3>
          <p className="text-xs text-gray-500">
            Snapshot and live `/ws/app` fanout — click a row to expand; select JSON to copy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={hideHeartbeats}
              onChange={(e) => {
                setHideHeartbeats(e.target.checked);
                writeHideHeartbeatLogsPreference(e.target.checked);
              }}
            />
            Hide heartbeats
            {hideHeartbeats && hiddenCount > 0 && (
              <span className="text-gray-400">({hiddenCount} hidden)</span>
            )}
          </label>
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={!events.length}
            onClick={onClear}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-950/50">
        {visible.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <div
              key={entry.id}
              className="border-b border-gray-200/80 dark:border-gray-800"
            >
              <button
                type="button"
                className="block w-full px-2 py-1.5 text-left transition-colors hover:bg-white/80 dark:hover:bg-gray-900/80"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="shrink-0 text-gray-400">{formatEventLogLocalTime(entry.timestamp)}</span>
                  <span className={directionClass(entry.direction)}>[{entry.direction}]</span>
                  {entry.eventName && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide ${eventBadgeClass(entry.eventName)}`}
                    >
                      {entry.eventName}
                    </span>
                  )}
                  <span className="min-w-0 break-all text-gray-800 dark:text-gray-200">{entry.summary}</span>
                </div>
              </button>
              {expanded && entry.payload !== undefined && (
                <pre
                  className="mx-2 mb-2 max-h-64 cursor-text select-text overflow-auto rounded-md bg-white p-2 text-[11px] leading-relaxed text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              )}
            </div>
          );
        })}

        {!visible.length && (
          <p className="px-2 py-6 text-center text-sm text-gray-500">
            {events.length && hideHeartbeats
              ? 'No events to show — heartbeats hidden'
              : 'No events yet — open the app to subscribe and receive a snapshot'}
          </p>
        )}
      </div>
    </PanelSection>
  );
}
