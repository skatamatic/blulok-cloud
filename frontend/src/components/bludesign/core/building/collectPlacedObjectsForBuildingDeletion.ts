import type { PlacedObject } from '../types';

/**
 * Objects to remove when deleting a building: anything in `buildingCells` or tagged with `buildingId`.
 */
export function collectPlacedObjectsForBuildingDeletion(
  buildingId: string,
  buildingCells: Set<string>,
  placedObjects: readonly PlacedObject[]
): PlacedObject[] {
  const objectsToDelete: PlacedObject[] = [];

  for (const obj of placedObjects) {
    const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
    if (buildingCells.has(objCellKey) || obj.buildingId === buildingId) {
      objectsToDelete.push(obj);
    }
  }

  return objectsToDelete;
}
