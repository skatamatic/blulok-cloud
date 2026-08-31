import { Orientation, PlacedObject } from '../types';

/**
 * Euler Y rotation from discrete orientation (world up = Y).
 */
export function getRotationFromOrientation(orientation: Orientation): number {
  switch (orientation) {
    case Orientation.NORTH:
      return 0;
    case Orientation.EAST:
      return Math.PI / 2;
    case Orientation.SOUTH:
      return Math.PI;
    case Orientation.WEST:
      return -Math.PI / 2;
    default:
      return 0;
  }
}

/**
 * Prefer explicit `rotation` when present; otherwise orientation-based rotation.
 */
export function getEffectiveRotation(obj: PlacedObject): number {
  if (obj.rotation !== undefined) {
    return obj.rotation;
  }
  return getRotationFromOrientation(obj.orientation);
}
