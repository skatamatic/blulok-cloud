/** Time to wait for hardware/gateway to report a settled lock state after a remote command. */
export const LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS = 10_000;

const HARDWARE_FAILURE_STATUSES = new Set(['error', 'maintenance']);

/**
 * After attempting to reach `settledTarget`, returns whether `current` still looks unresolved
 * (no confirmed settled state within the feedback window).
 * Treats `error` / `maintenance` as stuck when waiting for a settled lock/unlock.
 */
export function isLockFeedbackStuck(
  settledTarget: 'unlocked' | 'locked',
  current: string | undefined,
): boolean {
  if (!current) return false;
  if (HARDWARE_FAILURE_STATUSES.has(current)) {
    return true;
  }
  if (settledTarget === 'unlocked') {
    return current === 'unlocking' || current === 'locking' || current === 'locked';
  }
  return current === 'locking' || current === 'unlocking' || current === 'unlocked';
}

/**
 * Starts a timer; when it fires, invokes `onTimedOut` if `getLockStatus()` still looks stuck
 * for the requested settled state. Returns cancel function.
 */
export function startLockHardwareFeedbackWatch(
  settledTarget: 'unlocked' | 'locked',
  getLockStatus: () => string | undefined,
  onTimedOut: () => void,
  timeoutMs: number = LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS,
): () => void {
  return startHardwareAckWatch(
    () => isLockFeedbackStuck(settledTarget, getLockStatus()),
    onTimedOut,
    timeoutMs,
  );
}

/**
 * Generic hardware-ack wait: `isStillPending` should return true if the UI is still waiting
 * for confirmation (e.g. gate still closed after an open command).
 */
export function startHardwareAckWatch(
  isStillPending: () => boolean,
  onTimedOut: () => void,
  timeoutMs: number = LOCK_HARDWARE_FEEDBACK_TIMEOUT_MS,
): () => void {
  const id = window.setTimeout(() => {
    if (isStillPending()) {
      onTimedOut();
    }
  }, timeoutMs);
  return () => clearTimeout(id);
}
