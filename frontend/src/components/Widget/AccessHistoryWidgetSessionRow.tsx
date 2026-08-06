import { useEffect, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { AccessSession } from '@/types/access-session.types';
import { AccessSessionTimeline } from '@/components/AccessHistory/AccessSessionTimeline';
import { getAccessSessionActionIcon } from '@/components/AccessHistory/accessHistoryIcons';
import {
  formatAccessSessionTitle,
  getAccessSessionEscalationRowClass,
  getAccessSessionIconTileClass,
  getAccessSessionOpenEscalation,
  getAccessSessionOutcomeDisplay,
  getAccessSessionOutcomePillClass,
  getAccessSessionSubjectDisplay,
  getAccessSessionTitleToneClass,
  getAccessSessionUserDisplay,
  getSessionOverrideReasonLabel,
  hasSessionOccupiedOverride,
  UNIDENTIFIED_USER_TITLE,
} from '@/utils/access-session-display.utils';
import { formatRelativeWithExact } from '@/utils/datetime.utils';

interface AccessHistoryWidgetSessionRowProps {
  session: AccessSession;
  hideFacility: boolean;
  expanded: boolean;
  onToggle: (sessionId: string) => void;
}

export function AccessHistoryWidgetSessionRow({
  session,
  hideFacility,
  expanded,
  onToggle,
}: AccessHistoryWidgetSessionRowProps) {
  const liveTicking = session.state === 'open' || session.state === 'pending';
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!liveTicking) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveTicking, session.id]);

  const title = formatAccessSessionTitle(session);
  const outcome = getAccessSessionOutcomeDisplay(session);
  const subject = getAccessSessionSubjectDisplay(session, { hideFacility });
  const unitLabel = subject.primary;
  const userDisplay = getAccessSessionUserDisplay(session);
  const entryTime = formatRelativeWithExact(session.started_at, {
    absoluteAfterHours: 24,
    absoluteStyle: 'datetime',
  });
  const isOverride = hasSessionOccupiedOverride(session);
  const overrideReason = getSessionOverrideReasonLabel(session);
  const Icon = getAccessSessionActionIcon(session);
  const tone = getAccessSessionTitleToneClass(session);
  const tile = getAccessSessionIconTileClass(session);
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon;
  const openEscalation = getAccessSessionOpenEscalation(session);
  const isCriticalOpen = openEscalation === 'critical';
  const escalationRowClass = getAccessSessionEscalationRowClass(session);
  const showLiveClock =
    outcome.tone === 'pending'
    || outcome.tone === 'open'
    || outcome.tone === 'open_stale';
  const iconGlyphClass = isCriticalOpen ? 'text-white' : tone;

  return (
    <div
      className={`rounded-md transition-colors duration-200 ${
        escalationRowClass
        || (isOverride ? 'bg-amber-50/70 dark:bg-amber-950/25' : '')
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(session.id)}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-200 ${
          escalationRowClass
            ? ''
            : isOverride
              ? 'hover:bg-amber-50 dark:hover:bg-amber-950/35'
              : expanded
                ? 'bg-blue-50/60 dark:bg-blue-900/15'
                : 'hover:bg-blue-50/70 dark:hover:bg-blue-900/10'
        }`}
      >
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tile}`}>
          <Icon className={`h-3.5 w-3.5 ${iconGlyphClass}`} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 truncate">
              <span
                className="text-sm font-semibold text-gray-900 dark:text-gray-100"
                title={unitLabel}
              >
                {unitLabel}
              </span>
              <span className="mx-1.5 text-gray-300 dark:text-gray-600" aria-hidden>·</span>
              <span className={`text-sm font-medium ${tone}`} title={title}>
                {title}
              </span>
            </div>

            <span
              className={`inline-flex max-w-[48%] shrink-0 items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${getAccessSessionOutcomePillClass(outcome.tone)}`}
              title={outcome.label}
            >
              {showLiveClock && (
                <ClockIcon className="mr-0.5 h-3 w-3 shrink-0" />
              )}
              {outcome.tone === 'open_critical' && (
                <ExclamationTriangleIcon className="mr-0.5 h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{outcome.label}</span>
            </span>

            <Chevron className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
          </div>

          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <UserIcon
              className={`h-3 w-3 shrink-0 ${
                userDisplay.unidentified ? 'text-gray-300 dark:text-gray-600' : ''
              }`}
            />
            <span
              className={`truncate ${
                userDisplay.unidentified ? 'text-gray-400 dark:text-gray-500' : ''
              }`}
              title={userDisplay.unidentified ? UNIDENTIFIED_USER_TITLE : userDisplay.primary}
            >
              {userDisplay.primary}
            </span>
            <span className="text-gray-300 dark:text-gray-600" aria-hidden>·</span>
            <span className="shrink-0 tabular-nums" title={entryTime.title}>
              {entryTime.display}
            </span>
            {overrideReason && (
              <>
                <span className="text-gray-300 dark:text-gray-600" aria-hidden>·</span>
                <span
                  className="truncate font-medium text-amber-800 dark:text-amber-300/90"
                  title={`Occupied unit · ${overrideReason}`}
                >
                  {overrideReason}
                </span>
              </>
            )}
          </div>
        </div>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          {expanded && (
            <div className="border-t border-gray-200/80 bg-gray-50/60 px-2 pb-2 pt-1.5 dark:border-white/10 dark:bg-white/[0.03]">
              <AccessSessionTimeline session={session} compact />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
