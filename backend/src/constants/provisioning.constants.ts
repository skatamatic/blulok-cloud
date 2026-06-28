/** Maximum facility provisioning file size (500 MB). */
export const PROVISIONING_MAX_SIZE_MB = 500;
export const PROVISIONING_MAX_SIZE_BYTES = PROVISIONING_MAX_SIZE_MB * 1024 * 1024;

/** Internal prepare/complete rate limit per facility (requests per window). */
export const PROVISIONING_UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
export const PROVISIONING_UPLOAD_RATE_LIMIT_MAX = 30;

/** Pending prepare session TTL before storage cleanup (ms). */
export const PROVISIONING_PENDING_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;

/** Min percent change between persisted recovery push progress events. */
export const RECOVERY_PROGRESS_EVENT_PERCENT_STEP = 5;

/** Cloud → bound production gateway: push live inventory before recovery snapshot build. */
export const GATEWAY_INVENTORY_SYNC_REQUEST_MESSAGE_TYPE = 'INVENTORY_SYNC_REQUEST';

/** Max wait for production gateway to complete pre-snapshot inventory seed. */
export const PRODUCTION_INVENTORY_SEED_TIMEOUT_MS = 30_000;
