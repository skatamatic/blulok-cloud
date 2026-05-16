import type { FloorDeleteActionData, FloorInsertActionData, FloorAddActionData } from '../ActionHistory';
import type { PlacedObject } from '../types';
import { FLOOR_HEIGHT } from '../types';
import type { Theme } from '../ThemeManager';

export type FloorHistoryOperationsDeps = {
  buildingManager: {
    shiftFloorLevels: (buildingId: string, fromLevel: number, delta: number) => void;
    addFloor: (buildingId: string, level: number) => void;
    removeFloor: (buildingId: string, level: number) => void;
  };
  floorManager: {
    shiftFloors: (fromLevel: number, delta: number) => void;
    shiftObjectFloors: (fromLevel: number, delta: number) => void;
    registerFloor: (level: number) => void;
    unregisterFloor: (level: number) => void;
  };
  sceneManager: {
    getAllPlacedObjects: () => PlacedObject[];
    getObject: (id: string) => { userData: { floor?: number }; position: { y: number } } | undefined;
    getObjectData: (id: string) => PlacedObject | undefined;
  };
  gridSystem: { getGridSize: () => number };
  placeObjectInternal: (o: PlacedObject) => void;
  deleteObjectInternal: (id: string) => void;
  syncBuildingsState: () => void;
  applyThemeToScene: (theme: Theme) => void;
  getActiveSkinTheme: () => Theme;
  floorObjectReplication: {
    addVerticalShaftsToNewFloor: (level: number) => void;
  };
  setFloorLevel: (level: number) => void;
};

/**
 * Undo/redo side effects for floor add/delete/insert history actions (engine-delegated).
 */
export class FloorHistoryOperations {
  constructor(private readonly deps: FloorHistoryOperationsDeps) {}

  undoFloorAdd(data: FloorAddActionData): void {
    this.deps.buildingManager.removeFloor(data.buildingId, data.floor.level);
    this.deps.floorManager.unregisterFloor(data.floor.level);
    this.deps.syncBuildingsState();
  }

  redoFloorAdd(data: FloorAddActionData): void {
    this.deps.buildingManager.addFloor(data.buildingId, data.floor.level);
    this.deps.floorManager.registerFloor(data.floor.level);
    this.deps.syncBuildingsState();
    this.deps.floorObjectReplication.addVerticalShaftsToNewFloor(data.floor.level);
    const activeTheme = this.deps.getActiveSkinTheme();
    this.deps.applyThemeToScene(activeTheme);
  }

  undoFloorDelete(data: FloorDeleteActionData): void {
    this.deps.buildingManager.shiftFloorLevels(
      data.buildingId,
      data.floor.level,
      1
    );
    this.deps.floorManager.shiftFloors(data.floor.level, 1);
    this.deps.floorManager.shiftObjectFloors(data.floor.level, 1);

    for (const objData of this.deps.sceneManager.getAllPlacedObjects()) {
      if (objData.floor !== undefined && objData.floor >= data.floor.level) {
        objData.floor += 1;
      }
    }

    this.deps.buildingManager.addFloor(data.buildingId, data.floor.level);
    this.deps.floorManager.registerFloor(data.floor.level);

    for (const obj of data.deletedObjects) {
      this.deps.placeObjectInternal(obj);
    }

    this.deps.syncBuildingsState();
    const activeTheme = this.deps.getActiveSkinTheme();
    this.deps.applyThemeToScene(activeTheme);
  }

  redoFloorDelete(data: FloorDeleteActionData): void {
    for (const obj of data.deletedObjects) {
      this.deps.deleteObjectInternal(obj.id);
    }

    this.deps.buildingManager.removeFloor(data.buildingId, data.floor.level);
    this.deps.floorManager.unregisterFloor(data.floor.level);

    this.deps.buildingManager.shiftFloorLevels(
      data.buildingId,
      data.floor.level + 1,
      -1
    );
    this.deps.floorManager.shiftFloors(data.floor.level + 1, -1);
    this.deps.floorManager.shiftObjectFloors(data.floor.level + 1, -1);

    for (const objData of this.deps.sceneManager.getAllPlacedObjects()) {
      if (objData.floor !== undefined && objData.floor > data.floor.level) {
        objData.floor -= 1;
      }
    }

    this.deps.syncBuildingsState();
  }

  undoFloorInsert(data: FloorInsertActionData): void {
    this.deps.buildingManager.removeFloor(data.buildingId, data.insertLevel);
    this.deps.floorManager.unregisterFloor(data.insertLevel);

    this.deps.buildingManager.shiftFloorLevels(
      data.buildingId,
      data.insertLevel + 1,
      -1
    );
    this.deps.floorManager.shiftFloors(data.insertLevel + 1, -1);

    for (const shifted of data.shiftedObjects) {
      const mesh = this.deps.sceneManager.getObject(shifted.id);
      const objData = this.deps.sceneManager.getObjectData(shifted.id);

      if (mesh && objData) {
        const gridSize = this.deps.gridSystem.getGridSize();
        objData.floor = shifted.oldFloor;
        mesh.userData.floor = shifted.oldFloor;
        mesh.position.y = shifted.oldFloor * FLOOR_HEIGHT * gridSize;
      }
    }

    this.deps.syncBuildingsState();
  }

  redoFloorInsert(data: FloorInsertActionData): void {
    this.deps.buildingManager.shiftFloorLevels(data.buildingId, data.insertLevel, 1);
    this.deps.floorManager.shiftFloors(data.insertLevel, 1);

    for (const shifted of data.shiftedObjects) {
      const mesh = this.deps.sceneManager.getObject(shifted.id);
      const objData = this.deps.sceneManager.getObjectData(shifted.id);

      if (mesh && objData) {
        const gridSize = this.deps.gridSystem.getGridSize();
        objData.floor = shifted.newFloor;
        mesh.userData.floor = shifted.newFloor;
        mesh.position.y = shifted.newFloor * FLOOR_HEIGHT * gridSize;
      }
    }

    this.deps.buildingManager.addFloor(data.buildingId, data.insertLevel);
    this.deps.floorManager.registerFloor(data.insertLevel);

    this.deps.syncBuildingsState();

    this.deps.floorObjectReplication.addVerticalShaftsToNewFloor(data.insertLevel);

    const activeTheme = this.deps.getActiveSkinTheme();
    this.deps.applyThemeToScene(activeTheme);

    this.deps.setFloorLevel(data.insertLevel);
  }
}
