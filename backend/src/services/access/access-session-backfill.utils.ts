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
/** Cap rows loaded per HTTP/CLI chunk so memory stays bounded. */
export const BACKFILL_CHUNK_MAX_ROWS = 5000;
/** Default wall-clock budget for admin HTTP chunks (Cloud Run-safe). */
export const BACKFILL_HTTP_MAX_RUNTIME_MS = 45_000;
/** Emit a progress log about this often while processing. */
export const BACKFILL_PROGRESS_LOG_EVERY = 100;

const TERMINAL_STATES = new Set(['closed', 'denied', 'timed_out', 'failed']);

export type ActivityRowLike = {
  id: string;
  activity_type: string;
  device_id: string | null;
  occurred_at: Date | string;
  metadata?: unknown;
};

export type AccessSessionBackfillCursor = {
  afterOccurredAt: string;
  afterId: string;
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

/** Group lock rows by device, sorted ascending by occurred_at. */
export function indexLocksByDevice<T extends ActivityRowLike>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (row.activity_type !== 'lock' || !row.device_id) continue;
    const list = map.get(row.device_id);
    if (list) list.push(row);
    else map.set(row.device_id, [row]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => asDate(a.occurred_at).getTime() - asDate(b.occurred_at).getTime());
  }
  return map;
}

/**
 * First unclaimed lock for device in [unlockAt, unlockAt+window], using a
 * per-device sorted index (binary search + linear scan). O(log n + k).
 */
export function findLockInWindowIndexed<T extends ActivityRowLike>(
  locksByDevice: Map<string, T[]>,
  deviceId: string,
  unlockAt: Date,
  claimed: Set<string>,
  windowMs: number = BACKFILL_LOCK_ATTACH_WINDOW_MS,
): T | undefined {
  const locks = locksByDevice.get(deviceId);
  if (!locks?.length) return undefined;

  const unlockMs = unlockAt.getTime();
  const endMs = unlockMs + windowMs;

  let lo = 0;
  let hi = locks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (asDate(locks[mid].occurred_at).getTime() < unlockMs) lo = mid + 1;
    else hi = mid;
  }

  for (let i = lo; i < locks.length; i++) {
    const lock = locks[i];
    const t = asDate(lock.occurred_at).getTime();
    if (t > endMs) break;
    if (!claimed.has(lock.id)) return lock;
  }
  return undefined;
}

/** Compatibility wrapper: builds a one-shot index then searches. Prefer indexed form in hot loops. */
export function findLockInWindow<T extends ActivityRowLike>(
  rows: T[],
  deviceId: string,
  unlockAt: Date,
  claimed: Set<string>,
  windowMs: number = BACKFILL_LOCK_ATTACH_WINDOW_MS,
): T | undefined {
  return findLockInWindowIndexed(indexLocksByDevice(rows), deviceId, unlockAt, claimed, windowMs);
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

export function cursorFromActivity(row: {
  id: string;
  occurred_at: Date | string;
}): AccessSessionBackfillCursor {
  return {
    afterOccurredAt: asDate(row.occurred_at).toISOString(),
    afterId: row.id,
  };
}

export function parseBackfillCursor(
  raw: AccessSessionBackfillCursor | null | undefined,
): { afterOccurredAt: Date; afterId: string } | null {
  if (!raw?.afterOccurredAt || !raw?.afterId) return null;
  const afterOccurredAt = new Date(raw.afterOccurredAt);
  if (Number.isNaN(afterOccurredAt.getTime())) return null;
  return { afterOccurredAt, afterId: String(raw.afterId) };
}
