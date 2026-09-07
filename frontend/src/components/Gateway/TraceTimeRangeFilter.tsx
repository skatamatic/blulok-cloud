import { useEffect, useState, type ReactNode } from 'react';
import {
  CalendarDaysIcon,
  ChevronDownIcon,
  ClockIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/Common/Button';
import { TraceFilterField } from '@/components/Gateway/GatewaySessionTracePanels';
import {
  formatTraceTimeFilterSummary,
  isTraceTimeRangeInverted,
  joinDatetimeLocal,
  splitDatetimeLocal,
  TRACE_TIME_DEFAULTS,
  type TraceTimeBound,
} from '@/utils/access-session-trace-time-filter.utils';

const TRIGGER_CLASS =
  'relative flex w-full items-center rounded-md border border-gray-300 bg-white py-2 pl-9 pr-8 text-left text-sm text-gray-900 transition-colors duration-150 hover:border-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:border-gray-500';

const FIELD_CLASS =
  'block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white';

function DateTimeBound({
  bound,
  value,
  onChange,
  onRemove,
  paired,
}: {
  bound: TraceTimeBound;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  paired?: boolean;
}) {
  const { date, time } = splitDatetimeLocal(value);
  const label = bound === 'after' ? (paired ? 'From' : 'After') : paired ? 'To' : 'Before';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{label}</p>
        <button
          type="button"
          aria-label={`Remove ${label.toLowerCase()} bound`}
          onClick={onRemove}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            Date
          </span>
          <input
            type="date"
            aria-label={`${label} date`}
            value={date}
            onChange={(event) => {
              const nextDate = event.target.value;
              if (!nextDate) {
                onChange('');
                return;
              }
              onChange(joinDatetimeLocal(nextDate, time || TRACE_TIME_DEFAULTS[bound]));
            }}
            className={FIELD_CLASS}
          />
        </label>
        {date ? (
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              <ClockIcon className="h-3.5 w-3.5" />
              Time
            </span>
            <input
              type="time"
              step="1"
              aria-label={`${label} time`}
              value={time}
              onChange={(event) => onChange(joinDatetimeLocal(date, event.target.value))}
              className={FIELD_CLASS}
            />
          </label>
        ) : (
          <p className="self-end text-[11px] text-gray-500 dark:text-gray-400">
            Pick a date, then refine the time.
          </p>
        )}
      </div>
    </div>
  );
}

export function TraceTimeRangeFilter({
  after,
  before,
  onAfterChange,
  onBeforeChange,
  children,
}: {
  after: string;
  before: string;
  onAfterChange: (value: string) => void;
  onBeforeChange: (value: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draftAfter, setDraftAfter] = useState(false);
  const [draftBefore, setDraftBefore] = useState(false);
  const showAfter = draftAfter || Boolean(after);
  const showBefore = draftBefore || Boolean(before);
  const summary = formatTraceTimeFilterSummary({ time_after: after, time_before: before });
  const active = summary !== 'Anytime';
  const inverted = isTraceTimeRangeInverted({ time_after: after, time_before: before });

  useEffect(() => {
    if (!after) setDraftAfter(false);
  }, [after]);
  useEffect(() => {
    if (!before) setDraftBefore(false);
  }, [before]);

  const addAfter = () => {
    setOpen(true);
    setDraftAfter(true);
  };
  const addBefore = () => {
    setOpen(true);
    setDraftBefore(true);
  };
  const addBetween = () => {
    setOpen(true);
    setDraftAfter(true);
    setDraftBefore(true);
  };
  const removeAfter = () => {
    onAfterChange('');
    setDraftAfter(false);
  };
  const removeBefore = () => {
    onBeforeChange('');
    setDraftBefore(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {children}
        <TraceFilterField label="Time">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Time filter, ${summary}`}
            onClick={() => setOpen((value) => !value)}
            className={`${TRIGGER_CLASS} ${
              active ? 'ring-1 ring-[#147FD4]/30' : ''
            }`}
          >
            <CalendarDaysIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <span className={`min-w-0 truncate ${active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
              {summary}
            </span>
            <ChevronDownIcon
              className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-transform duration-200 ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        </TraceFilterField>
      </div>
      {open && (
        <div className="origin-top rounded-lg border border-gray-200 bg-gray-50/80 p-3 transition-all duration-200 dark:border-gray-700 dark:bg-gray-900/40">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Constrain by time</p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            After, before, or between two times. Sessions stay whole if they overlap;
            events and NDJSON filter by timestamp.
          </p>
          {inverted && (
            <p className="mt-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
              From is after To — no events or sessions will match. Swap or adjust the bounds.
            </p>
          )}
          {!showAfter && !showBefore ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={addAfter}>
                After a time
              </Button>
              <Button variant="secondary" size="sm" onClick={addBefore}>
                Before a time
              </Button>
              <Button variant="secondary" size="sm" onClick={addBetween}>
                Between two times
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {showAfter && (
                <DateTimeBound
                  bound="after"
                  paired={showAfter && showBefore}
                  value={after}
                  onChange={onAfterChange}
                  onRemove={removeAfter}
                />
              )}
              {showBefore && (
                <DateTimeBound
                  bound="before"
                  paired={showAfter && showBefore}
                  value={before}
                  onChange={onBeforeChange}
                  onRemove={removeBefore}
                />
              )}
              <div className="flex flex-wrap gap-2">
                {!showAfter && (
                  <Button variant="ghost" size="sm" onClick={addAfter}>
                    <PlusIcon className="h-4 w-4" />
                    After a time
                  </Button>
                )}
                {!showBefore && (
                  <Button variant="ghost" size="sm" onClick={addBefore}>
                    <PlusIcon className="h-4 w-4" />
                    Before a time
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
