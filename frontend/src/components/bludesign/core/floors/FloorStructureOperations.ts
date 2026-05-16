/**
 * Building + floor manager orchestration for add / delete / insert floor flows.
 * Side effects are injected via {@link FloorStructureOperationsApi}.
 */

import type { Floor, PlacedObject } from '../types';

export interface FloorStructureOperationsApi {
  getFirstBuildingId(): string | null;
  getFloor(buildingId: string, level: number): Floor | undefined;
  listPlacedObjectsOnFloor(level: number): PlacedObject[];
  deleteObjectInternal(id: string): void;
  removeFloorFromBuilding(buildingId: string, level: number): Floor | null;
  shiftBuildingFloorLevels(buildingId: string, fromLevel: number, delta: number): void;
  shiftObjectFloors(fromLevel: number, delta: number): Array<{
    id: string;
    oldFloor: number;
    newFloor: number;
  }>;
  getObjectData(id: string): PlacedObject | null | undefined;
  unregisterFloor(level: number): void;
  shiftFloors(fromLevel: number, delta: number): void;
  pushFloorDelete(buildingId: string, removedFloor: Floor, objectsOnFloor: PlacedObject[]): void;
  pushFloorInsert(
    buildingId: string,
    newFloor: Floor,
    insertLevel: number,
    shiftedObjects: Array<{ id: string; oldFloor: number; newFloor: number }>,
  ): void;
  pushFloorAdd(buildingId: string, newFloor: Floor): void;
  addFloorToBuilding(buildingId: string, atLevel: number): Floor;
  registerFloor(level: number): void;
  /** Vertical shafts + optional non-shaft copy from another floor */
  seedNewFloorContents(level: number, copyFromFloor?: number): void;
  applyActiveSkinThemeToScene(): void;
  /** Same as {@link BluDesignEngine.setFloor} — navigates editor to a floor */
  navigateToFloor(level: number): void;
  syncBuildingsFromManager(): void;
  emitStateUpdated(): void;
  scheduleAutoSave(): void;
}

export class FloorStructureOperations {
  constructor(private readonly api: FloorStructureOperationsApi) {}

  /**
   * Append a new floor to the first building (shafts, optional copy, theme, navigate).
   */
  addFloor(level: number, copyFromFloor?: number): void {
    const buildingId = this.api.getFirstBuildingId();
    if (!buildingId) return;

    const newFloor = this.api.addFloorToBuilding(buildingId, level);
    this.api.registerFloor(level);
    this.api.pushFloorAdd(buildingId, newFloor);

    this.api.syncBuildingsFromManager();
    this.api.seedNewFloorContents(level, copyFromFloor);
    this.api.applyActiveSkinThemeToScene();
    this.api.navigateToFloor(level);
    this.api.scheduleAutoSave();
  }

  deleteFloor(level: number): void {
    const buildingId = this.api.getFirstBuildingId();
    if (!buildingId) return;

    const floor = this.api.getFloor(buildingId, level);
    if (!floor) return;

    const objectsOnFloor = this.api.listPlacedObjectsOnFloor(level);

    objectsOnFloor.forEach((obj) => {
      this.api.deleteObjectInternal(obj.id);
    });

    const removedFloor = this.api.removeFloorFromBuilding(buildingId, level);
    if (!removedFloor) return;

    this.api.shiftBuildingFloorLevels(buildingId, level + 1, -1);

    const shiftedObjects = this.api.shiftObjectFloors(level + 1, -1);

    shiftedObjects.forEach((shifted) => {
      const objData = this.api.getObjectData(shifted.id);
      if (objData) {
        objData.floor = shifted.newFloor;
      }
    });

    this.api.unregisterFloor(level);
    this.api.shiftFloors(level + 1, -1);

    this.api.pushFloorDelete(buildingId, removedFloor, objectsOnFloor);

    this.api.syncBuildingsFromManager();
    this.api.emitStateUpdated();
    this.api.scheduleAutoSave();
  }

  insertFloor(atLevel: number): void {
    const buildingId = this.api.getFirstBuildingId();
    if (!buildingId) return;

    this.api.shiftBuildingFloorLevels(buildingId, atLevel, 1);

    const shiftedObjects = this.api.shiftObjectFloors(atLevel, 1);

    shiftedObjects.forEach((shifted) => {
      const objData = this.api.getObjectData(shifted.id);
      if (objData) {
        objData.floor = shifted.newFloor;
      }
    });

    this.api.shiftFloors(atLevel, 1);

    const newFloor = this.api.addFloorToBuilding(buildingId, atLevel);
    this.api.registerFloor(atLevel);

    this.api.seedNewFloorContents(atLevel);

    this.api.pushFloorInsert(buildingId, newFloor, atLevel, shiftedObjects);

    this.api.applyActiveSkinThemeToScene();

    this.api.navigateToFloor(atLevel);

    this.api.syncBuildingsFromManager();
    this.api.emitStateUpdated();
    this.api.scheduleAutoSave();
  }
}
