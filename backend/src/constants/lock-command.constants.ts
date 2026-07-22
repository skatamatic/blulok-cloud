/** Default remote lock/unlock hardware-ack timeout for a facility (seconds). */
export const DEFAULT_LOCK_COMMAND_TIMEOUT_SEC = 300;

/** 0 = one-shot command (no transitional unlocking/locking state). */
export const MIN_LOCK_COMMAND_TIMEOUT_SEC = 0;

export const MAX_LOCK_COMMAND_TIMEOUT_SEC = 3600;

/**
 * When facility timeout is 0 (one-shot), pending initiator attribution still needs a TTL
 * so a never-settled command cannot mis-attribute a later local event forever.
 * Uses the same default window as the normal hardware-ack timeout.
 */
export const ONE_SHOT_ATTRIBUTION_TTL_SEC = DEFAULT_LOCK_COMMAND_TIMEOUT_SEC;
