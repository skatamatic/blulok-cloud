/**
 * Remote unlock is only offered when the device reports fully locked.
 * Transitional states block new commands.
 */
export function canRequestRemoteUnlock(lockStatus: string | undefined): boolean {
  return lockStatus === 'locked';
}

export type RemoteUnlockDisabledReasonInput = {
  hasDevice?: boolean;
  remoteSupported?: boolean;
  lockStatus?: string;
  deviceStatus?: string | null;
  isSubmitting?: boolean;
};

/**
 * Device must be online (or low-battery but still reachable) before cloud unlock is offered.
 * Unknown/missing status does not block — avoids false negatives while telemetry loads.
 */
export function isDeviceReachableForRemoteUnlock(deviceStatus: string | undefined | null): boolean {
  const key = (deviceStatus ?? '').toLowerCase().trim();
  if (!key) return true;
  return key === 'online' || key === 'low_battery';
}

/**
 * Human-readable reason when remote unlock cannot be used. Returns null when unlock is allowed.
 */
export function getRemoteUnlockDisabledReason(
  input: RemoteUnlockDisabledReasonInput,
): string | null {
  const {
    hasDevice = true,
    remoteSupported = true,
    lockStatus,
    deviceStatus,
    isSubmitting = false,
  } = input;

  if (!hasDevice) return 'No BluLok device linked';
  if (!remoteSupported) return 'Remote unlock not supported on this lock';

  const deviceKey = (deviceStatus ?? '').toLowerCase().trim();
  if (deviceKey === 'offline') return 'Device is offline';
  if (deviceKey === 'error') return 'Device reported an error';
  if (deviceKey === 'maintenance') return 'Device is in maintenance';
  if (deviceKey && !isDeviceReachableForRemoteUnlock(deviceStatus)) {
    return 'Device is not available for remote unlock';
  }

  if (isSubmitting || isLockTransitionPending(lockStatus)) return 'Unlock in progress';

  if (lockStatus === 'unlocked') return 'Already unlocked';
  if (lockStatus === 'error') return 'Lock reported an error';

  if (canRequestRemoteUnlock(lockStatus)) return null;

  return 'Unlock unavailable';
}

export function canExecuteRemoteUnlock(input: RemoteUnlockDisabledReasonInput): boolean {
  return getRemoteUnlockDisabledReason(input) === null;
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
