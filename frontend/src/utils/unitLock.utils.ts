/**
 * Remote unlock is only offered when the device reports fully locked.
 * Remote lock is not offered (physical re-lock is required on most hardware).
 * Transitional states block new commands.
 */
export function canRequestRemoteUnlock(lockStatus: string | undefined): boolean {
  return lockStatus === 'locked';
}

export function isLockTransitionPending(lockStatus: string | undefined): boolean {
  return lockStatus === 'locking' || lockStatus === 'unlocking';
}
