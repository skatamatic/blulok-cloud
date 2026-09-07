import { AccessSession } from '@/types/access-session.types';
import { DENIAL_REASON_LABELS } from '@/constants/accessHistory.constants';
import {
  formatStepDelta,
  getAccessSessionRequestDetail,
} from '@/utils/access-session-display.utils';

export type TimelineStepIcon =
  | 'requested'
  | 'granted'
  | 'opened'
  | 'locked'
  | 'denied'
  | 'timed_out'
  | 'failed'
  | 'waiting';

export type TimelineStep = {
  id: string;
  title: string;
  detail?: string | null;
  at?: string | null;
  deltaFromPrev?: string | null;
  /** Live interim step — show waiting spinner instead of a solid icon. */
  waiting?: boolean;
  tone?: 'neutral' | 'success' | 'danger' | 'warning';
  icon: TimelineStepIcon;
};

const ON_SITE_GRANT_METHODS = new Set(['app', 'mobile_key', 'keypad', 'route_pass']);

/** Cloud remote unlock — Requested vs Opened matter because confirmation can lag. */
export function isRemoteCommandSession(session: AccessSession): boolean {
  return (
    session.origin === 'cloud_remote'
    || session.method === 'admin_remote'
    || session.method === 'remote_gateway'
  );
}

/**
 * On-site credential grant that waits for physical unlock confirmation.
 * Mobile key / app / route pass always use the grant timeline.
 * Keypad success stays compact (Unlocked → Locked); keypad pending/timeout still
 * shows Access granted → waiting / timed out.
 */
export function isOnSiteGrantSession(session: AccessSession): boolean {
  if (isRemoteCommandSession(session)) return false;
  if (!ON_SITE_GRANT_METHODS.has(session.method)) return false;
  // Denials stay a single Denied step (no preceding "Access granted").
  if (session.state === 'denied') return false;
  // Keypad success is near-instant — keep Unlocked → Locked.
  if (session.method === 'keypad' && (session.state === 'open' || session.state === 'closed')) {
    return false;
  }
  return true;
}

function denialDetail(session: AccessSession): string {
  if (session.denial_reason) {
    return (
      DENIAL_REASON_LABELS[session.denial_reason]
      || session.denial_reason.replace(/_/g, ' ')
    );
  }
  const reason = session.reason?.trim();
  return reason || 'Access denied';
}

function attemptDetail(session: AccessSession): string | null {
  return session.attempt_count > 1 ? `×${session.attempt_count} attempts` : null;
}

function joinDetails(...parts: Array<string | null | undefined>): string | null {
  const cleaned = parts.map((p) => p?.trim()).filter(Boolean) as string[];
  return cleaned.length > 0 ? cleaned.join(' · ') : null;
}

function timeoutDetail(session: AccessSession): string {
  return (
    session.reason?.trim()
    || DENIAL_REASON_LABELS.timeout
    || 'No unlock confirmation from device'
  );
}

/** Pure local / unknown: Unlocked → Locked (no separate grant step). */
function buildInstantTimelineSteps(session: AccessSession): TimelineStep[] {
  const whoOrMethod = getAccessSessionRequestDetail(session);

  if (session.state === 'denied') {
    return [
      {
        id: 'denied',
        title: 'Denied',
        detail: joinDetails(whoOrMethod, denialDetail(session)),
        at: session.settled_at || session.started_at,
        tone: 'danger',
        icon: 'denied',
      },
    ];
  }

  if (session.state === 'failed' || session.state === 'timed_out') {
    return [
      {
        id: session.state === 'timed_out' ? 'timed_out' : 'failed',
        title: session.state === 'timed_out' ? 'Timed out' : 'Failed',
        detail:
          session.state === 'timed_out'
            ? timeoutDetail(session)
            : (session.reason?.trim() || denialDetail(session) || 'Failed'),
        at: session.settled_at || session.expires_at || session.started_at,
        tone: session.state === 'timed_out' ? 'warning' : 'danger',
        icon: session.state === 'timed_out' ? 'timed_out' : 'failed',
      },
    ];
  }

  const unlockedAt = session.opened_at || session.started_at;
  const steps: TimelineStep[] = [
    {
      id: 'unlocked',
      title: 'Unlocked',
      detail: joinDetails(
        whoOrMethod,
        attemptDetail(session),
        session.state === 'open' ? 'Waiting for re-lock' : null,
      ),
      at: unlockedAt,
      waiting: session.state === 'open',
      tone: 'success',
      icon: session.state === 'open' ? 'waiting' : 'opened',
    },
  ];

  if (session.closed_at || session.state === 'closed') {
    steps.push({
      id: 'locked',
      title: 'Locked',
      at: session.closed_at,
      deltaFromPrev: formatStepDelta(unlockedAt, session.closed_at),
      tone: 'neutral',
      icon: 'locked',
    });
  }

  return steps;
}

/**
 * On-site grant: Access granted → Waiting for unlock | Timed out | Unlocked → Locked.
 */
function buildOnSiteGrantTimelineSteps(session: AccessSession): TimelineStep[] {
  const whoOrMethod = getAccessSessionRequestDetail(session);
  const steps: TimelineStep[] = [
    {
      id: 'granted',
      title: 'Access granted',
      detail: joinDetails(whoOrMethod, attemptDetail(session)),
      at: session.started_at,
      tone: 'neutral',
      icon: 'granted',
    },
  ];

  if (session.state === 'denied') {
    steps.push({
      id: 'denied',
      title: 'Denied',
      detail: denialDetail(session),
      at: session.settled_at || session.started_at,
      deltaFromPrev: formatStepDelta(session.started_at, session.settled_at || session.started_at),
      tone: 'danger',
      icon: 'denied',
    });
    return steps;
  }

  if (session.state === 'failed' || session.state === 'timed_out') {
    steps.push({
      id: session.state === 'timed_out' ? 'timed_out' : 'failed',
      title: session.state === 'timed_out' ? 'Timed out' : 'Failed',
      detail:
        session.state === 'timed_out'
          ? timeoutDetail(session)
          : (session.reason?.trim() || denialDetail(session) || 'Failed'),
      at: session.settled_at || session.expires_at || session.started_at,
      deltaFromPrev: formatStepDelta(
        session.started_at,
        session.settled_at || session.expires_at || session.started_at,
      ),
      tone: session.state === 'timed_out' ? 'warning' : 'danger',
      icon: session.state === 'timed_out' ? 'timed_out' : 'failed',
    });
    return steps;
  }

  if (session.state === 'pending') {
    steps.push({
      id: 'waiting_unlock',
      title: 'Waiting for device to unlock',
      detail: attemptDetail(session),
      at: session.started_at,
      waiting: true,
      tone: 'success',
      icon: 'waiting',
    });
    return steps;
  }

  const openedAt = session.opened_at || session.started_at;
  steps.push({
    id: 'unlocked',
    title: 'Unlocked',
    detail: session.state === 'open' ? 'Waiting for re-lock' : attemptDetail(session),
    at: openedAt,
    deltaFromPrev: formatStepDelta(session.started_at, openedAt),
    waiting: session.state === 'open',
    tone: 'success',
    icon: session.state === 'open' ? 'waiting' : 'opened',
  });

  if (session.closed_at || session.state === 'closed') {
    steps.push({
      id: 'locked',
      title: 'Locked',
      at: session.closed_at,
      deltaFromPrev: formatStepDelta(session.opened_at, session.closed_at),
      tone: 'neutral',
      icon: 'locked',
    });
  }

  return steps;
}

/** Remote command: Requested → (waiting) → Opened → Locked / Timed out. */
function buildRemoteTimelineSteps(session: AccessSession): TimelineStep[] {
  const requestDetail = getAccessSessionRequestDetail(session);
  const steps: TimelineStep[] = [
    {
      id: 'requested',
      title: 'Requested',
      detail: requestDetail,
      at: session.started_at,
      tone: 'neutral',
      icon: 'requested',
    },
  ];

  if (session.state === 'denied') {
    steps.push({
      id: 'denied',
      title: 'Denied',
      detail: denialDetail(session),
      at: session.settled_at || session.started_at,
      deltaFromPrev: formatStepDelta(session.started_at, session.settled_at || session.started_at),
      tone: 'danger',
      icon: 'denied',
    });
    return steps;
  }

  if (session.state === 'failed' || session.state === 'timed_out') {
    steps.push({
      id: session.state === 'timed_out' ? 'timed_out' : 'failed',
      title: session.state === 'timed_out' ? 'Timed out' : 'Failed',
      detail:
        session.state === 'timed_out'
          ? timeoutDetail(session)
          : (session.reason?.trim() || denialDetail(session) || 'Failed'),
      at: session.settled_at || session.expires_at || session.started_at,
      deltaFromPrev: formatStepDelta(
        session.started_at,
        session.settled_at || session.expires_at || session.started_at,
      ),
      tone: session.state === 'timed_out' ? 'warning' : 'danger',
      icon: session.state === 'timed_out' ? 'timed_out' : 'failed',
    });
    return steps;
  }

  if (session.state === 'pending') {
    steps.push({
      id: 'waiting_unlock',
      title: 'Waiting for device to unlock',
      detail: attemptDetail(session),
      at: session.started_at,
      waiting: true,
      tone: 'success',
      icon: 'waiting',
    });
    return steps;
  }

  const openedAt = session.opened_at || session.started_at;
  steps.push({
    id: 'opened',
    title: 'Opened',
    detail: session.state === 'open' ? 'Waiting for re-lock' : attemptDetail(session),
    at: openedAt,
    deltaFromPrev: formatStepDelta(session.started_at, openedAt),
    waiting: session.state === 'open',
    tone: 'success',
    icon: session.state === 'open' ? 'waiting' : 'opened',
  });

  if (session.closed_at || session.state === 'closed') {
    steps.push({
      id: 'locked',
      title: 'Locked',
      at: session.closed_at,
      deltaFromPrev: formatStepDelta(session.opened_at, session.closed_at),
      tone: 'neutral',
      icon: 'locked',
    });
  }

  return steps;
}

export function buildAccessSessionTimelineSteps(session: AccessSession): TimelineStep[] {
  if (isRemoteCommandSession(session)) return buildRemoteTimelineSteps(session);
  if (isOnSiteGrantSession(session)) return buildOnSiteGrantTimelineSteps(session);
  return buildInstantTimelineSteps(session);
}
