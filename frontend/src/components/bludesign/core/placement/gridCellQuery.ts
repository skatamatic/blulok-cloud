import type { PlacedObject } from '../types';

/**
 * Placed object ids whose **origin cell** (floored grid position) matches `(x, z)` on `floor`.
 * Matches `BluDesignEngine.getObjectsAtCell` behavior for selection/delete coordination.
 */
export function getPlacedObjectIdsAtGridCell(
  x: number,
  z: number,
  floor: number,
  placedObjects: readonly PlacedObject[]
): string[] {
  const result: string[] = [];

  for (const obj of placedObjects) {
    if (obj.floor !== floor) continue;
    const objX = Math.floor(obj.position.x);
    const objZ = Math.floor(obj.position.z);
    if (objX === x && objZ === z) {
      result.push(obj.id);
    }
  }

  return result;
}
