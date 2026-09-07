import { Orientation, type PlacedObject } from '../types';

/**
 * Snap {@link PlacedObject.orientation} to the nearest cardinal from world Y rotation (radians).
 */
export function syncPlacedObjectOrientationFromWorldYaw(
  placedObject: PlacedObject,
  rotation: number
): void {
  const normalizedRotation =
    ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (normalizedRotation < Math.PI / 4 || normalizedRotation >= (7 * Math.PI) / 4) {
    placedObject.orientation = Orientation.NORTH;
  } else if (normalizedRotation < (3 * Math.PI) / 4) {
    placedObject.orientation = Orientation.EAST;
  } else if (normalizedRotation < (5 * Math.PI) / 4) {
    placedObject.orientation = Orientation.SOUTH;
  } else {
    placedObject.orientation = Orientation.WEST;
  }
}
