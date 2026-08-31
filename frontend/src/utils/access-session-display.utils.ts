import {
  AccessSession,
  AccessSessionOutcomeDisplay,
} from '@/types/access-session.types';
import {
  DENIAL_REASON_LABELS,
  METHOD_LABELS,
} from '@/constants/accessHistory.constants';
import { parseInstant } from '@/utils/datetime.utils';

const UUID_LIKE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function looksLikeUuid(value: string | undefined | null): boolean {
  if (!value) return false;
  return UUID_LIKE.test(value.trim());
}

function trimDisplay(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || looksLikeUuid(trimmed)) return null;
  return trimmed;
}

/** Gateway / correlator placeholders — not a real person label. */
function trimPersonDisplay(value: string | undefined | null): string | null {
  const trimmed = trimDisplay(value);
  if (!trimmed || /^user$/i.test(trimmed)) return null;
  if (/^(gateway|system)$/i.test(trimmed)) return null;
  if (/^unknown(\s|-)?user$/i.test(trimmed) || /^unknown$/i.test(trimmed)) return null;
  if (/^unknown[-_\s]/i.test(trimmed)) return null;
  return trimmed;
}

/** Calm label when no person can be attributed (keypad codes, etc.). Not an error. */
export const UNIDENTIFIED_USER_LABEL = 'Not identified';

export const UNIDENTIFIED_USER_TITLE =
  'No user could be attributed for this access. Expected for keypad and some on-site methods';

/** Format open/closed duration: `45s`, `3m 12s`, `1h 5m`. */
export function formatOpenDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/** Remaining time until expiresAt, e.g. `12s`, `1m 05s`. Empty when expired/invalid. */
export function formatCountdown(expiresAt: string | null | undefined, nowMs = Date.now()): string {
  const expires = parseInstant(expiresAt ?? undefined);
  if (!expires) return '';
  const remainingSec = Math.max(0, Math.ceil((expires.getTime() - nowMs) / 1000));
  return formatOpenDuration(remainingSec);
}

function formatDenialLabel(session: AccessSession): string {
  if (session.denial_reason) {
    return DENIAL_REASON_LABELS[session.denial_reason]
      || session.denial_reason.replace(/_/g, ' ');
  }
  const reason = trimDisplay(session.reason);
  return reason || 'Access denied';
}

/** Open longer than this is treated as possibly left unlocked. */
export const OPEN_STALE_AFTER_SEC = 10 * 60;

/** Open longer than this is a high-priority left-open alert. */
export const OPEN_CRITICAL_AFTER_SEC = 60 * 60;

function getOpenElapsedSec(session: AccessSession, nowMs: number): number | null {
  if (session.opened_at) {
    const opened = parseInstant(session.opened_at);
    if (!opened) return null;
    return Math.max(0, Math.floor((nowMs - opened.getTime()) / 1000));
  }
  if (session.open_duration_sec != null && Number.isFinite(session.open_duration_sec)) {
    return Math.max(0, Math.floor(session.open_duration_sec));
  }
  return null;
}

export type AccessSessionOpenEscalation = 'none' | 'stale' | 'critical';

export function getAccessSessionOpenEscalation(
  session: AccessSession,
  nowMs = Date.now(),
): AccessSessionOpenEscalation {
  if (session.state !== 'open') return 'none';
  const elapsedSec = getOpenElapsedSec(session, nowMs);
  if (elapsedSec == null) return 'none';
  if (elapsedSec >= OPEN_CRITICAL_AFTER_SEC) return 'critical';
  if (elapsedSec >= OPEN_STALE_AFTER_SEC) return 'stale';
  return 'none';
}

export function getAccessSessionOutcomeDisplay(
  session: AccessSession,
  nowMs = Date.now(),
): AccessSessionOutcomeDisplay {
  switch (session.state) {
    case 'pending': {
      const countdown = session.expires_at ? formatCountdown(session.expires_at, nowMs) : '';
      return {
        label: countdown ? `Waiting for unlock · ${countdown}` : 'Waiting for unlock',
        tone: 'pending',
      };
    }
    case 'open': {
      const elapsedSec = getOpenElapsedSec(session, nowMs);
      const elapsed = elapsedSec != null ? formatOpenDuration(elapsedSec) : '';
      const escalation = getAccessSessionOpenEscalation(session, nowMs);
      if (escalation === 'critical') {
        return {
          label: elapsed ? `Left open · ${elapsed}` : 'Left open',
          tone: 'open_critical',
        };
      }
      if (escalation === 'stale') {
        return {
          label: elapsed ? `Possibly left open · ${elapsed}` : 'Possibly left open',
          tone: 'open_stale',
        };
      }
      return {
        label: elapsed ? `Open now · ${elapsed}` : 'Open now',
        tone: 'open',
      };
    }
    case 'closed': {
      const duration = formatOpenDuration(session.open_duration_sec);
      return {
        label: duration !== '—' ? `Closed · ${duration}` : 'Closed',
        tone: 'success',
      };
    }
    case 'denied':
      return {
        label: `Denied · ${formatDenialLabel(session)}`,
        tone: 'failed',
      };
    case 'timed_out':
      return { label: 'Timed out', tone: 'timed_out' };
    case 'failed':
      return { label: 'Failed', tone: 'failed' };
    default:
      return { label: session.state, tone: 'failed' };
  }
}

export function formatAccessSessionTitle(session: AccessSession): string {
  if (session.state === 'denied' || session.outcome === 'denied') {
    return 'Access denied';
  }

  const method = session.method;
  if (
    session.origin === 'cloud_remote'
    || method === 'admin_remote'
    || method === 'remote_gateway'
  ) {
    return 'Remote unlock';
  }
  if (method === 'mobile_key' || method === 'app' || method === 'mobile_app') {
    return 'Mobile key';
  }
  if (method === 'keypad' || method === 'pin') {
    return 'Keypad';
  }
  if (method === 'route_pass') {
    return 'Route pass';
  }
  if (
    session.origin === 'local'
    || method === 'local_device'
    || method === 'automatic'
  ) {
    return 'Local unlock';
  }
  if (session.origin === 'on_site') {
    return 'On-site unlock';
  }

  return METHOD_LABELS[method]
    || method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatAccessSessionMethod(session: AccessSession): string {
  if (METHOD_LABELS[session.method]) return METHOD_LABELS[session.method];
  return session.method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getAccessSessionUserDisplay(session: AccessSession): {
  primary: string;
  secondary: string | null;
  /** True when identity is unavailable — expected for keypad / some on-site events. */
  unidentified: boolean;
} {
  const name = trimPersonDisplay(session.user_name);
  const email = trimDisplay(session.user_email);
  if (name) {
    return { primary: name, secondary: email, unidentified: false };
  }
  if (email) {
    return { primary: email, secondary: null, unidentified: false };
  }
  return {
    primary: UNIDENTIFIED_USER_LABEL,
    secondary: null,
    unidentified: true,
  };
}

/** Timeline request detail: "by Alex" or "via keypad" — never "by Unknown". */
export function getAccessSessionRequestDetail(session: AccessSession): string | null {
  const { primary, unidentified } = getAccessSessionUserDisplay(session);
  if (!unidentified) return `by ${primary}`;
  const method =
    METHOD_LABELS[session.method]
    || (session.method ? session.method.replace(/_/g, ' ') : null);
  if (method) return `via ${method.toLowerCase()}`;
  return null;
}

export function getAccessSessionLocationDisplay(
  session: AccessSession,
  options: { hideFacility: boolean },
): { primary: string; secondary: string | null } {
  const unit = trimDisplay(session.unit_number);
  const unitLabel = unit ? `Unit ${unit}` : null;
  const device = trimDisplay(session.device_name) || trimDisplay(session.device_serial);

  if (options.hideFacility) {
    return {
      primary: unitLabel || device || '—',
      secondary: unitLabel ? device : null,
    };
  }

  const facility = trimDisplay(session.facility_name) || 'Unknown facility';
  return {
    primary: facility,
    secondary: unitLabel || device,
  };
}

/**
 * Primary subject for the first sessions column: unit, else device,
 * else a keypad/access-point description when there is no unit.
 */
export function getAccessSessionSubjectDisplay(
  session: AccessSession,
  options: { hideFacility: boolean },
): { primary: string; secondary: string | null; linkUnit: boolean } {
  const unit = trimDisplay(session.unit_number);
  if (unit) {
    const device = trimDisplay(session.device_name) || trimDisplay(session.device_serial);
    return {
      primary: `Unit ${unit}`,
      secondary: options.hideFacility ? device : (trimDisplay(session.facility_name) || device),
      linkUnit: true,
    };
  }

  const meta = getAccessSessionMetadata(session);
  const keypadHint =
    typeof meta.keypad === 'string'
      ? trimDisplay(meta.keypad)
      : (meta.keypad && typeof meta.keypad === 'object' && 'label' in (meta.keypad as object)
        ? trimDisplay(String((meta.keypad as { label?: unknown }).label))
        : null);
  const description = trimDisplay(meta.description);
  const deviceLocation = trimDisplay(meta.device?.location);
  const device =
    trimDisplay(session.device_name)
    || trimDisplay(meta.device?.name)
    || trimDisplay(session.device_serial);

  if (session.method === 'keypad' || session.method === 'pin' || session.device_type === 'access_control') {
    return {
      primary: keypadHint || description || deviceLocation || device || 'Keypad',
      secondary: options.hideFacility ? null : trimDisplay(session.facility_name),
      linkUnit: false,
    };
  }

  return {
    primary: device || deviceLocation || description || '—',
    secondary: options.hideFacility ? null : trimDisplay(session.facility_name),
    linkUnit: false,
  };
}

export type AccessSessionPresentationMetadata = {
  tenant_unlock_override?: {
    reason?: string;
    reason_label?: string;
    notes?: string | null;
  };
  occupied_unit_override?: boolean;
  description?: string;
  keypad?: unknown;
  route_pass?: unknown;
  device?: {
    name?: string;
    location?: string;
  };
  [key: string]: unknown;
};

export function getAccessSessionMetadata(
  session: AccessSession,
): AccessSessionPresentationMetadata {
  return (session.metadata || {}) as AccessSessionPresentationMetadata;
}

export function hasSessionOccupiedOverride(session: AccessSession): boolean {
  const meta = getAccessSessionMetadata(session);
  if (meta.occupied_unit_override === true) return true;
  return Boolean(
    meta.tenant_unlock_override?.reason || meta.tenant_unlock_override?.reason_label,
  );
}

export function getSessionOverrideReasonLabel(session: AccessSession): string | null {
  if (!hasSessionOccupiedOverride(session)) return null;
  const override = getAccessSessionMetadata(session).tenant_unlock_override;
  const reasonLabel = trimDisplay(override?.reason_label);
  if (reasonLabel) return reasonLabel;
  const reasonCode = trimDisplay(override?.reason);
  if (!reasonCode) return null;
  return reasonCode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Inter-step delta label between two ISO timestamps. */
export function formatStepDelta(
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): string | null {
  const from = parseInstant(fromIso ?? undefined);
  const to = parseInstant(toIso ?? undefined);
  if (!from || !to) return null;
  const deltaSec = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
  return formatOpenDuration(deltaSec);
}

export function getAccessSessionOutcomePillClass(tone: AccessSessionOutcomeDisplay['tone']): string {
  switch (tone) {
    case 'pending':
      return 'bg-[#147FD4]/12 text-[#0F6BB3] dark:bg-sky-900/35 dark:text-sky-300 animate-pulse';
    case 'open':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 animate-pulse';
    case 'open_stale':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/35 dark:text-rose-300 animate-pulse';
    case 'open_critical':
      return 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300/80 dark:bg-rose-500 dark:text-white dark:ring-rose-400/50 animate-pulse';
    case 'success':
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
    case 'timed_out':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'failed':
    default:
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-400';
  }
}

export function getAccessSessionTitleToneClass(session: AccessSession, nowMs = Date.now()): string {
  if (session.state === 'denied' || session.state === 'failed') {
    return 'text-red-600 dark:text-red-400';
  }
  if (session.state === 'timed_out') {
    return 'text-amber-800 dark:text-amber-300';
  }
  const openEscalation = getAccessSessionOpenEscalation(session, nowMs);
  if (openEscalation === 'critical') {
    return 'text-rose-700 dark:text-rose-300 font-semibold';
  }
  if (openEscalation === 'stale') {
    return 'text-red-600 dark:text-red-400';
  }
  if (hasSessionOccupiedOverride(session)) {
    return 'text-amber-800 dark:text-amber-300';
  }
  if (session.state === 'pending') {
    return 'text-[#147FD4] dark:text-sky-400';
  }
  if (session.state === 'open' || session.state === 'closed') {
    return 'text-green-600 dark:text-green-400';
  }
  return 'text-gray-600 dark:text-gray-400';
}

export function getAccessSessionIconTileClass(session: AccessSession, nowMs = Date.now()): string {
  if (session.state === 'denied' || session.state === 'failed') {
    return 'bg-red-100 dark:bg-red-900/40';
  }
  if (session.state === 'timed_out') {
    return 'bg-amber-100 dark:bg-amber-900/45';
  }
  const openEscalation = getAccessSessionOpenEscalation(session, nowMs);
  if (openEscalation === 'critical') {
    return 'bg-rose-600 text-white dark:bg-rose-500 ring-2 ring-rose-300/70 dark:ring-rose-400/40';
  }
  if (openEscalation === 'stale') {
    return 'bg-red-100 dark:bg-red-900/40';
  }
  if (hasSessionOccupiedOverride(session)) {
    return 'bg-amber-100 dark:bg-amber-900/45';
  }
  if (session.state === 'open') {
    return 'bg-emerald-100 dark:bg-emerald-900/40';
  }
  if (session.state === 'pending') {
    return 'bg-sky-100 dark:bg-sky-900/40';
  }
  return 'bg-green-100 dark:bg-green-900/40';
}

/** Full-row wash for long-open sessions (page table / widget). */
export function getAccessSessionEscalationRowClass(
  session: AccessSession,
  nowMs = Date.now(),
): string {
  const escalation = getAccessSessionOpenEscalation(session, nowMs);
  if (escalation === 'critical') {
    return 'bg-rose-100/90 dark:bg-rose-950/55 hover:bg-rose-100 dark:hover:bg-rose-950/70';
  }
  if (escalation === 'stale') {
    return 'bg-rose-50/80 dark:bg-rose-950/30 hover:bg-rose-50 dark:hover:bg-rose-950/45';
  }
  return '';
}
