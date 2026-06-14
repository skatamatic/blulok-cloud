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

/** Roles allowed to send remote unlock from dashboard / viewer surfaces. */
const REMOTE_UNLOCK_ROLES = new Set([
  'admin',
  'dev_admin',
  'facility_admin',
  'maintenance',
]);

export function canUseRemoteUnlockControls(role: string | undefined | null): boolean {
  if (!role) return false;
  return REMOTE_UNLOCK_ROLES.has(role);
}
