import type { ActionHistory } from '../ActionHistory';
import type { BuildingManager } from '../BuildingManager';
import type { FloorManager } from '../FloorManager';
import type { GridSystem } from '../GridSystem';
import type { SceneManager } from '../SceneManager';
import type { SelectionManager } from '../SelectionManager';
import type { EditorState } from '../types';

export type ClearFacilityEditorSceneDeps = {
  getState: () => EditorState;
  setWorkingGridAlignment: (alignment: null) => void;
  sceneManager: SceneManager;
  gridSystem: GridSystem;
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  selectionManager: SelectionManager;
  actionHistory: ActionHistory;
  emitStateUpdated: () => void;
  clearDraft: () => void;
};

/**
 * Removes all placed objects and buildings, resets floor/selection/history (new document).
 */
export function clearFacilityEditorScene(deps: ClearFacilityEditorSceneDeps): void {
  deps.setWorkingGridAlignment(null);

  const placedObjects = deps.sceneManager.getAllPlacedObjects();
  for (const obj of placedObjects) {
    deps.sceneManager.removeObject(obj.id);
    deps.gridSystem.clearOccupied(obj.id);
  }

  deps.buildingManager.clear();
  const state = deps.getState();
  state.buildings = [];

  state.isFloorMode = false;
  state.activeFloor = 0;
  deps.floorManager.clear();
  deps.selectionManager.setFloorMode(false, 0);

  deps.gridSystem.setGridY(0);

  deps.selectionManager.clearSelection();
  state.selection = {
    selectedIds: [],
    hoveredId: null,
    isMultiSelect: false,
  };

  deps.actionHistory.clear();

  deps.emitStateUpdated();
  deps.clearDraft();
}
