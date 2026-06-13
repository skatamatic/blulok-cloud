/** Maximum gateway provisioning zip backup size (500 MB). */
export const PROVISIONING_MAX_SIZE_MB = 500;
export const PROVISIONING_MAX_SIZE_BYTES = PROVISIONING_MAX_SIZE_MB * 1024 * 1024;

/** Cloud-initiated upload request JWT validity (seconds). */
export const PROVISIONING_UPLOAD_REQUEST_TTL_SEC = 30 * 60;

/** Restore verification timeout after all chunks delivered (seconds). */
export const PROVISIONING_RESTORE_VERIFY_TIMEOUT_SEC = 300;

/** Min percent change between persisted restore progress events. */
export const PROVISIONING_RESTORE_EVENT_PERCENT_STEP = 5;

/** Internal prepare/complete rate limit per facility (requests per window). */
export const PROVISIONING_UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
export const PROVISIONING_UPLOAD_RATE_LIMIT_MAX = 30;

/** Pending prepare session TTL before GCS cleanup (ms). */
export const PROVISIONING_PENDING_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
