import type { EditorState } from '../types';
import type { SceneManager } from '../SceneManager';
import type { BuildingManager } from '../BuildingManager';
import type { GridSystem } from '../GridSystem';
import type { FloorManager } from '../FloorManager';
import type { SelectionManager } from '../SelectionManager';
import type { GroundTileManager } from '../GroundTileManager';
import { collectPlacedObjectsForBuildingDeletion } from '../building/collectPlacedObjectsForBuildingDeletion';
import { collectGroundObjectIdsOverlappingCells } from '../manipulation';

export interface RemovePlacedObjectWithoutHistoryDeps {
  objectId: string;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  groundTileManager: GroundTileManager;
  gridSystem: GridSystem;
  state: EditorState;
  emitSelectionChanged: (selection: EditorState['selection']) => void;
}

/**
 * Deletes a placed object from scene/grid without history (undo core path).
 */
export function removePlacedObjectWithoutHistory(deps: RemovePlacedObjectWithoutHistoryDeps): void {
  const objectData = deps.sceneManager.getObjectData(deps.objectId);
  if (objectData?.wallAttachment) {
    const openingId = `opening-${deps.objectId}`;
    deps.buildingManager.removeWallOpening(objectData.wallAttachment.wallId, openingId);
  }

  deps.groundTileManager.removeTile(deps.objectId);
  deps.sceneManager.removeObject(deps.objectId);
  deps.gridSystem.clearOccupied(deps.objectId);

  const selectionIndex = deps.state.selection.selectedIds.indexOf(deps.objectId);
  if (selectionIndex >= 0) {
    deps.state.selection.selectedIds.splice(selectionIndex, 1);
    deps.emitSelectionChanged(deps.state.selection);
  }
}

export interface RemoveGroundTilesAtCellsDeps {
  cells: Array<{ x: number; z: number }>;
  sceneManager: Pick<SceneManager, 'getAllPlacedObjects'>;
  deleteObjectInternal: (objectId: string) => void;
}

/**
 * Removes pavement/grass/gravel overlaps when a building footprint is placed.
 */
export function removeGroundTilesAtCells(deps: RemoveGroundTilesAtCellsDeps): void {
  const ids = collectGroundObjectIdsOverlappingCells(
    deps.cells,
    deps.sceneManager.getAllPlacedObjects()
  );
  for (const objectId of ids) {
    deps.deleteObjectInternal(objectId);
  }
}

export interface DeleteBuildingWithContentsDeps {
  buildingId: string;
  buildingManager: BuildingManager;
  sceneManager: Pick<SceneManager, 'getAllPlacedObjects'>;
  floorManager: FloorManager;
  selectionManager: SelectionManager;
  state: Pick<EditorState, 'buildings' | 'isFloorMode' | 'activeFloor'>;
  emitStateUpdated: () => void;
  deleteObjectInternal: (objectId: string) => void;
}

/**
 * Deletes all objects in a building footprint then removes the building mesh state.
 */
export function deleteBuildingWithContentsFromScene(deps: DeleteBuildingWithContentsDeps): void {
  const building = deps.buildingManager.getAllBuildings().find((b) => b.id === deps.buildingId);
  if (!building) return;

  const buildingCells = deps.buildingManager.getBuildingCells(deps.buildingId);
  const objectsToDelete = collectPlacedObjectsForBuildingDeletion(
    deps.buildingId,
    buildingCells,
    deps.sceneManager.getAllPlacedObjects()
  );

  for (const obj of objectsToDelete) {
    deps.deleteObjectInternal(obj.id);
  }

  deps.buildingManager.deleteBuilding(deps.buildingId);
  deps.state.buildings = deps.buildingManager.getAllBuildings();

  if (deps.state.buildings.length === 0) {
    deps.state.isFloorMode = false;
    deps.state.activeFloor = 0;
    deps.floorManager.clear();
    deps.floorManager.clearGhosting();
    deps.selectionManager.setFloorMode(false, 0);
  } else {
    deps.floorManager.applyGhosting();
  }

  deps.emitStateUpdated();
}
