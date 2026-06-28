/** In-memory only — resets when the simulator app restarts. */
let skipDeviceDeleteConfirm = false;

export function shouldConfirmDeviceDelete(): boolean {
  return !skipDeviceDeleteConfirm;
}

export function setSkipDeviceDeleteConfirmForSession(skip: boolean): void {
  skipDeviceDeleteConfirm = skip;
}

/** Test helper */
export function resetDeviceDeleteConfirmSession(): void {
  skipDeviceDeleteConfirm = false;
}
