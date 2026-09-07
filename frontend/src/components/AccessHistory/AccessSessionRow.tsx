import { Fragment, useEffect, useState } from 'react';
import { AccessLog } from '@/types/access-history.types';
import { AccessSession } from '@/types/access-session.types';
import { generateHighlightId } from '@/utils/navigation.utils';
import { formatDateTime } from '@/utils/datetime.utils';
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
import { AccessSessionTimeline } from '@/components/AccessHistory/AccessSessionTimeline';
import { getAccessSessionActionIcon } from '@/components/AccessHistory/accessHistoryIcons';
import {
  UserIcon,
  LinkIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface AccessSessionRowProps {
  session: AccessSession;
  isExpanded: boolean;
  hideFacility: boolean;
  events?: AccessLog[];
  eventsLoading?: boolean;
  onToggle: (sessionId: string) => void;
  onNavigate: (
    url: string,
    targetId?: string,
    targetType?: 'user' | 'facility' | 'unit' | 'device',
  ) => void;
}

export function AccessSessionRow({
  session,
  isExpanded,
  hideFacility,
  events,
  eventsLoading = false,
  onToggle,
  onNavigate,
}: AccessSessionRowProps) {
  const [, setTick] = useState(0);
  const liveTicking = session.state === 'open' || session.state === 'pending';

  useEffect(() => {
    if (!liveTicking) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveTicking, session.id]);

  const ActionIcon = getAccessSessionActionIcon(session);
  const methodLabel = formatAccessSessionTitle(session);
  const titleTone = getAccessSessionTitleToneClass(session);
  const outcome = getAccessSessionOutcomeDisplay(session);
  const userDisplay = getAccessSessionUserDisplay(session);
  const subject = getAccessSessionSubjectDisplay(session, { hideFacility });
  const showOverride = hasSessionOccupiedOverride(session);
  const overrideReason = getSessionOverrideReasonLabel(session);
  const openEscalation = getAccessSessionOpenEscalation(session);
  const isCriticalOpen = openEscalation === 'critical';
  const showLiveClock =
    outcome.tone === 'pending'
    || outcome.tone === 'open'
    || outcome.tone === 'open_stale';
  const iconGlyphClass = isCriticalOpen ? 'text-white' : titleTone;
  const escalationRowClass = getAccessSessionEscalationRowClass(session);

  const userHref = session.user_id ? `/users/${session.user_id}/details` : null;
  const unitHref = session.unit_id ? `/units/${session.unit_id}` : null;

  return (
    <Fragment>
      <tr
        id={generateHighlightId('access-session', session.id)}
        className={`group cursor-pointer transition-colors duration-200 ${
          escalationRowClass
          || (isExpanded
            ? 'bg-blue-50/60 dark:bg-blue-900/15 hover:bg-blue-50/70 dark:hover:bg-blue-900/10'
            : 'hover:bg-blue-50/70 dark:hover:bg-blue-900/10')
        } ${
          showOverride && !escalationRowClass
            ? 'bg-amber-50/70 dark:bg-amber-950/25 hover:bg-amber-50 dark:hover:bg-amber-950/35'
            : ''
        }`}
        onClick={() => onToggle(session.id)}
        aria-expanded={isExpanded}
      >
        <td className="px-4 py-3 align-middle">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${getAccessSessionIconTileClass(session)}`}
            >
              <ActionIcon className={`h-4 w-4 ${iconGlyphClass}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                {unitHref && subject.linkUnit ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(unitHref, session.unit_id, 'unit');
                    }}
                    className="block min-w-0 max-w-full truncate text-left text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                    title={subject.primary}
                  >
                    <span className="inline-flex max-w-full items-center">
                      <span className="truncate">{subject.primary}</span>
                      <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                    </span>
                  </button>
                ) : (
                  <div
                    className="truncate text-sm font-medium text-gray-900 dark:text-white"
                    title={subject.primary}
                  >
                    {subject.primary}
                  </div>
                )}
                {isCriticalOpen && (
                  <span
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-rose-500"
                    title="Lock has been open for more than 1 hour"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3" />
                    Left open
                  </span>
                )}
                {showOverride && (
                  <span
                    className="inline-flex shrink-0 items-center rounded-full bg-amber-200/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/70 dark:text-amber-200"
                    title="Occupied unit override"
                  >
                    Override
                  </span>
                )}
              </div>
              {subject.secondary && (
                <div
                  className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400"
                  title={subject.secondary}
                >
                  {subject.secondary}
                </div>
              )}
              {isCriticalOpen && (
                <div className="mt-0.5 truncate text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  Open over 1 hour. May have been left unlocked
                </div>
              )}
              {overrideReason && (
                <div className="mt-0.5 truncate text-[11px] font-medium text-amber-800 dark:text-amber-300/90">
                  Occupied unit · {overrideReason}
                </div>
              )}
            </div>
          </div>
        </td>

        <td className="px-4 py-3 align-middle">
          <div className="flex items-center min-w-0 gap-2">
            <UserIcon
              className={`h-4 w-4 shrink-0 ${
                userDisplay.unidentified
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'text-gray-400'
              }`}
            />
            <div className="min-w-0 flex-1">
              {userHref && !userDisplay.unidentified ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(userHref, session.user_id, 'user');
                  }}
                  className="block max-w-full truncate text-left text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors duration-200"
                  title={userDisplay.primary}
                >
                  <span className="inline-flex max-w-full items-center">
                    <span className="truncate">{userDisplay.primary}</span>
                    <LinkIcon className="ml-1 h-3 w-3 shrink-0" />
                  </span>
                </button>
              ) : (
                <div
                  className={
                    userDisplay.unidentified
                      ? 'truncate text-sm text-gray-500 dark:text-gray-400'
                      : 'truncate text-sm font-medium text-gray-900 dark:text-white'
                  }
                  title={userDisplay.unidentified ? UNIDENTIFIED_USER_TITLE : userDisplay.primary}
                >
                  {userDisplay.primary}
                </div>
              )}
              {userDisplay.secondary && (
                <div
                  className="truncate text-xs text-gray-500 dark:text-gray-400"
                  title={userDisplay.secondary}
                >
                  {userDisplay.secondary}
                </div>
              )}
            </div>
          </div>
        </td>

        <td className="px-4 py-3 align-middle">
          <div
            className={`truncate text-sm font-medium ${titleTone}`}
            title={methodLabel}
          >
            {methodLabel}
          </div>
        </td>

        <td className="px-4 py-3 align-middle whitespace-nowrap">
          <span
            className={`inline-flex max-w-full items-center truncate rounded-full px-2.5 py-1 text-xs font-medium ${getAccessSessionOutcomePillClass(outcome.tone)}`}
            title={outcome.label}
          >
            {showLiveClock && (
              <ClockIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            )}
            {outcome.tone === 'open_critical' && (
              <ExclamationTriangleIcon className="mr-1 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{outcome.label}</span>
          </span>
        </td>

        <td className="px-4 py-3 align-middle whitespace-nowrap">
          <div className="text-sm text-gray-900 dark:text-white">
            {formatDateTime(session.started_at)}
          </div>
        </td>

        <td className="px-2 py-3 align-middle text-center whitespace-nowrap">
          {isExpanded ? (
            <ChevronUpIcon className="mx-auto h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRightIcon className="mx-auto h-4 w-4 text-gray-400" />
          )}
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-gray-50/60 dark:bg-white/[0.03]">
          <td colSpan={6} className="px-4 py-3">
            {eventsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#147FD4] border-t-transparent" />
                Loading timeline…
              </div>
            ) : (
              <AccessSessionTimeline session={session} events={events} />
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
