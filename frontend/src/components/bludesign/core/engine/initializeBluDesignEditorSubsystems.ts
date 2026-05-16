import type { PlacedObject, EditorState, FacilityData, GridAlignment } from '../types';
import type { Theme } from '../ThemeManager';
import { getThemeManager } from '../ThemeManager';
import type { SceneManager } from '../SceneManager';
import type { BuildingManager } from '../BuildingManager';
import type { FloorManager } from '../FloorManager';
import type { SelectionManager } from '../SelectionManager';
import type { PlacementManager } from '../PlacementManager';
import type { ActionHistory } from '../ActionHistory';
import type { FacilityDraftStorage } from './FacilityDraftStorage';
import { DraftAutoSaveScheduler } from './DraftAutoSaveScheduler';
import {
  FloorObjectReplication,
  FloorViewCoordinator,
  FloorStructureOperations,
} from '../floors';
import type { PlacementCompletionService } from '../placement/PlacementCompletionService';

export interface InitializeBluDesignEditorSubsystemsParams {
  debounceMs: number;
  readonly: boolean;
  state: EditorState;
  draftStorage: FacilityDraftStorage;
  sceneManager: SceneManager;
  buildingManager: BuildingManager;
  floorManager: FloorManager;
  selectionManager: SelectionManager;
  placementManager: PlacementManager;
  placementCompletion: PlacementCompletionService;
  actionHistory: ActionHistory;
  applyThemeToScene: (theme: Theme) => void;
  exportSceneData: () => FacilityData;
  emitObjectPlaced: (placed: PlacedObject) => void;
  emitStateUpdated: () => void;
  emitAutosaveComplete: (payload: { timestamp: number }) => void;
  setWorkingGridAlignment: (alignment: GridAlignment | null) => void;
  deleteObjectInternal: (id: string) => void;
  scheduleAutoSave: () => void;
}

export interface InitializedBluDesignEditorSubsystems {
  themeUnsubscribe: () => void;
  floorObjectReplication: FloorObjectReplication;
  floorViewCoordinator: FloorViewCoordinator;
  floorStructureOperations: FloorStructureOperations;
  draftAutoSave: DraftAutoSaveScheduler;
}

export function initializeBluDesignEditorSubsystems(
  p: InitializeBluDesignEditorSubsystemsParams
): InitializedBluDesignEditorSubsystems {
  const themeManager = getThemeManager();
  const themeUnsubscribe = themeManager.onThemeChange((theme) => {
    p.applyThemeToScene(theme);
  });

  const initialTheme = themeManager.getActiveSkinTheme();
  p.applyThemeToScene(initialTheme);

  const floorObjectReplication = new FloorObjectReplication({
    listObjectIds: () => Array.from(p.sceneManager.getAllObjects().keys()),
    getObjectData: (id) => p.sceneManager.getObjectData(id) ?? undefined,
    placeFromReplication: (o, a) => p.placementCompletion.placeSingleObject(o, a),
    emitObjectPlaced: (o) => p.emitObjectPlaced(o),
    historyPushBatch: (objs) => p.actionHistory.pushBatchPlace(objs),
    historyPushPlace: (o) => p.actionHistory.pushPlace(o),
  });

  const floorViewCoordinator = new FloorViewCoordinator({
    getActiveFloor: () => p.state.activeFloor,
    setActiveFloorLevel: (level) => {
      p.state.activeFloor = level;
    },
    getIsFloorMode: () => p.state.isFloorMode,
    setIsFloorMode: (isFloorMode) => {
      p.state.isFloorMode = isFloorMode;
    },
    floorManagerSetFloor: (level) => p.floorManager.setFloor(level),
    floorManagerSetFullBuildingView: (fullBuildingViewActive) =>
      p.floorManager.setFullBuildingView(fullBuildingViewActive),
    selectionSetFloorMode: (isFloorMode, activeFloor) =>
      p.selectionManager.setFloorMode(isFloorMode, activeFloor),
    onActiveFloorIndexChanged: (_previous, _next) => {
      p.setWorkingGridAlignment(null);
    },
    syncPlacementToFloor: (level) => {
      const floorY = p.floorManager.getCurrentFloorY();
      p.placementManager.setFloorY(floorY, level);
    },
    applySceneFloorGhosting: (currentFloor, isFullBuildingView) =>
      p.sceneManager.applyFloorGhosting(currentFloor, isFullBuildingView),
    emitStateUpdated: () => p.emitStateUpdated(),
  });

  const floorStructureOperations = new FloorStructureOperations({
    getFirstBuildingId: () => {
      const buildings = p.buildingManager.getAllBuildings();
      return buildings.length > 0 ? buildings[0].id : null;
    },
    getFloor: (buildingId, level) => p.buildingManager.getFloor(buildingId, level),
    listPlacedObjectsOnFloor: (level) => {
      const objectsOnFloor: PlacedObject[] = [];
      for (const objData of p.sceneManager.getAllPlacedObjects()) {
        if (objData.floor === level) {
          objectsOnFloor.push(objData);
        }
      }
      return objectsOnFloor;
    },
    deleteObjectInternal: (id) => p.deleteObjectInternal(id),
    removeFloorFromBuilding: (buildingId, level) =>
      p.buildingManager.removeFloor(buildingId, level),
    shiftBuildingFloorLevels: (buildingId, fromLevel, delta) =>
      p.buildingManager.shiftFloorLevels(buildingId, fromLevel, delta),
    shiftObjectFloors: (fromLevel, delta) =>
      p.floorManager.shiftObjectFloors(fromLevel, delta),
    getObjectData: (id) => p.sceneManager.getObjectData(id),
    unregisterFloor: (level) => p.floorManager.unregisterFloor(level),
    shiftFloors: (fromLevel, delta) => p.floorManager.shiftFloors(fromLevel, delta),
    pushFloorDelete: (buildingId, removedFloor, objectsOnFloor) =>
      p.actionHistory.pushFloorDelete(buildingId, removedFloor, objectsOnFloor),
    pushFloorInsert: (buildingId, newFloor, insertLevel, shiftedObjects) =>
      p.actionHistory.pushFloorInsert(buildingId, newFloor, insertLevel, shiftedObjects),
    pushFloorAdd: (buildingId, newFloor) => p.actionHistory.pushFloorAdd(buildingId, newFloor),
    addFloorToBuilding: (buildingId, atLevel) => p.buildingManager.addFloor(buildingId, atLevel),
    registerFloor: (level) => p.floorManager.registerFloor(level),
    seedNewFloorContents: (level, copyFromFloor) => {
      floorObjectReplication.addVerticalShaftsToNewFloor(level);
      if (copyFromFloor !== undefined) {
        floorObjectReplication.copyNonShaftContents(copyFromFloor, level);
      }
    },
    applyActiveSkinThemeToScene: () => {
      p.applyThemeToScene(getThemeManager().getActiveSkinTheme());
    },
    navigateToFloor: (level) => floorViewCoordinator.setActiveFloor(level),
    syncBuildingsFromManager: () => {
      p.state.buildings = p.buildingManager.getAllBuildings();
    },
    emitStateUpdated: () => p.emitStateUpdated(),
    scheduleAutoSave: () => p.scheduleAutoSave(),
  });

  const draftAutoSave = new DraftAutoSaveScheduler(p.debounceMs, {
    isReadonly: () => p.readonly,
    exportData: () => p.exportSceneData(),
    storage: p.draftStorage,
    onSaved: (timestamp) => {
      p.emitAutosaveComplete({ timestamp });
    },
  });

  return {
    themeUnsubscribe,
    floorObjectReplication,
    floorViewCoordinator,
    floorStructureOperations,
    draftAutoSave,
  };
}
