/** Default remote lock/unlock hardware-ack timeout for a facility (seconds). */
export const DEFAULT_LOCK_COMMAND_TIMEOUT_SEC = 10;

/** 0 = one-shot command (no transitional unlocking/locking state). */
export const MIN_LOCK_COMMAND_TIMEOUT_SEC = 0;

export const MAX_LOCK_COMMAND_TIMEOUT_SEC = 3600;
