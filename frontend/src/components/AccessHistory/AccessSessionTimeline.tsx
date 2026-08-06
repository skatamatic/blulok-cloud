import {
  CheckCircleIcon,
  CloudIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { AccessLog } from '@/types/access-history.types';
import { AccessSession } from '@/types/access-session.types';
import { formatDateTime } from '@/utils/datetime.utils';
import {
  getAccessSessionMetadata,
  getSessionOverrideReasonLabel,
  hasSessionOccupiedOverride,
} from '@/utils/access-session-display.utils';
import {
  buildAccessSessionTimelineSteps,
  TimelineStep,
  TimelineStepIcon,
} from '@/utils/access-session-timeline.utils';

interface AccessSessionTimelineProps {
  session: AccessSession;
  /** Optional raw events (kept for callers; not shown in the timeline). */
  events?: AccessLog[];
  /** Tighter spacing for widget expand panels (matches widget row icon size). */
  compact?: boolean;
}

const STEP_ICONS: Record<
  Exclude<TimelineStepIcon, 'waiting'>,
  typeof LockOpenIcon
> = {
  requested: CloudIcon,
  granted: CheckCircleIcon,
  opened: LockOpenIcon,
  locked: LockClosedIcon,
  denied: XCircleIcon,
  timed_out: ExclamationTriangleIcon,
  failed: XCircleIcon,
};

function markerToneClass(step: TimelineStep): string {
  switch (step.tone) {
    case 'danger':
      return 'text-rose-500 dark:text-rose-400';
    case 'warning':
      return 'text-amber-500 dark:text-amber-400';
    case 'success':
      return 'text-emerald-500 dark:text-emerald-400';
    default:
      return 'text-gray-400 dark:text-gray-500';
  }
}

function titleToneClass(step: TimelineStep): string {
  if (step.tone === 'danger') return 'text-rose-700 dark:text-rose-300';
  if (step.tone === 'warning') return 'text-amber-800 dark:text-amber-300';
  if (step.waiting) return 'text-[#147FD4] dark:text-sky-400';
  return 'text-gray-900 dark:text-white';
}

function TimelineMarker({ step }: { step: TimelineStep }) {
  const maskClass =
    'relative z-10 mx-auto flex h-4 w-4 items-center justify-center bg-transparent';

  if (step.waiting || step.icon === 'waiting') {
    return (
      <span className={maskClass} aria-hidden>
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#147FD4]/35 border-t-[#147FD4] dark:border-sky-400/25 dark:border-t-sky-400" />
      </span>
    );
  }

  const Icon = STEP_ICONS[step.icon];

  return (
    <span className={`${maskClass} overflow-visible ${markerToneClass(step)}`} aria-hidden>
      <Icon className="h-4 w-4 shrink-0" />
    </span>
  );
}

export function AccessSessionTimeline({ session, compact = false }: AccessSessionTimelineProps) {
  const steps = buildAccessSessionTimelineSteps(session);
  const meta = getAccessSessionMetadata(session);
  const overrideReason = getSessionOverrideReasonLabel(session);
  const overrideNotes =
    typeof meta.tenant_unlock_override?.notes === 'string'
      ? meta.tenant_unlock_override.notes.trim()
      : '';

  const stepGap = compact ? 'pb-3' : 'pb-5';
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const timeSize = compact ? 'text-[11px]' : 'text-xs';
  // Match parent row icon tile (page h-8 w-8 / widget h-7 w-7) + gap-2.5.
  const railCol = compact ? 'w-7' : 'w-8';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <ol className="relative space-y-0 overflow-visible">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          return (
            <li
              key={step.id}
              className={`relative flex items-start gap-2.5 overflow-visible ${isLast ? 'pb-0' : stepGap}`}
            >
              {!isLast && (
                <span
                  className={`absolute top-5 bottom-0 w-0.5 -translate-x-1/2 bg-gray-200 dark:bg-white/15 ${
                    compact ? 'left-3.5' : 'left-4'
                  }`}
                  aria-hidden
                />
              )}
              <div className={`relative z-10 ${railCol} shrink-0 pt-0.5`}>
                <TimelineMarker step={step} />
              </div>
              <div className="relative z-10 min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={`${titleSize} font-medium ${titleToneClass(step)}`}>
                    {step.title}
                  </span>
                  {step.detail && (
                    <span className={`${timeSize} text-gray-500 dark:text-gray-400`}>
                      {step.detail}
                    </span>
                  )}
                  {step.deltaFromPrev && index > 0 && !step.waiting && (
                    <span className="text-[11px] font-medium text-[#147FD4] dark:text-sky-400">
                      +{step.deltaFromPrev}
                    </span>
                  )}
                </div>
                {step.at && (
                  <div className={`mt-0.5 ${timeSize} text-gray-500 dark:text-gray-400 tabular-nums`}>
                    {formatDateTime(step.at)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(hasSessionOccupiedOverride(session)
        || Boolean(overrideNotes)
        || meta.keypad != null
        || meta.route_pass != null) && (
        <div className="flex gap-2.5">
          <div className={`${railCol} shrink-0`} aria-hidden />
          <div className="min-w-0 flex-1 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs dark:border-amber-500/25 dark:bg-amber-950/30">
            {overrideReason && (
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Unlock reason: {overrideReason}
              </p>
            )}
            {overrideNotes && (
              <p className="mt-1 text-amber-800 dark:text-amber-300/90">Notes: {overrideNotes}</p>
            )}
            {meta.keypad != null && (
              <p className="mt-1 text-amber-800 dark:text-amber-300/90">
                Keypad: {typeof meta.keypad === 'string' ? meta.keypad : JSON.stringify(meta.keypad)}
              </p>
            )}
            {meta.route_pass != null && (
              <p className="mt-1 text-amber-800 dark:text-amber-300/90">
                Route pass:{' '}
                {typeof meta.route_pass === 'string'
                  ? meta.route_pass
                  : JSON.stringify(meta.route_pass)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
