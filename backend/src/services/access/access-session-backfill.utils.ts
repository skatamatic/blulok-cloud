/**
 * Pure helpers for access-session historical backfill.
 * Kept separate from the service so correlation rules are unit-testable without DB.
 */

export const BACKFILL_DEFAULT_DAYS = 90;
export const BACKFILL_MAX_DAYS = 365;
export const BACKFILL_LOCK_ATTACH_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BACKFILL_ADVISORY_LOCK_KEY = 'access_session_backfill';
/** Non-blocking: concurrent backfills fail fast instead of stacking. */
export const BACKFILL_ADVISORY_LOCK_TIMEOUT_SEC = 0;
export const BACKFILL_LOAD_BATCH_SIZE = 2000;

const TERMINAL_STATES = new Set(['closed', 'denied', 'timed_out', 'failed']);

export type ActivityRowLike = {
  id: string;
  activity_type: string;
  device_id: string | null;
  occurred_at: Date | string;
  metadata?: unknown;
};

export function parseActivityMeta(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

export function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function clampBackfillDays(days: number | undefined): number {
  if (!days || days <= 0) return BACKFILL_DEFAULT_DAYS;
  return Math.min(days, BACKFILL_MAX_DAYS);
}

export function isDuplicateKeyError(err: unknown): boolean {
  const record = err as { code?: string; errno?: number } | null;
  return record?.code === 'ER_DUP_ENTRY' || record?.errno === 1062;
}

export function isForeignKeyError(err: unknown): boolean {
  const record = err as { code?: string; errno?: number } | null;
  return record?.code === 'ER_NO_REFERENCED_ROW_2' || record?.errno === 1452;
}

export function isTerminalAccessSessionState(state: string): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Whether an existing session row should have its lifecycle fields overwritten
 * by a backfill proposal. Protects live pending/open sessions from grant-only
 * historical rows that would otherwise force `closed`.
 */
export function shouldAdvanceExistingSession(
  existingState: string,
  proposed: { state: string; openedAt: Date | null; closedAt: Date | null },
): boolean {
  if (existingState === 'pending') {
    if (proposed.state === 'open' && proposed.openedAt) return true;
    if (proposed.state === 'closed' && proposed.closedAt) return true;
    if (proposed.state === 'failed' || proposed.state === 'timed_out') return true;
    return false;
  }
  if (existingState === 'open') {
    return proposed.state === 'closed' && Boolean(proposed.closedAt);
  }
  // Terminal: only enrich when we have new open/close evidence
  return Boolean(proposed.closedAt || proposed.openedAt);
}

export function resolveRemoteBackfillState(input: {
  hasUnlock: boolean;
  hasLock: boolean;
  grantResult?: string | null;
  grantMeta?: Record<string, unknown>;
}): { state: string; outcome: string | null } {
  if (input.hasLock) {
    return { state: 'closed', outcome: 'granted' };
  }
  if (input.hasUnlock) {
    return { state: 'open', outcome: 'granted' };
  }
  if (input.grantResult === 'failure') {
    const denial = input.grantMeta?.denial_reason;
    if (denial === 'timeout') {
      return { state: 'timed_out', outcome: 'failed' };
    }
    return { state: 'failed', outcome: 'failed' };
  }
  // Grant-only success in history: terminal closed (not pending — that is for live waits).
  return { state: 'closed', outcome: 'granted' };
}

export function findLockInWindow<T extends ActivityRowLike>(
  rows: T[],
  deviceId: string,
  unlockAt: Date,
  claimed: Set<string>,
  windowMs: number = BACKFILL_LOCK_ATTACH_WINDOW_MS,
): T | undefined {
  const unlockMs = unlockAt.getTime();
  return rows.find((r) => {
    if (r.activity_type !== 'lock' || r.device_id !== deviceId || claimed.has(r.id)) return false;
    const lockAt = asDate(r.occurred_at);
    const delta = lockAt.getTime() - unlockMs;
    return delta >= 0 && delta <= windowMs;
  });
}

export function remoteCommandIdFromMeta(meta: Record<string, unknown>): string | null {
  return typeof meta.remote_command_id === 'string' ? meta.remote_command_id : null;
}

export type HostSessionLike = {
  id: string;
  device_id: string;
  kind: string;
  state: string;
  started_at: Date | string;
  opened_at?: Date | string | null;
  open_duration_sec?: number | null;
};

/** Prefer open → pending → closed host for attaching a lock (mirrors live correlator). */
export function rankHostSessionState(state: string): number {
  if (state === 'open') return 0;
  if (state === 'pending') return 1;
  if (state === 'closed') return 2;
  return 3;
}

export function pickBestHostSession<T extends HostSessionLike>(candidates: T[]): T | undefined {
  if (!candidates.length) return undefined;
  return [...candidates].sort((a, b) => {
    const rankDiff = rankHostSessionState(a.state) - rankHostSessionState(b.state);
    if (rankDiff !== 0) return rankDiff;
    return asDate(b.started_at).getTime() - asDate(a.started_at).getTime();
  })[0];
}

export function computeOpenDurationSec(
  openedAt: Date | null | undefined,
  closedAt: Date,
  fallback?: number | null,
): number | null {
  if (openedAt) {
    return Math.max(0, Math.round((closedAt.getTime() - asDate(openedAt).getTime()) / 1000));
  }
  return fallback ?? null;
}
