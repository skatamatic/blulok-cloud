/** Short window for on-site grant → physical open correlation when no facility timeout applies. */
export const ON_SITE_GRANT_TO_OPEN_TTL_SEC = 60;

/**
 * When devices/state unlock arrives before the gateway grant event, absorb a recent
 * anonymous/local open session into the grant instead of creating an orphan pending.
 */
export const ON_SITE_GRANT_ABSORB_OPEN_WINDOW_SEC = 60;

/**
 * MySQL DATETIME(0) rounds fractional seconds ≥500ms up to the next second. A grant
 * `occurred_at` taken just before that rounded `opened_at` would otherwise look
 * "in the future" and skip absorb. Allow 1s of negative age for that skew.
 */
export const ON_SITE_GRANT_ABSORB_OPEN_SKEW_MS = 1000;

/** Default poll interval for pending session expiry sweeper. */
export const ACCESS_SESSION_SWEEPER_INTERVAL_MS = 30_000;

export const ACCESS_SESSION_STATES = [
  'pending',
  'open',
  'closed',
  'timed_out',
  'denied',
  'failed',
] as const;

export const ACCESS_SESSION_ORIGINS = [
  'cloud_remote',
  'on_site',
  'local',
  'system',
] as const;

export const ACCESS_SESSION_KINDS = ['access', 'lock_only'] as const;

export const ACCESS_SESSION_OUTCOMES = ['granted', 'denied', 'failed'] as const;

/** Methods that may coalesce into an open session (repeat grants while open). */
export const COALESCEABLE_GRANT_METHODS = [
  'app',
  'mobile_key',
  'keypad',
  'route_pass',
] as const;
