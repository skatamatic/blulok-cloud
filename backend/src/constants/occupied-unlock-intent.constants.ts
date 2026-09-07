/**
 * Occupied Unit Override — on-ground (BLE / route-pass) unlock intent TTL.
 * Parity with remote one-shot attribution window.
 */
export const DEFAULT_OCCUPIED_UNLOCK_INTENT_TTL_SEC = 60;
export const MIN_OCCUPIED_UNLOCK_INTENT_TTL_SEC = 15;
export const MAX_OCCUPIED_UNLOCK_INTENT_TTL_SEC = 120;

/** Brief window to stamp the physical unlock state after access-event consumed the intent. */
export const OCCUPIED_UNLOCK_STATE_ATTRIBUTION_TTL_MS = 20_000;

/**
 * Access-event methods that may bind an on-ground occupied unlock intent.
 * Excludes admin_remote / keypad / system — those are not BLE/app unlocks.
 */
export const OCCUPIED_UNLOCK_INTENT_ACCESS_METHODS = [
  'app',
  'mobile_key',
  'route_pass',
] as const;

export type OccupiedUnlockIntentAccessMethod =
  (typeof OCCUPIED_UNLOCK_INTENT_ACCESS_METHODS)[number];

export function isOccupiedUnlockIntentAccessMethod(
  method: unknown,
): method is OccupiedUnlockIntentAccessMethod {
  return (
    typeof method === 'string'
    && (OCCUPIED_UNLOCK_INTENT_ACCESS_METHODS as readonly string[]).includes(method)
  );
}

export function occupiedUnlockIntentTtlMs(): number {
  const explicit = Number(process.env.OCCUPIED_UNLOCK_INTENT_TTL_SEC);
  const sec = Number.isFinite(explicit) && explicit > 0
    ? explicit
    : DEFAULT_OCCUPIED_UNLOCK_INTENT_TTL_SEC;
  const clamped = Math.min(
    MAX_OCCUPIED_UNLOCK_INTENT_TTL_SEC,
    Math.max(MIN_OCCUPIED_UNLOCK_INTENT_TTL_SEC, Math.floor(sec)),
  );
  return clamped * 1000;
}
