/**
 * BluLok unit lock: only `locked` / `unlocked` are safe for remote toggle.
 * Other states (locking, unlocking, error, unknown) should not send a toggle command.
 */
export function isBluLokLockToggleable(lockStatus: string): boolean {
  return lockStatus === 'locked' || lockStatus === 'unlocked';
}
