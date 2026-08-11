import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ClockIcon } from '@heroicons/react/24/outline';
import { AccessSession } from '@/types/access-session.types';
import {
  formatAccessSessionTitle,
  getAccessSessionOutcomeDisplay,
  getAccessSessionOutcomePillClass,
  getAccessSessionUserDisplay,
  UNIDENTIFIED_USER_TITLE,
} from '@/utils/access-session-display.utils';
import { formatRelativeWithExact } from '@/utils/datetime.utils';

const RELATIVE_OPTS = { absoluteAfterHours: 24, absoluteStyle: 'date' as const };

type AccessHistoryCompactSessionRowProps = {
  session: AccessSession;
  index: number;
};

function toneDotClass(tone: string): string {
  switch (tone) {
    case 'pending':
      return 'bg-sky-500';
    case 'open':
      return 'bg-emerald-500';
    case 'open_stale':
      return 'bg-amber-500';
    case 'open_critical':
      return 'bg-rose-500';
    case 'success':
      return 'bg-emerald-500';
    case 'timed_out':
      return 'bg-amber-500';
    case 'failed':
      return 'bg-rose-500';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Compact, non-expandable session row for unit expand / snippets.
 * Shows session title + live outcome status (no event timeline).
 */
export function AccessHistoryCompactSessionRow({
  session,
  index,
}: AccessHistoryCompactSessionRowProps) {
  const liveTicking = session.state === 'open' || session.state === 'pending';
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!liveTicking) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveTicking, session.id]);

  const title = formatAccessSessionTitle(session);
  const outcome = getAccessSessionOutcomeDisplay(session);
  const userDisplay = getAccessSessionUserDisplay(session);
  const started = formatRelativeWithExact(session.started_at, RELATIVE_OPTS);
  const showLiveClock =
    outcome.tone === 'pending'
    || outcome.tone === 'open'
    || outcome.tone === 'open_stale'
    || outcome.tone === 'open_critical';

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className="flex items-center justify-between gap-3 rounded-md bg-gray-50/90 px-2 py-1.5 text-xs text-gray-500 dark:bg-gray-900/45 dark:text-gray-400"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${toneDotClass(outcome.tone)}`}
          aria-hidden
        />
        <span className="min-w-0 truncate">
          <span className="text-gray-800 dark:text-gray-200">{title}</span>
          <span className="mx-1 text-gray-300 dark:text-gray-600" aria-hidden>
            ·
          </span>
          <span
            className={
              userDisplay.unidentified
                ? 'text-gray-400 dark:text-gray-500'
                : 'truncate'
            }
            title={
              userDisplay.unidentified ? UNIDENTIFIED_USER_TITLE : userDisplay.primary
            }
          >
            {userDisplay.primary}
          </span>
        </span>
      </span>

      <span className="flex max-w-[48%] shrink-0 items-center gap-1.5">
        <span
          className={`inline-flex max-w-full items-center truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getAccessSessionOutcomePillClass(outcome.tone)}`}
          title={outcome.label}
        >
          {showLiveClock && <ClockIcon className="mr-0.5 h-3 w-3 shrink-0" />}
          <span className="truncate">{outcome.label}</span>
        </span>
        <span className="shrink-0 tabular-nums" title={started.title}>
          {started.display}
        </span>
      </span>
    </motion.li>
  );
}
