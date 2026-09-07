import { motion } from 'framer-motion';
import { AccessLog } from '@/types/access-history.types';
import {
  formatAccessAction,
  formatAccessMethod,
  getAccessUserDisplay,
} from '@/utils/access-history-display.utils';
import { UNIDENTIFIED_USER_LABEL } from '@/utils/access-session-display.utils';
import { formatRelativeWithExact } from '@/utils/datetime.utils';

export type AccessHistoryCompactRowLog = {
  id?: string;
  occurred_at?: string;
  created_at?: string;
  action?: string;
  method?: string;
  result?: string;
  user_id?: string;
  user_name?: string | null;
  success?: boolean;
};

const RELATIVE_OPTS = { absoluteAfterHours: 24, absoluteStyle: 'date' as const };

type AccessHistoryCompactRowProps = {
  log: AccessHistoryCompactRowLog;
  index: number;
};

/**
 * Compact motion list row for unit expand / widget access snippets
 * (not the full Access History table row).
 */
export function AccessHistoryCompactRow({ log, index }: AccessHistoryCompactRowProps) {
  const ts = log.occurred_at ?? log.created_at ?? '';
  const accessLog = log as AccessLog;
  const succeeded = accessLog.success ?? (log.result ?? '').toLowerCase() === 'success';
  const userLabel = getAccessUserDisplay(accessLog).primary;
  const relativeTs = formatRelativeWithExact(ts, RELATIVE_OPTS);

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`flex items-center justify-between gap-3 rounded-md bg-gray-50/90 px-2 py-1.5 text-xs text-gray-500 dark:bg-gray-900/45 dark:text-gray-400`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
            succeeded ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />
        <span className="text-gray-800 dark:text-gray-200">{formatAccessAction(accessLog)}</span>
        <span className="truncate">{userLabel !== UNIDENTIFIED_USER_LABEL ? userLabel : formatAccessMethod(accessLog.method ?? '')}</span>
      </span>
      <span className="shrink-0 tabular-nums" title={relativeTs.title}>
        {relativeTs.display}
      </span>
    </motion.li>
  );
}
