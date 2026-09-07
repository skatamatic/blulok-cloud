/**
 * Firmware OTA reconnect / verify timeout defaults.
 * Runtime overrides (dev/e2e) go through FirmwareService getters.
 */

function envPositiveSecToMs(name: string): number | null {
  const explicit = Number(process.env[name]);
  if (Number.isFinite(explicit) && explicit > 0) {
    return explicit * 1000;
  }
  return null;
}

/**
 * Default grace before a transferring push fails after gateway WS drop.
 * Prefers FIRMWARE_TRANSFER_DISCONNECT_GRACE_SEC, else verify-disconnect env, else 180s.
 */
export const DEFAULT_FIRMWARE_TRANSFER_DISCONNECT_GRACE_MS =
  envPositiveSecToMs('FIRMWARE_TRANSFER_DISCONNECT_GRACE_SEC')
  ?? envPositiveSecToMs('FIRMWARE_VERIFY_DISCONNECT_GRACE_SEC')
  ?? 180_000;

/** Default grace while verifying during disconnect (gateway may be rebooting). */
export const DEFAULT_FIRMWARE_VERIFY_DISCONNECT_GRACE_MS =
  envPositiveSecToMs('FIRMWARE_VERIFY_DISCONNECT_GRACE_SEC') ?? 180_000;

/** Allowed range for PUT /api/v1/dev/firmware-timeouts overrides. */
export const FIRMWARE_TIMEOUT_OVERRIDE_MIN_MS = 100;
export const FIRMWARE_TIMEOUT_OVERRIDE_MAX_MS = 600_000;
