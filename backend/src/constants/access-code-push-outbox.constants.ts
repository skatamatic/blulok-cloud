/** Max delivery attempts before an outbox row moves to dead_letter. */
export const ACCESS_CODE_PUSH_MAX_ATTEMPTS = 10;

/** Wait for gateway ACCESS_CODE_UPDATE_ACK (ms). */
export const ACCESS_CODE_PUSH_ACK_TIMEOUT_MS = 12_000;

/** Retry backoff when delivery fails but gateway was reachable (ms). */
export const ACCESS_CODE_PUSH_RETRY_BASE_MS = 1_000;
export const ACCESS_CODE_PUSH_RETRY_MAX_MS = 60_000;

/** Re-queue in_progress rows stuck longer than ACK timeout + buffer (ms). */
export const ACCESS_CODE_PUSH_STALE_IN_PROGRESS_MS = 90_000;

/** How often the scheduler scans the outbox (ms). */
export const ACCESS_CODE_PUSH_OUTBOX_SCAN_MS = 5_000;
