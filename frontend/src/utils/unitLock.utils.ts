/**
 * Remote unlock is only offered when the device reports fully locked.
 * Transitional states block new commands.
 */
export function canRequestRemoteUnlock(lockStatus: string | undefined): boolean {
  return lockStatus === 'locked';
}

/**
 * When hardware supports remote lock from the cloud, show a Lock action while unlocked.
 * All current devices default to false (unlock-only from cloud).
 */
export function canRequestRemoteLock(
  lockStatus: string | undefined,
  supportsRemoteLock: boolean | undefined,
): boolean {
  return lockStatus === 'unlocked' && supportsRemoteLock === true;
}

export function isLockTransitionPending(lockStatus: string | undefined): boolean {
  return lockStatus === 'locking' || lockStatus === 'unlocking';
}
