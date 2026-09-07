import type { BuildingManager } from '../BuildingManager';
import type { SceneManager } from '../SceneManager';
import type { GridPosition, Orientation, PlacedObject } from '../types';

export interface ApplyBuildingTranslationDeps {
  buildingManager: Pick<BuildingManager, 'getBuildingCells' | 'translateBuilding'>;
  sceneManager: Pick<SceneManager, 'getAllPlacedObjects'>;
  /**
   * Applies grid/object move without history (e.g. `moveObjectInternal` from placement).
   */
  movePlacedObjectForTranslate: (
    objectId: string,
    newPosition: GridPosition,
    orientation: Orientation
  ) => void;
}

/**
 * Translates a building in the building manager, then moves every placed object that
 * belonged to its footprint or references `buildingId`, matching `BluDesignEngine.translateBuilding`.
 */
export function applyBuildingTranslation(
  buildingId: string,
  deltaX: number,
  deltaZ: number,
  deps: ApplyBuildingTranslationDeps
): void {
  const oldCells = deps.buildingManager.getBuildingCells(buildingId);

  const objectsToMove: PlacedObject[] = [];
  for (const obj of deps.sceneManager.getAllPlacedObjects()) {
    const objCellKey = `${Math.floor(obj.position.x)},${Math.floor(obj.position.z)}`;
    if (oldCells.has(objCellKey) || obj.buildingId === buildingId) {
      objectsToMove.push(obj);
    }
  }

  deps.buildingManager.translateBuilding(buildingId, deltaX, deltaZ);

  for (const obj of objectsToMove) {
    const newPosition: GridPosition = {
      x: obj.position.x + deltaX,
      z: obj.position.z + deltaZ,
      y: obj.position.y,
    };
    deps.movePlacedObjectForTranslate(obj.id, newPosition, obj.orientation);
  }
}
