/**
 * Alt+Q / Alt+E held rotation: accelerates from min to max deg/s over {@link ROTATION_ACCELERATION_MS}.
 * Returns radians to apply this frame (assuming ~60fps frame step), signed by `direction`.
 */
export const ROTATION_ACCELERATION_MS = 1500;

const MIN_DEGREES_PER_SECOND = 5;
const MAX_DEGREES_PER_SECOND = 45;
/** Assumed frame duration for discrete key-repeat / tick steps (matches prior engine behavior). */
const FRAME_TIME_SEC = 1 / 60;

/**
 * @param holdStartTimeMs — `Date.now()` when the key was pressed
 * @param direction — +1 clockwise, -1 counter-clockwise
 * @param nowMs — injectable clock (e.g. `Date.now()`)
 */
export function keyboardHeldRotationDeltaRadians(
  holdStartTimeMs: number,
  direction: number,
  nowMs: number
): number {
  const holdDuration = nowMs - holdStartTimeMs;
  const t = Math.min(holdDuration / ROTATION_ACCELERATION_MS, 1);
  const degreesPerSecond =
    MIN_DEGREES_PER_SECOND +
    (MAX_DEGREES_PER_SECOND - MIN_DEGREES_PER_SECOND) * t;
  const degreesPerFrame = degreesPerSecond * FRAME_TIME_SEC;
  return (degreesPerFrame * Math.PI) / 180 * direction;
}
